import type { ViaDefinition, ViaReportDevice } from './adapter'

export const sampleViaDefinition: ViaDefinition = {
  name: 'VIA Macro Pad',
  vendorId: '0x0000',
  productId: '0x0000',
  matrix: { rows: 2, cols: 3 },
  layouts: {
    labels: [['Bottom row', 'Three keys', 'Wide key']],
    keymap: [['0,0', '0,1', '0,2'], ['1,0\n\n\n0,0', '1,1\n\n\n0,0', '1,2\n\n\n0,0'],
      [{ w: 2 }, '1,0\n\n\n0,1', '1,2\n\n\n0,1']],
  },
  menus: [{
    label: 'Lighting',
    content: [
      { label: 'Enable lighting', type: 'toggle', content: ['sample_lighting', 1, 1] },
      { label: 'Brightness', type: 'range', options: [0, 255], content: ['sample_brightness', 1, 2], showIf: '{sample_lighting} == 1' },
      { label: 'Color', type: 'color', content: ['sample_color', 1, 3], showIf: '{sample_lighting} == 1' },
      { label: 'Effect', type: 'dropdown', options: ['Solid', 'Breathing', 'Cycle'], content: ['sample_effect', 1, 4], showIf: '{sample_lighting} == 1' },
      { label: 'Effect speed', type: 'range', options: [0, 255], content: ['sample_speed', 1, 5], showIf: '{sample_lighting} == 1' },
    ],
  }],
}

export class SampleViaDevice extends EventTarget implements ViaReportDevice {
  opened = false
  private layers = [[4, 5, 6, 7, 8, 9], [30, 31, 32, 33, 34, 35]]
  private controls = new Map<number, number[]>([[1, [1]], [2, [128]], [3, [170, 210]], [4, [1]], [5, [96]]])
  private layoutWord = 0
  private pulseUntil = 0
  pulseSwitch() { this.pulseUntil = performance.now() + 600 }

  async open() {
    this.opened = true
  }

  async close() {
    this.opened = false
  }

  async sendReport(_reportId: number, bytes: BufferSource) {
    if (!this.opened || !(bytes instanceof Uint8Array)) throw Error('Sample VIA device is unavailable.')
    const reply = new Uint8Array(bytes)
    const [command, first, second, third] = bytes
    switch (command) {
      case 0x01:
        reply[2] = 13
        break
      case 0x02:
        if (first === 2) new DataView(reply.buffer).setUint32(2, this.layoutWord)
        else if (first === 4) reply[5] = 6
        else if (first === 3 && second === 0) reply[3] = performance.now() < this.pulseUntil ? 1 : 0
        else reply[0] = 0xff
        break
      case 0x03:
        if (first === 2) this.layoutWord = new DataView(reply.buffer).getUint32(2)
        else reply[0] = 0xff
        break
      case 0x04: {
        const code = this.layers[first][second * 3 + third]
        reply[4] = code >> 8
        reply[5] = code & 255
        break
      }
      case 0x05:
        this.layers[first][second * 3 + third] = (bytes[4] << 8) | bytes[5]
        break
      case 0x07:
      case 0x08: {
        const current = first === 1 ? this.controls.get(second) : undefined
        if (!current) reply[0] = 0xff
        else if (command === 0x07) this.controls.set(second, Array.from(bytes.slice(3, 3 + current.length)))
        else reply.set(current, 3)
        break
      }
      case 0x09:
      case 0x0c:
        break
      case 0x11:
        reply[1] = this.layers.length
        break
      default:
        reply[0] = 0xff
    }
    this.dispatchEvent(Object.assign(new Event('inputreport'), { data: new DataView(reply.buffer) }))
  }
}
