import protobuf from 'protobufjs/light'

const field = (type: string, id: number, repeated = false) => ({ type, id, ...(repeated ? { rule: 'repeated' } : {}) })
const schema = protobuf.Root.fromJSON({ nested: {
  Empty: { fields: {} },
  Module: { fields: { index: field('uint32', 1), identifier: field('string', 2), uiUrls: field('string', 3, true) } },
  Listing: { fields: { subsystems: field('Module', 1, true) } },
  Call: { fields: { index: field('uint32', 1), payload: field('bytes', 2) } },
  ModuleQuery: { fields: { list: field('Empty', 1), call: field('Call', 2) } },
  ModuleReply: { fields: { list: field('Listing', 1), call: field('Call', 2) } },
  Query: { fields: { requestId: field('uint32', 1), custom: field('ModuleQuery', 100) } },
  Reply: { fields: { requestId: field('uint32', 1), custom: field('ModuleReply', 100) } },
  Envelope: { fields: { reply: field('Reply', 1) } },
  OsQuery: { fields: { getState: field('Empty', 1) } },
  OsState: { fields: { currentEffective: field('uint32', 4) } },
  Failure: { fields: { message: field('string', 1) } },
  OsReply: { fields: { error: field('Failure', 1), state: field('OsState', 2) } },
} })

export type StudioModule = { identifier: string; index: number; uiUrls?: string[] }
type Call = { index: number; payload: Uint8Array }
export type ModuleQuery = { list: Record<string, never> } | { call: Call }
export type ModuleReply = { list?: { subsystems: StudioModule[] }; call?: Call }
type Envelope = { reply?: { requestId: number; custom?: ModuleReply } }
const encode = (name: string, value: object) => schema.lookupType(name).encode(value).finish()
const decode = <Value>(name: string, data: Uint8Array) => schema.lookupType(name).decode(data) as unknown as Value

export const encodeModuleQuery = (requestId: number, custom: ModuleQuery) => encode('Query', { requestId, custom })
export const decodeModuleReply = (data: Uint8Array) => decode<Envelope>('Envelope', data).reply?.custom
export const decodeModuleQuery = (data: Uint8Array) => decode<{ requestId: number; custom?: ModuleQuery }>('Query', data)
export const encodeModuleReply = (requestId: number, custom: ModuleReply) => encode('Envelope', { reply: { requestId, custom } })
export const encodeSampleOs = () => encode('OsReply', { state: { currentEffective: 3 } })

export const moduleEditors = new Map([['cormoran__os_detection', {
  title: 'Host operating system',
  request: () => encode('OsQuery', { getState: {} }),
  display(data: Uint8Array) {
    const reply = decode<{ error?: { message: string }; state?: { currentEffective: number } }>('OsReply', data)
    if (!reply.state || reply.error) throw Error(reply.error?.message || 'The module did not return its state.')
    return ['Unknown', 'Unknown', 'Windows', 'macOS', 'Linux', 'iOS', 'Android'][reply.state.currentEffective] ?? 'Unrecognized'
  },
}]])
