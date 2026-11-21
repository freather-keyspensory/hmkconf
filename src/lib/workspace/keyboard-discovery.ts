import { isViaInterface } from '$lib/via/adapter'
import { hmkHidFilter, isHmkInterface } from '$lib/keyboard/hmk-keyboard.svelte'
import { knownStudioPorts, rememberStudioPort, studioSerial, usbId, type StudioSerialPort } from '$lib/zmk/serial-transport'
import { requestStudioBluetooth, type StudioBluetoothDevice } from '$lib/zmk/bluetooth-transport'
import { watchLocalKeyboards, type LocalKeyboard } from '$lib/zmk/local-bluetooth'

type Handle = { kind: 'hid'; device: HIDDevice } | { kind: 'usb'; device: StudioSerialPort } |
  { kind: 'bluetooth'; device: StudioBluetoothDevice } | { kind: 'local'; device: LocalKeyboard }
export type FoundKeyboard = Handle & { key: string; name: string; label: string }
const namesKey = 'keyspensory-studio-device-names'
let sessionBluetooth: StudioBluetoothDevice | undefined
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
  if (board.kind === 'bluetooth') sessionBluetooth = board.device
  if (board.kind === 'usb') rememberStudioPort(board.device)
  if (board.kind !== 'bluetooth' && board.kind !== 'usb') return
  const id = board.kind === 'usb' ? usbId(board.device) : board.device.id
  if (!id) return
  const savedName = board.kind === 'bluetooth' ? board.device.name || name : name
  try { localStorage.setItem(namesKey, JSON.stringify({ ...names(), [board.kind + ':' + id]: savedName })) } catch {}
}

export async function requestKeyboard(kind: 'hid' | 'usb' | 'bluetooth', exactName = '') {
  if (kind === 'hid') {
    const [device] = await navigator.hid.requestDevice({filters: [{usagePage:0xff60, usage:0x61}, hmkHidFilter]})
    return device ? describe({ kind, device }) : undefined
  }
  if (kind === 'usb') {
    const device = await studioSerial()?.requestPort()
    return device ? describe({ kind, device }) : undefined
  }
  const knownNames = Object.entries(names())
    .filter(([key, value]) => key.startsWith('bluetooth:') && typeof value === 'string')
    .map(([, value]) => value)
  return describe({ kind, device: await requestStudioBluetooth(exactName, knownNames) })
}

export function discoverKeyboards(update: (boards: FoundKeyboard[], nativeBluetooth: boolean) => void) {
  const stop = new AbortController()
  const { signal } = stop
  let local: LocalKeyboard[] | undefined
  let revision = 0
  let initial = true
  const serial = studioSerial()
  async function refresh() {
    const generation = ++revision
    const [hid, ports] = await Promise.all([
      navigator.hid?.getDevices().catch(() => []) ?? [],
      serial ? knownStudioPorts(serial).catch(() => []) : [],
    ])
    if (signal.aborted || generation !== revision || initial) return
    const boards: FoundKeyboard[] = []
    for (const device of hid) if (isViaInterface(device) || isHmkInterface(device)) boards.push(describe({kind:'hid', device}))
    for (const device of ports) boards.push(describe({kind:'usb', device}))
    if (local !== undefined) {
      for (const device of local) boards.push(describe({kind:'local', device}))
    } else if (sessionBluetooth?.gatt?.connected) {
      boards.push(describe({kind:'bluetooth', device:sessionBluetooth}))
    }
    update(boards, local !== undefined)
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
        local = localSupported ? [] : undefined
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
  return { refresh, stop() { stop.abort(); clearTimeout(retryWatch); clearTimeout(fallback); clearInterval(timer) } }
}
