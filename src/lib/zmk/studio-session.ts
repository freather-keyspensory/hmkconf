import { get_decoder } from '@zmkfirmware/zmk-studio-ts-client/framing'
import { Request, Response, type Notification, type RequestResponse } from '@zmkfirmware/zmk-studio-ts-client/studio'
import type { RpcTransport } from '@zmkfirmware/zmk-studio-ts-client/transport/index'
import { encodeModuleQuery, decodeModuleReply, type ModuleQuery, type ModuleReply } from './module-protocol'

import { encodeComboRequest, decodeComboReply, type ComboRequest, type ComboReply } from './action-protocol'

type StudioReply = RequestResponse & { custom?: ModuleReply; combos?: ComboReply }

export class StudioSession {
  private reader: ReadableStreamDefaultReader<Uint8Array>
  private writer: WritableStreamDefaultWriter<Uint8Array>
  private readPipe: Promise<void>
  private nextId = 1
  private closed = false
  private pending?: {
    id: number
    extension?: 'combo' | 'module'
    received?: (size: number) => void
    timer: ReturnType<typeof setTimeout>
    resolve: (response: StudioReply) => void
    reject: (error: Error) => void
  }

  constructor(
    private transport: RpcTransport,
    private onClose: () => void,
    private onNotification: (notification: Notification) => void,
  ) {
    const framing = get_decoder()
    const decoder = new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        this.pending?.received?.(chunk.byteLength)
        return framing.transform!(chunk, controller)
      },
    })
    this.readPipe = transport.readable.pipeTo(decoder.writable, { signal: transport.abortController.signal }).catch(() => {})
    this.reader = decoder.readable.getReader()
    this.writer = transport.writable.getWriter()
    void this.read()
  }

  private async read() {
    try {
      while (!this.closed) {
        const { value, done } = await this.reader.read()
        if (done) break
        const { requestResponse, notification } = Response.decode(value)
        if (notification) this.onNotification(notification)
        if (requestResponse && this.pending?.id === requestResponse.requestId) {
          const pending = this.pending
          this.pending = undefined
          clearTimeout(pending.timer)
          if (requestResponse.meta) pending.reject(new Error('Studio rejected the request. Check the keyboard lock state.'))
          else {
            try {
              if (pending.extension === 'combo') pending.resolve({ ...requestResponse, combos: decodeComboReply(value) })
              else if (pending.extension === 'module') pending.resolve({ ...requestResponse, custom: decodeModuleReply(value) })
              else pending.resolve(requestResponse)
            }
            catch { pending.reject(new Error('Malformed Studio response.')) }
          }
        }
      }
    } catch {
      // A failed stream closes the session and rejects an outstanding request.
    } finally {
      this.close()
    }
  }

  request(request: Omit<Request, 'requestId'>, onProgress?: (bytes: number) => void): Promise<RequestResponse> {
    const largeRead = !!(request.keymap?.getPhysicalLayouts || request.keymap?.getKeymap || request.keymap?.setActivePhysicalLayout !== undefined)
    return this.exchange(id => Request.encode({ ...request, requestId: id }).finish(), undefined, largeRead, onProgress)
  }

  async moduleRequest(request: ModuleQuery) {
    const reply = await this.exchange(id => encodeModuleQuery(id, request), 'module')
    if (!reply.custom) throw Error('This firmware does not expose the custom Studio protocol.')
    return reply.custom
  }

  async comboRequest(request: ComboRequest) {
    const reply = await this.exchange(id => encodeComboRequest(id, request), 'combo')
    if (!reply.combos) throw Error('Firmware did not report editable combos.')
    return reply.combos
  }

  private exchange(encode: (id: number) => Uint8Array, extension?: 'module' | 'combo', largeRead = false, onProgress?: (bytes: number) => void): Promise<StudioReply> {
    if (this.closed || this.pending) return Promise.reject(new Error('Studio connection is unavailable.'))
    const id = this.nextId++
    const bytes = encode(id)
    return new Promise((resolve, reject) => {
      const timedOut = () => {
        if (extension) {
          this.pending = undefined
          reject(new Error('No response to the optional Studio request.'))
        } else this.close('No ZMK Studio response. Check the connection.')
      }
      // Large layout lists arrive in many BLE packets. Allow active transfers to finish.
      const deadline = Date.now() + 120_000
      let bytesReceived = 0
      const received = (size: number) => {
        if (!this.pending) return
        bytesReceived += size
        onProgress?.(bytesReceived)
        clearTimeout(this.pending.timer)
        this.pending.timer = setTimeout(timedOut, Math.min(3000, deadline - Date.now()))
      }
      this.pending = { id, extension, timer: setTimeout(timedOut, 3000), received: largeRead ? received : undefined, resolve, reject }
      void this.writer.write(frameStudioMessage(bytes)).catch(() => this.close('Could not send the Studio request.'))
    })
  }

  close(reason = 'Studio disconnected.') {
    if (this.closed) return
    this.closed = true
    if (this.pending) {
      clearTimeout(this.pending.timer)
      this.pending.reject(new Error(reason))
      this.pending = undefined
    }
    this.writer.releaseLock()
    void this.reader.cancel().catch(() => {}).then(() => {
      this.reader.releaseLock()
      return this.readPipe
    }).finally(() => this.transport.abortController.abort())
    this.onClose()
  }
}

export function frameStudioMessage(bytes: Uint8Array) {
  const frame = [0xab]
  for (const byte of bytes) {
    if (byte >= 0xab && byte <= 0xad) frame.push(0xac)
    frame.push(byte)
  }
  frame.push(0xad)
  return new Uint8Array(frame)
}
