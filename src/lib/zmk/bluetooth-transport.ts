import type { RpcTransport } from '@zmkfirmware/zmk-studio-ts-client/transport/index'

const service = '00000000-0196-6107-c967-c5cfb1c2482a'
const rpc = '00000001-0196-6107-c967-c5cfb1c2482a'

type Characteristic = EventTarget & {
  properties: { write: boolean; writeWithoutResponse: boolean }
  value?: DataView
  startNotifications(): Promise<unknown>
  stopNotifications(): Promise<unknown>
  writeValueWithResponse(data: Uint8Array): Promise<void>
  writeValueWithoutResponse(data: Uint8Array): Promise<void>
}
type Gatt = {
  connect(): Promise<Gatt>
  disconnect(): void
  getPrimaryService(id: string): Promise<{ getCharacteristic(id: string): Promise<Characteristic> }>
}
export type StudioBluetoothDevice = EventTarget & { id: string; name?: string; gatt?: Gatt; watchAdvertisements?(options: { signal: AbortSignal }): Promise<void> }
type Discovery = { requestDevice(options: {acceptAllDevices: boolean; optionalServices: string[]}): Promise<StudioBluetoothDevice>; getDevices?(): Promise<StudioBluetoothDevice[]> }

export function studioBluetooth() {
  return (navigator as Navigator & { bluetooth?: Discovery }).bluetooth
}

export function requestStudioBluetooth() {
  const bluetooth = studioBluetooth()
  if (!bluetooth) throw Error('Web Bluetooth is unavailable in this browser.')
  return bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [service] })
}

export async function connectBluetooth(selected?: StudioBluetoothDevice): Promise<RpcTransport> {
  const device = selected ?? await requestStudioBluetooth()
  const gatt = device.gatt
  if (!gatt) throw Error('The selected device has no Bluetooth GATT connection.')
  const abortController = new AbortController()
  const { signal } = abortController
  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        gatt.connect(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Keyboard is out of range or unavailable.')), 10000) }),
      ])
    } finally { clearTimeout(timer) }
    const endpoint = await (await gatt.getPrimaryService(service)).getCharacteristic(rpc)
    if (!endpoint.properties.write && !endpoint.properties.writeWithoutResponse)
      throw Error('The Studio Bluetooth characteristic does not support writes.')
    // Subscribe before the first request, including when reconnecting to a paired device.
    await endpoint.stopNotifications()
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        endpoint.addEventListener('characteristicvaluechanged', () => {
          const data = endpoint.value
          if (data) controller.enqueue(new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice())
        }, {signal})
        device.addEventListener('gattserverdisconnected', () => {
          controller.close()
          abortController.abort()
        }, {signal})
      },
      cancel() { abortController.abort() },
    })
    signal.addEventListener('abort', () => gatt.disconnect(), {once:true})
    await endpoint.startNotifications()
    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        return endpoint.properties.writeWithoutResponse
          ? endpoint.writeValueWithoutResponse(chunk)
          : endpoint.writeValueWithResponse(chunk)
      },
    })
    return { label: device.name ?? 'ZMK Studio', abortController, readable, writable }
  } catch (error) {
    abortController.abort()
    gatt.disconnect()
    throw error
  }
}
