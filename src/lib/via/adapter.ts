import { base } from '$app/paths'
import m6b from '$lib/keyboard/m6b-via.json'
import { validateLayoutLabels } from './layout'
import type { KLELayout, LayoutLabel, LightingTypeDefinitionV2 } from '@the-via/reader'
import type { Language } from '$lib/i18n'
export type ViaDefinition = {name:string;vendorId:string;productId:string;menus?:unknown;keycodes?:string[];translations?:Partial<Record<Language, Record<string,string>>>;lighting?:LightingTypeDefinitionV2;customKeycodes?:{name:string;title?:string;shortName?:string}[];matrix:{rows:number;cols:number};layouts:{keymap:KLELayout;labels?:LayoutLabel[];presets?:Record<string,number[]>}}
export const definitions:ViaDefinition[]=[m6b]
export const isViaInterface=(device:HIDDevice)=>device.collections.some(c=>c.usagePage===0xff60&&c.usage===0x61)
export function findDefinition(device:HIDDevice){return definitions.find(d=>Number(d.vendorId)===device.vendorId&&Number(d.productId)===device.productId)}
export async function lookupDefinition(device:HIDDevice,protocol:number):Promise<ViaDefinition>{
 const response=await fetch(`${base}/definitions/index.json`);if(!response.ok)throw Error('VIA catalog unavailable')
 const index=await response.json();const key=`${device.vendorId.toString(16).padStart(4,'0')}-${device.productId.toString(16).padStart(4,'0')}`
 const candidates=index.boards[key];const entry=protocol<=10?(candidates?.v2??candidates?.v3):(candidates?.v3??candidates?.v2)
 if(!entry)throw Error('No matching VIA definition. Import the manufacturer JSON.')
 const file=await fetch(`${base}/definitions/${entry.file}`);if(!file.ok)throw Error('Keyboard definition download failed')
 const definition=await file.json();validateDefinition(definition,device);
 if(!definition.customKeycodes && candidates.v3 && entry!==candidates.v3){const customResponse=await fetch(`${base}/definitions/${candidates.v3.file}`);if(customResponse.ok){const newer=await customResponse.json();validateDefinition(newer,device);definition.customKeycodes=newer.customKeycodes}}
 return definition
}
export function validateDefinition(d:ViaDefinition,device:Pick<HIDDevice,'vendorId'|'productId'>){if(Number(d.vendorId)!==device.vendorId||Number(d.productId)!==device.productId||!Number.isInteger(d.matrix?.rows)||!Number.isInteger(d.matrix?.cols)||d.matrix.rows<1||d.matrix.cols<1||d.matrix.rows*d.matrix.cols>1024||!Array.isArray(d.layouts?.keymap))throw Error('Invalid or mismatched VIA definition');validateLayoutLabels(d.layouts.labels ?? [])}
export type ViaReportDevice = EventTarget & Pick<HIDDevice, 'opened' | 'open' | 'close' | 'sendReport'>

