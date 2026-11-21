import { get_decoder } from '@zmkfirmware/zmk-studio-ts-client/framing'
import type { GetBehaviorDetailsResponse } from '@zmkfirmware/zmk-studio-ts-client/behaviors'
import type { Keymap, PhysicalLayouts } from '@zmkfirmware/zmk-studio-ts-client/keymap'
import { Request, Response, type RequestResponse } from '@zmkfirmware/zmk-studio-ts-client/studio'
import type { RpcTransport } from '@zmkfirmware/zmk-studio-ts-client/transport/index'
import { frameStudioMessage } from './studio-session'
import { decodeModuleQuery, encodeModuleReply, encodeSampleOs } from './module-protocol'

export function createSampleStudioTransport(): RpcTransport {
  const layouts: PhysicalLayouts = {
    activeLayoutIndex: 0,
    layouts: [
      { name: '2 × 3', keys: Array.from({ length: 6 }, (_, i) => key(i % 3, Math.floor(i / 3))) },
      { name: '1 × 6', keys: Array.from({ length: 6 }, (_, i) => key(i, 0)) },
    ],
  }
  const keyParameter = { name: 'Key', hidUsage: { keyboardMax: 255, consumerMax: 4095 } }
  const layerParameter = { name: 'Layer', layerId: {} }
  const behaviors: GetBehaviorDetailsResponse[] = [
    { id: 1, displayName: 'Key Press', metadata: [{ param1: [keyParameter], param2: [] }] },
    { id: 2, displayName: 'Transparent', metadata: [] },
    { id: 3, displayName: 'Momentary Layer', metadata: [{ param1: [layerParameter], param2: [] }] },
    { id: 4, displayName: 'Layer-Tap', metadata: [{ param1: [layerParameter], param2: [keyParameter] }] },
    { id: 5, displayName: 'Mod-Tap', metadata: [{ param1: [keyParameter], param2: [keyParameter] }] },
    { id: 6, displayName: 'Bluetooth', metadata: [
      { param1: [{ name: 'Next Profile', constant: 1 }], param2: [] },
      { param1: [{ name: 'Select Profile', constant: 3 }], param2: [{ name: 'Profile', range: { min: 0, max: 2 } }] },
    ] },
  ]
  let keymap: Keymap = {
    layers: ['Base', 'Numbers'].map((name, id) => ({
      name, id, bindings: Array.from({ length: 6 }, (_, i) => ({ behaviorId: 1, param1: 0x70000 + (id ? 30 : 4) + i, param2: 0 })),
    })),
    availableLayers: 0,
    maxLayerNameLength: 20,
  }
  let saved = structuredClone(keymap)
  let savedLayout = 0
  let unsaved = false

  function reply(request: Request): RequestResponse {
    const requestId = request.requestId
    const operation = request.keymap
    if (request.core?.getDeviceInfo) return { requestId, core: { getDeviceInfo: { name: 'ZMK Studio Macro Pad', serialNumber: new Uint8Array() } } }
    if (request.core?.getLockState) return { requestId, core: { getLockState: 1 } }
    if (request.behaviors?.listAllBehaviors) return { requestId, behaviors: { listAllBehaviors: { behaviors: behaviors.map(item => item.id) } } }
    if (request.behaviors?.getBehaviorDetails) return { requestId, behaviors: { getBehaviorDetails: behaviors.find(item => item.id === request.behaviors?.getBehaviorDetails?.behaviorId) } }
    if (operation?.getKeymap) return { requestId, keymap: { getKeymap: keymap } }
    if (operation?.getPhysicalLayouts) return { requestId, keymap: { getPhysicalLayouts: layouts } }
    if (operation?.checkUnsavedChanges) return { requestId, keymap: { checkUnsavedChanges: unsaved } }
    if (operation?.setLayerBinding) {
      const { layerId, keyPosition, binding } = operation.setLayerBinding
      const layer = keymap.layers.find(item => item.id === layerId)
      if (!layer?.bindings[keyPosition] || !binding) return { requestId, keymap: { setLayerBinding: 1 } }
      layer.bindings[keyPosition] = binding
      unsaved = true
      return { requestId, keymap: { setLayerBinding: 0 } }
    }
    if (operation?.setActivePhysicalLayout !== undefined && layouts.layouts[operation.setActivePhysicalLayout]) {
      layouts.activeLayoutIndex = operation.setActivePhysicalLayout
      unsaved = true
      return { requestId, keymap: { setActivePhysicalLayout: { ok: keymap } } }
    }
    if (operation?.saveChanges) {
      saved = structuredClone(keymap)
      savedLayout = layouts.activeLayoutIndex
      unsaved = false
      return { requestId, keymap: { saveChanges: { ok: true } } }
    }
    if (operation?.discardChanges) {
      keymap = structuredClone(saved)
      layouts.activeLayoutIndex = savedLayout
      unsaved = false
      return { requestId, keymap: { discardChanges: true } }
    }
    return { requestId, meta: { noResponse: true } }
  }

  const wire = new TransformStream(get_decoder())
  const responses = wire.readable.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(bytes, controller) {
      const { custom, requestId } = decodeModuleQuery(bytes)
      if (custom) {
        const result = 'list' in custom && custom.list
          ? { list: { subsystems: [{ index: 3, identifier: 'cormoran__os_detection' }] } }
          : 'call' in custom && custom.call.index === 3 ? { call: { index: 3, payload: encodeSampleOs() } } : {}
        controller.enqueue(frameStudioMessage(encodeModuleReply(requestId, result)))
        return
      }
      const response = reply(Request.decode(bytes))
      controller.enqueue(frameStudioMessage(Response.encode({ requestResponse: response }).finish()))
    },
  }))
  return { label: 'ZMK sample', abortController: new AbortController(), readable: responses, writable: wire.writable }
}

function key(x: number, y: number) {
  return { width: 100, height: 100, x: x * 100, y: y * 100, r: 0, rx: 0, ry: 0 }
}
