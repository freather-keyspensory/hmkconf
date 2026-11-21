import { isViaInterface } from '$lib/via/adapter'
import { hmkHidFilter, isHmkInterface } from '$lib/keyboard/hmk-keyboard.svelte'
import { knownStudioPorts, rememberStudioPort, studioSerial, usbId, type StudioSerialPort } from '$lib/zmk/serial-transport'
import { requestStudioBluetooth, studioBluetooth, type StudioBluetoothDevice } from '$lib/zmk/bluetooth-transport'
import { watchLocalKeyboards, type LocalKeyboard } from '$lib/zmk/local-bluetooth'

type Handle = { kind: 'hid'; device: HIDDevice } | { kind: 'usb'; device: StudioSerialPort } |
  { kind: 'bluetooth'; device: StudioBluetoothDevice } | { kind: 'local'; device: LocalKeyboard }
export type FoundKeyboard = Handle & { key: string; name: string; label: string }
const namesKey = 'keyspensory-studio-device-names'
const sessionBluetooth = new Map<string, StudioBluetoothDevice>()
const handles = new WeakMap<object, number>()
let sequence = 0

function names(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(namesKey) ?? '{}') ?? {} } catch { return {} }
}
function identity(device: object) {
  if (!handles.has(device)) handles.set(device, ++sequence)
  return handles.get(device)
}
function describe(handle: Handle): FoundKeyboard {
  switch (handle.kind) {
    case 'hid': {
      const d = handle.device
      const protocol = isHmkInterface(d) ? 'HMK' : 'VIA'
      return { ...handle, key: 'hid-' + identity(d), name: d.productName || protocol, label: protocol + ' · USB' }
    }
    case 'usb': {
      const id = usbId(handle.device) ?? ''
      return { ...handle, key: 'usb-' + identity(handle.device), name: names()['usb:' + id] || 'ZMK Studio ' + id, label: 'ZMK Studio · USB' }
    }
    default: {
      const d = handle.device
      return { ...handle, key: handle.kind + ':' + d.id, name: d.name || 'ZMK Studio', label: 'ZMK Studio · Bluetooth' }
    }
  }
}

export function rememberKeyboard(board: FoundKeyboard, name: string) {
  if (board.kind === 'bluetooth') sessionBluetooth.set(board.device.id, board.device)
  if (board.kind === 'usb') rememberStudioPort(board.device)
  if (board.kind !== 'bluetooth' && board.kind !== 'usb') return
  const id = board.kind === 'usb' ? usbId(board.device) : board.device.id
  if (!id) return
  try { localStorage.setItem(namesKey, JSON.stringify({ ...names(), [board.kind + ':' + id]: name })) } catch {}
}

export async function requestKeyboard(kind: 'hid' | 'usb' | 'bluetooth') {
  if (kind === 'hid') {
    const [device] = await navigator.hid.requestDevice({filters: [{usagePage:0xff60, usage:0x61}, hmkHidFilter]})
    return device ? describe({ kind, device }) : undefined
  }
  if (kind === 'usb') {
    const device = await studioSerial()?.requestPort()
    return device ? describe({ kind, device }) : undefined
  }
  return describe({ kind, device: await requestStudioBluetooth() })
}

export function discoverKeyboards(update: (boards: FoundKeyboard[]) => void, nearby: (board: FoundKeyboard) => void) {
  const stop = new AbortController()
  const { signal } = stop
  let local: LocalKeyboard[] | undefined
  let revision = 0
  let initial = true
  const serial = studioSerial()
  const watching = new Map<string, AbortController>()
  function watchDevice(device: StudioBluetoothDevice) {
    if (watching.has(device.id) || !device.watchAdvertisements) return
    const controller = new AbortController()
    watching.set(device.id, controller)
    let lastSeen = 0
    device.addEventListener('advertisementreceived', () => {
      const now = Date.now()
      if (now - lastSeen > 60000) nearby(describe({kind:'bluetooth', device}))
      lastSeen = now
    }, {signal: controller.signal})
    device.addEventListener('gattserverdisconnected', () => { lastSeen = 0 }, {signal: controller.signal})
    void device.watchAdvertisements({signal: controller.signal}).catch(() => controller.abort())
  }
  async function refresh() {
    const generation = ++revision
    const bluetooth = studioBluetooth()
    const [hid, ports, wireless] = await Promise.all([
      navigator.hid?.getDevices().catch(() => []) ?? [],
      serial ? knownStudioPorts(serial).catch(() => []) : [],
      bluetooth?.getDevices ? bluetooth.getDevices().catch(() => []) : [...sessionBluetooth.values()],
    ])
    if (signal.aborted || generation !== revision || initial) return
    const boards: FoundKeyboard[] = []
    for (const device of hid) if (isViaInterface(device) || isHmkInterface(device)) boards.push(describe({kind:'hid', device}))
    for (const device of ports) boards.push(describe({kind:'usb', device}))
    if (local !== undefined) {
      for (const device of local) boards.push(describe({kind:'local', device}))
    } else {
      const saved = names()
      for (const device of wireless) {
        if (!saved['bluetooth:' + device.id] && !sessionBluetooth.has(device.id)) continue
        boards.push(describe({kind:'bluetooth', device}))
        watchDevice(device)
      }
    }
    for (const [id, controller] of watching) {
      if (local === undefined && wireless.some(device => device.id === id)) continue
      controller.abort()
      watching.delete(id)
    }
    update(boards)
  }
  function publish() { initial = false; void refresh() }
  // Give the local and browser transports a chance to report together at startup.
  const fallback = setTimeout(publish, 2200)
  let localSupported = false
  let retryWatch: ReturnType<typeof setTimeout> | undefined
  async function observeLocal() {
    try {
      await watchLocalKeyboards(signal, devices => {
        localSupported = true
        local = devices
        clearTimeout(fallback)
        publish()
      })
    } catch {
      // Browser transports remain available while the local server is restarting.
    } finally {
      if (!signal.aborted) {
        local = undefined
        clearTimeout(fallback)
        publish()
        if (localSupported) retryWatch = setTimeout(observeLocal, 3000)
      }
    }
  }
  void observeLocal()
  for (const source of [navigator.hid, serial]) {
    source?.addEventListener('connect', refresh, { signal })
    source?.addEventListener('disconnect', refresh, { signal })
  }
  window.addEventListener('focus', refresh, { signal })
  const timer = setInterval(() => { if (!document.hidden) void refresh() }, 3500)
  return { refresh, stop() { stop.abort(); clearTimeout(retryWatch); for (const controller of watching.values()) controller.abort(); clearTimeout(fallback); clearInterval(timer) } }
}