export class ViaAdapter {
 private pending:Promise<unknown>=Promise.resolve()
 private failed=false
 constructor(readonly device:ViaReportDevice,readonly definition:ViaDefinition){}
 async open(){if(!this.device.opened)await this.device.open();const p=await this.command([1]);const protocol=p[1]*256+p[2];if(protocol<7||protocol>13)throw Error(`Unsupported VIA protocol ${protocol}`);return protocol}
 async close(){await this.pending.catch(()=>{});if(this.device.opened)await this.device.close()}
 command(bytes:number[]):Promise<Uint8Array>{
  const run=()=>new Promise<Uint8Array>((resolve,reject)=>{
   const device=this.device;if(this.failed || !device.opened){reject(Error('VIA session unavailable. Reconnect the keyboard.'));return}
   const cleanup=()=>{clearTimeout(timeout);device.removeEventListener('inputreport',listener)}
   const listener=(event:Event)=>{const { data: report } = event as HIDInputReportEvent;const data=new Uint8Array(report.buffer,report.byteOffset,report.byteLength);if(data[0]!==bytes[0]&&data[0]!==0xff)return;cleanup();if(data[0]===0xff)reject(Error('Command not supported'));else resolve(new Uint8Array(data))}
   const timeout=setTimeout(()=>{this.failed=true;cleanup();reject(Error('VIA response timed out. Reconnect before editing.'))},1800)
   device.addEventListener('inputreport',listener);const packet=new Uint8Array(32);packet.set(bytes);device.sendReport(0,packet).catch(e=>{cleanup();reject(e)})
  });const result=this.pending.then(run,run);this.pending=result.catch(()=>{});return result
 }
 async readLayoutOptions() {
   const reply = await this.command([0x02, 0x02])
   if (reply[1] !== 0x02 || reply.length < 6) throw Error('Invalid VIA layout options reply.')
   return new DataView(reply.buffer, reply.byteOffset, reply.byteLength).getUint32(2)
 }
 async writeLayoutOptions(word: number) {
   const reply = await this.command([0x03, 0x02, word >>> 24, (word >>> 16) & 255, (word >>> 8) & 255, word & 255])
   if (reply[1] !== 0x02) throw Error('Invalid VIA layout options reply.')
 }
 async firmwareVersion() {
   const response = await this.command([0x02, 0x04])
   if (response.length < 6 || response[1] !== 0x04) throw Error('Invalid firmware version reply')
   return new DataView(response.buffer, response.byteOffset, response.byteLength).getUint32(2)
 }
 async readCustomValue(command: number[], width: number) {
   const response = await this.command([0x08, ...command])
   if (1 + command.length + width > response.length || command.some((byte, index) => response[index + 1] !== byte)) {
     throw Error('Invalid VIA custom control reply')
   }
   return Array.from(response.slice(1 + command.length, 1 + command.length + width))
 }
 async writeCustomValue(command: number[], bytes: number[], verify = true, acceptQuantized = false) {
   if (command.length + bytes.length > 31) throw Error('VIA custom command exceeds report size')
   await this.command([0x07, ...command, ...bytes])
   const actual = verify ? await this.readCustomValue(command, bytes.length) : bytes
   if (!acceptQuantized && bytes.some((byte, index) => actual[index] !== byte)) throw Error('VIA custom control readback mismatch')
   await this.command(command.length === 1 ? [0x09] : [0x09, command[0]])
   return actual
 }
 supportsMatrix(protocol: number) {
   const { rows, cols } = this.definition.matrix
   const stride = Math.ceil(cols / 8)
   return protocol >= 9 && (protocol >= 12 ? stride <= 28 && rows <= 256 : stride * rows <= 30)
 }
 async readMatrix(protocol: number, signal: AbortSignal) {
   if (!this.supportsMatrix(protocol)) throw Error('Matrix reporting is unavailable for this board.')
   const { rows, cols } = this.definition.matrix
   const stride = Math.ceil(cols / 8)
   const chunk = protocol >= 12 ? Math.floor(28 / stride) : rows
   const pressed: number[] = []
   for (let offset = 0; offset < rows; offset += chunk) {
     signal.throwIfAborted()
     const request = protocol >= 12 ? [2, 3, offset] : [2, 3]
     const reply = await this.command(request)
     const count = Math.min(chunk, rows - offset)
     if (reply.length < request.length + count * stride || request.some((byte, index) => reply[index] !== byte))
       throw Error('Unexpected switch matrix reply.')
     for (let row = 0; row < count; row++) {
       for (let col = 0; col < cols; col++) {
         const byte = request.length + (row + 1) * stride - 1 - (col >> 3)
         if (reply[byte] & (1 << (col % 8))) pressed.push((row + offset) * cols + col)
       }
     }
   }
   return pressed
 }
 async layerCount(){const count=(await this.command([0x11]))[1];if(count<1||count>32)throw Error('Invalid layer count');return count}
 async readLayer(layer:number){const values:number[]=[];for(let row=0;row<this.definition.matrix.rows;row++)for(let col=0;col<this.definition.matrix.cols;col++){const data=await this.command([4,layer,row,col]);values.push(data[4]*256+data[5])}return values}
 async setKey(layer:number,row:number,col:number,code:number){if(!Number.isInteger(code)||code<0||code>65535)throw Error('Invalid keycode');await this.command([5,layer,row,col,code>>8,code&255]);const data=await this.command([4,layer,row,col]);if(data.length<6||data[1]!==layer||data[2]!==row||data[3]!==col||data[4]*256+data[5]!==code)throw Error('Keymap readback mismatch')}
}
