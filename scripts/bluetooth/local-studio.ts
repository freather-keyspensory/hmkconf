import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { ServerResponse } from 'node:http'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
const localAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export function localStudioBluetooth(): Plugin {
  function attach(server: ViteDevServer | PreviewServer) {
    if (process.platform !== 'darwin') return
    const path = (process.env.CONFIG_BASE_PATH || '/hmkconf') + '/api/studio-bluetooth/'
    type Session = { child: ChildProcessWithoutNullStreams; device: string; pending?: ServerResponse }
    const sessions = new Map<string, Session>()
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith(path)) return next()
      const origin = req.headers.origin && URL.canParse(req.headers.origin) ? new URL(req.headers.origin) : undefined
      if (!origin || !localHosts.has(origin.hostname) || req.headers.host !== origin.host ||
          !localAddresses.has(req.socket.remoteAddress ?? '') || req.method !== 'POST') {
        res.writeHead(403).end()
        return
      }
      const [action, token, device] = req.url.slice(path.length).split('/')
      if (action === 'write' && token && uuid.test(token)) {
        const session = sessions.get(token)
        if (!session || session.pending || req.headers['content-type'] !== 'application/octet-stream') {
          res.writeHead(409).end()
          return
        }
        session.pending = res
        const chunks: Buffer[] = []
        let length = 0
        req.on('data', (chunk: Buffer) => {
          length += chunk.length
          if (length <= 65536) chunks.push(chunk)
        })
        req.on('end', () => {
          if (!length || length > 65536) {
            session.pending = undefined
            res.writeHead(400).end()
          } else session.child.stdin.write(Buffer.concat(chunks).toString('base64') + '\n')
        })
        return
      }
      const watch = action === 'discover'
      if (!watch && (action !== 'open' || !uuid.test(token ?? '') || !uuid.test(device ?? ''))) {
        res.writeHead(404).end()
        return
      }
      if (!watch && (sessions.has(token) || [...sessions.values()].some(s => s.device === device))) {
        res.writeHead(409).end('Keyboard already open in another configurator window.')
        return
      }
      const child = spawn('/usr/bin/swift', [server.config.root + '/scripts/bluetooth/studio.swift', watch ? 'discover' : device])
      const session: Session = { child, device }
      if (!watch) sessions.set(token, session)
      res.writeHead(200, {'content-type':'application/x-studio-stream', 'cache-control':'no-store'})
      res.flushHeaders()
      const lines = createInterface({input: child.stdout})
      lines.on('line', line => {
        if (line === 'written') {
          session.pending?.writeHead(204).end()
          session.pending = undefined
        } else res.write(line + '\n')
      })
      child.stderr.resume()
      child.stdin.on('error', () => child.kill())
      child.on('error', () => res.end('error macOS Bluetooth helper unavailable.\n'))
      child.on('close', () => res.end())
      res.on('close', () => {
        lines.close()
        child.kill()
        session.pending?.writeHead(410).end()
        if (!watch) sessions.delete(token)
      })
    })
  }
  return { name: 'local-studio-bluetooth', configureServer: attach, configurePreviewServer: attach }
}
