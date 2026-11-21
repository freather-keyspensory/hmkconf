// Release eligibility is supplied by a connected board adapter, never inferred from protocol.
export type OwnedBoard = { boardId: string; hardwareRevision: string; version: string; owned: boolean; methods: UpdateMethod[] }
export type UpdateMethod = 'web-dfu' | 'uf2' | 'bluetooth-ota' | 'native-dfu'
export type FirmwareRelease = { boardId: string; hardwareRevision: string; version: string; method: UpdateMethod; url: string; sha256: string; notes: string }
export function newerVersion(next: string, installed: string) {
  const parse=(v:string)=>/^\d+\.\d+(\.\d+)?$/.test(v)?v.split('.').map(Number):null
  const a=parse(next),b=parse(installed);if(!a||!b)return false
  for(let i=0;i<3;i++){if((a[i]??0)!==(b[i]??0))return (a[i]??0)>(b[i]??0)}return false
}
export async function checkReleases(board: OwnedBoard): Promise<FirmwareRelease[]> {
  if(!board.owned)return []
  const response=await fetch('/firmware/releases.json',{cache:'no-store'})
  if(!response.ok)throw Error('Firmware release service is not configured yet.')
  const manifest=await response.json()
  if(manifest.schemaVersion!==1||!Array.isArray(manifest.releases))throw Error('Invalid release manifest')
  return manifest.releases.filter((r:FirmwareRelease)=>r.boardId===board.boardId&&r.hardwareRevision===board.hardwareRevision&&board.methods.includes(r.method)&&newerVersion(r.version,board.version)&&typeof r.url==='string'&&new URL(r.url,location.origin).origin===location.origin&&/^[a-f0-9]{64}$/i.test(r.sha256))
}
export interface FirmwareTransport {
  // Implementations must validate bootloader identity and support disconnect/reconnect.
  method: UpdateMethod
  install(image: Uint8Array, onProgress:(percent:number)=>void):Promise<void>
  readInstalledVersion():Promise<string>
}
export async function installRelease(board:OwnedBoard, release:FirmwareRelease, transport:FirmwareTransport, progress:(percent:number)=>void) {
  if(!board.owned||release.boardId!==board.boardId||release.hardwareRevision!==board.hardwareRevision||!board.methods.includes(release.method)||transport.method!==release.method||!newerVersion(release.version,board.version))throw Error('Incompatible firmware update')
  const url=new URL(release.url,location.origin);if(url.origin!==location.origin)throw Error('Untrusted firmware origin')
  const response=await fetch(url);if(!response.ok)throw Error('Firmware download failed')
  const image=await response.arrayBuffer()
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',image)),b=>b.toString(16).padStart(2,'0')).join('')
  if(hash!==release.sha256.toLowerCase())throw Error('Firmware checksum mismatch')
  await transport.install(new Uint8Array(image),progress)
  if(await transport.readInstalledVersion()!==release.version)throw Error('Installed firmware version could not be verified')
}
