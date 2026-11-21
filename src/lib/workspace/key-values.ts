// A HID usage includes its page. Keyboard and consumer usages can share the same low byte.
// Usage names come from the USB HID Usage Tables 1.5 distributed with ZMK Studio.
import hidNames from './hid-names.json'
import catalog from '$lib/via/generated/keycodes.json'

const consumerCodes: Record<number, string> = {
  0xe2: 'KC_MUTE', 0xe9: 'KC_VOLU', 0xea: 'KC_VOLD', 0xb5: 'KC_MNXT', 0xb6: 'KC_MPRV',
  0xb7: 'KC_MSTP', 0xcd: 'KC_MPLY', 0x183: 'KC_MSEL', 0xb8: 'KC_EJCT',
  0xb3: 'KC_MFFD', 0xb4: 'KC_MRWD', 0x18a: 'KC_MAIL', 0x192: 'KC_CALC',
  0x194: 'KC_MYCM', 0x221: 'KC_WWW_SEARCH', 0x223: 'KC_WWW_HOME', 0x224: 'KC_WWW_BACK',
  0x225: 'KC_WWW_FORWARD', 0x226: 'KC_WWW_STOP', 0x227: 'KC_WWW_REFRESH', 0x22a: 'KC_WWW_FAVORITES',
  0x6f: 'KC_BRIU', 0x70: 'KC_BRID',
}
const systemCodes: Record<number, string> = { 0x81: 'KC_PWR', 0x82: 'KC_SLEP', 0x83: 'KC_WAKE' }

export function viaKeyValue(usage: number, dictionary: Record<string, number>) {
  const page = usage >>> 16
  const id = usage & 0xffff
  if (page === 7 && ((id >= 4 && id <= 0xa4) || (id >= 0xe0 && id <= 0xe7))) return id
  const code = (page === 12 ? consumerCodes : page === 1 ? systemCodes : {})[id]
  return code ? dictionary[code] : undefined
}

const reference = catalog['12']
const names = new Map<number, string>()
for (const group of reference.categories) {
  if (!['basic', 'media', 'special', 'other'].includes(group.id)) continue
  for (const key of group.keycodes) {
    if (!names.has(key.value)) names.set(key.value, key.name || key.code)
  }
}
const usageNames: Record<number, string> = hidNames
const modifiers = ['Left Ctrl', 'Left Shift', 'Left Alt', 'Left Win', 'Right Ctrl', 'Right Shift', 'Right Alt', 'Right Win']

export function hidLegend(value: number) {
  const usage = value & 0xffffff
  const via = viaKeyValue(usage, reference.dict)
  const label = (via !== undefined && names.get(via)) || usageNames[usage] || 'HID 0x' + usage.toString(16).toUpperCase().padStart(6, '0')
  const mask = value >>> 24
  if (!mask) return label
  const lines = label.split('\n')
  const base = lines.length === 2 && lines.every(line => line.length === 1) ? lines[1] : lines.join(' ')
  return [...modifiers.filter((_, bit) => mask & (1 << bit)), base].join(' + ')
}
