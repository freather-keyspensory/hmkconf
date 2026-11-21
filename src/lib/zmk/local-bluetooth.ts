import { base } from '$app/paths'
import type { RpcTransport } from '@zmkfirmware/zmk-studio-ts-client/transport/index'

export type LocalKeyboard = { id: string; name: string }
const api = base + '/api/studio-bluetooth/'

async function* lines(path: string, signal: AbortSignal) {
  const response = await fetch(api + path, { method: 'POST', signal })
  if (!response.ok || !response.body || response.headers.get('content-type') !== 'application/x-studio-stream') {
    throw Error(response.status === 409 ? 'Keyboard already open in another configurator window.' : 'Local Bluetooth is unavailable.')
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let partial = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const batch = (partial + value).split('\n')
      partial = batch.pop()!
      for (const line of batch) {
        if (line.startsWith('error ')) throw Error(line.slice(6))
        yield line
      }
    }
  } finally { await reader.cancel().catch(() => {}) }
}

export async function watchLocalKeyboards(signal: AbortSignal, update: (boards: LocalKeyboard[]) => void) {
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) return
  for await (const line of lines('discover', signal)) update(JSON.parse(line))
}

export async function openLocalKeyboard(board: LocalKeyboard): Promise<RpcTransport> {
  const token = crypto.randomUUID()
  const abortController = new AbortController()
  const { signal } = abortController
  const packets = lines('open/' + token + '/' + encodeURIComponent(board.id), signal)
  // A previous large layout reply may still be arriving after a fast switch.
  // Give an active drain time to finish, while promptly detecting a silent link.
  const deadline = Date.now() + 120000
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    for (;;) {
      timeout = setTimeout(() => abortController.abort(), Math.min(12000, deadline - Date.now()))
      const { value } = await packets.next()
      clearTimeout(timeout)
      if (value === 'ready') break
      if (value !== 'draining') throw Error('Could not connect to the keyboard.')
    }
  } catch (error) {
    abortController.abort()
    throw error
  } finally { clearTimeout(timeout) }
  return {
    label: board.name, abortController,
    readable: new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { value, done } = await packets.next()
        if (done) controller.close()
        else controller.enqueue(Uint8Array.from(atob(value), c => c.charCodeAt(0)))
      },
      cancel() { abortController.abort() },
    }),
    writable: new WritableStream<Uint8Array>({
      async write(bytes) {
        const reply = await fetch(api + 'write/' + token, {
          method: 'POST', signal, headers: {'Content-Type':'application/octet-stream'}, body: new Uint8Array(bytes),
        })
        if (!reply.ok) throw Error('Could not send the Studio request.')
      },
    }),
  }
}
