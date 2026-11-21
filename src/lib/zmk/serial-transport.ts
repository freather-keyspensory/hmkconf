import type { RpcTransport } from '@zmkfirmware/zmk-studio-ts-client/transport/index'

export type StudioSerialPort = {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  getInfo(): { usbVendorId?: number; usbProductId?: number }
}

type StudioSerial = EventTarget & {
  getPorts(): Promise<StudioSerialPort[]>
  requestPort(): Promise<StudioSerialPort>
}

const storageKey = 'keyspensory-studio-usb-devices'

export function studioSerial() {
  return (navigator as Navigator & { serial?: StudioSerial }).serial
}

export function usbId(port: StudioSerialPort) {
  const { usbVendorId, usbProductId } = port.getInfo()
  return usbVendorId === undefined || usbProductId === undefined ? undefined : `${usbVendorId}:${usbProductId}`
}

function knownUsbIds(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(stored) ? stored.filter(item => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function rememberStudioPort(port: StudioSerialPort) {
  const id = usbId(port)
  if (id) {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...new Set([...knownUsbIds(), id])]))
    } catch {
      // The current session still works when local storage is unavailable.
    }
  }
}

export async function knownStudioPorts(serial: StudioSerial) {
  const known = knownUsbIds()
  if (!known.length) return []
  return (await serial.getPorts()).filter(port => {
    const id = usbId(port)
    return id !== undefined && known.includes(id)
  })
}

export async function findKnownStudioPort(serial: StudioSerial) {
  const ports = await knownStudioPorts(serial)
  return ports.length === 1 ? ports[0] : undefined
}

export async function openStudioPort(port: StudioSerialPort): Promise<RpcTransport> {
  await port.open({ baudRate: 12500 })
  const { readable, writable } = port
  if (!readable || !writable) {
    await port.close()
    throw Error('The selected USB serial port is unavailable.')
  }

  const abortController = new AbortController()
  studioSerial()?.addEventListener('disconnect', event => {
    const lost = (event as Event & { port?: StudioSerialPort }).port ?? event.target
    if (lost === port) abortController.abort()
  }, { signal: abortController.signal })
  abortController.signal.addEventListener('abort', () => {
    void port.close().catch(() => {})
  }, { once: true })

  return { label: usbId(port) ?? 'USB serial', readable, writable, abortController }
}
