import type {
  BehaviorParameterHidUsage, BehaviorParameterValueDescription as Parameter,
  GetBehaviorDetailsResponse as Behavior,
} from '@zmkfirmware/zmk-studio-ts-client/behaviors'
import type { Layer } from '@zmkfirmware/zmk-studio-ts-client/keymap'
import { isPresetMacro } from './action-protocol'
import { hidLegend } from '$lib/workspace/key-values'
import hidNames from '$lib/workspace/hid-names.json'
import zmkNames from './keycode-names.json'

const aliases: Record<number, string> = zmkNames
const descriptions: Record<number, string> = hidNames

export function allowsUsage(value: number, limits?: BehaviorParameterHidUsage) {
  const page = (value >>> 16) & 0xff
  const id = value & 0xffff
  if (page === 7) return id > 0 && (id <= (limits?.keyboardMax ?? 0xff) || (id >= 0xe0 && id <= 0xe7))
  return page === 12 && id > 0 && id <= (limits?.consumerMax ?? 0xfff)
}

export function keyPressLimits(behavior?: Behavior) {
  return behavior?.metadata.flatMap(set => set.param1).find(param => param.hidUsage)?.hidUsage
}

function usageGroup(value: number): [string, string] {
  const id = value & 0xffff
  if (value >>> 24) return ['Symbols', 'Shifted symbols']
  if (value >>> 16 === 1) return ['System', 'Firmware only']
  if (value >>> 16 === 7) {
    if (id >= 0xe0 && id <= 0xe7) return ['Modifiers', '']
    if ((id >= 0x53 && id <= 0x63) || id === 0x67 || id === 0x85 || id === 0x86) return ['Keypad', 'Basic']
    if (id >= 0xb0 && id <= 0xcf) return ['Keypad', 'Symbols']
    if (id >= 0xd0 && id <= 0xdd) return ['Keypad', 'Operations']
    if (id >= 0x87 && id <= 0x98) return ['International', id < 0x90 ? 'International' : 'Language']
    if (id >= 0x68 && id <= 0x73) return ['Extended', 'Function']
    if ((id >= 4 && id <= 0x52 && id !== 0x32) || id === 0x65) return ['Basic', '']
    return ['Extended', 'Keyboard']
  }
  if (id >= 0x180 && id <= 0x1ff) return ['Applications', 'Launch']
  if (id >= 0x200 && id < 0x290) return ['Applications', 'Shortcuts']
  if (id >= 0xe0 && id <= 0xea) return ['Media', 'Volume']
  if (id >= 0x40 && id <= 0x4a) return ['Consumer', 'Menu']
  if (id >= 0x290 && id <= 0x2ff) return ['Applications', 'Shortcuts']
  if (id >= 0x500 && id <= 0x5ff) return ['Consumer', 'Contacts']
  if (id >= 0xb0 && id <= 0xdf) return ['Media', 'Playback']
  if (id >= 0x60 && id <= 0x7f) return ['Media', 'Display']
  if (id >= 0x80 && id < 0xb0) return ['Media', 'Media selection']
  if (id >= 0x30 && id <= 0x36) return ['System', 'Power']
  return ['Consumer', id < 0x100 ? 'Controls' : id < 0x180 ? 'Device controls' : 'Other']
}

export function zmkKeyLegend(value: number) {
  const base = hidLegend(value & 0xffffff)
  if (value >>> 24 === 2 && aliases[value] && base.includes('\n')) return base.split('\n')[0]
  const legend = hidLegend(value)
  return legend.startsWith('HID 0x') && aliases[value] ? aliases[value].split(' ')[0] : legend
}

export const hidKeys = [...new Set([...Object.keys(descriptions), ...Object.keys(aliases)].map(Number))]
  .sort((a, b) => a - b)
  .map(value => {
    const [group, row] = usageGroup(value)
    const codes = aliases[value] ?? ''
    const label = zmkKeyLegend(value)
    const title = [descriptions[value], codes, '0x' + value.toString(16).toUpperCase()].filter(Boolean).join(' · ')
    return { value, group, row, label, title, code: codes.split(' ')[0], description: descriptions[value] }
  })

export type Argument = number | Parameter
export type PickerAction = {
  group: string; row: string; label: string; title: string
  behaviorId: number; args: [Argument, Argument]; firmwareOnly?: boolean
}

const nativeNames: Record<string, string> = {
  'Momentary Layer': '&mo', 'Toggle Layer': '&tog', 'Sticky Layer': '&sl', 'To Layer': '&to', 'Layer-Tap': '&lt',
  'Mod-Tap': '&mt', 'Sticky Key': '&sk', 'Key Toggle': '&kt', 'Caps Word': '&caps_word', 'Key Repeat': '&key_repeat',
  'Grave/Escape': '&gresc', Bluetooth: '&bt', 'Output Selection': '&out', 'External Power': '&ext_power',
  Transparent: '&trans', None: '&none', Reset: '&sys_reset', Bootloader: '&bootloader', 'Studio Unlock': '&studio_unlock',
}

function behaviorGroup(name: string) {
  if (/layer/i.test(name)) return 'Layers'
  if (/bluetooth|output selection/i.test(name)) return 'Wireless'
  if (/light|underglow/i.test(name)) return 'Lighting'
  if (/mouse|scroll|pointing/i.test(name)) return 'Mouse'
  if (isPresetMacro(name) || name === 'Runtime Macro') return 'Macro'
  if (/mod.tap|sticky key|caps word|key toggle/i.test(name)) return 'Modifiers'
  if (/power|reset|bootloader|studio unlock/i.test(name)) return 'System'
  if (/^(None|Transparent)$/.test(name)) return 'Basic'
  return 'Other'
}

type Choice = { label: string; argument: Argument }
function choices(parameters: Parameter[], layers: Layer[]): Choice[] {
  if (!parameters.length) return [{ label: '', argument: 0 }]
  return parameters.flatMap((p): Choice[] => {
    if (p.nil) return [{ label: '', argument: 0 }]
    if (p.constant !== undefined) return [{ label: p.name || String(p.constant), argument: p.constant }]
    if (p.layerId) return layers.map((layer, index) => ({ label: String(index + 1), argument: layer.id }))
    if (p.range && p.range.max - p.range.min <= 12) {
      const { min, max } = p.range
      return Array.from({ length: max - min + 1 }, (_, i) => ({ label: p.name === 'Profile' ? 'Profile ' + (min + i + 1) : String(min + i), argument: min + i }))
    }
    return [{ label: '', argument: p }]
  })
}

export function pickerActions(behaviors: Behavior[], layers: Layer[]): PickerAction[] {
  const actions: PickerAction[] = []
  for (const behavior of behaviors) {
    const { displayName: name, id } = behavior
    if (name === 'Key Press') {
      const limits = keyPressLimits(behavior)
      for (const key of hidKeys) {
        const firmwareOnly = key.value >>> 16 === 1
        if (!firmwareOnly && !allowsUsage(key.value, limits)) continue
        actions.push({ ...key, behaviorId: id, args: [key.value, 0], title: '&kp · ' + key.title, firmwareOnly })
      }
      actions.push({ group: 'Modifiers', row: '', label: 'Modified key', title: 'LC LS LA LG RC RS RA RG',
        behaviorId: id, args: [{ name: 'Key', hidUsage: limits ?? { keyboardMax: 255, consumerMax: 4095 } }, 0] })
      continue
    }
    const sets = behavior.metadata.length ? behavior.metadata : [{ param1: [], param2: [] }]
    for (const set of sets) {
      for (const first of choices(set.param1, layers)) {
        for (const second of choices(set.param2, layers)) {
          const parts = [first.label, second.label].filter(Boolean)
          const label = parts.join(' · ') || name
          const title = [name, nativeNames[name], ...parts].filter(Boolean).join(' · ')
          actions.push({ group: behaviorGroup(name), row: parts.length ? name : '', label, title,
            behaviorId: id, args: [first.argument, second.argument] })
        }
      }
    }
  }
  return actions
}

const groupOrder = ['Basic', 'Symbols', 'Extended', 'Keypad', 'International', 'Media', 'Applications',
  'Consumer', 'Layers', 'Modifiers', 'Wireless', 'Lighting', 'Mouse', 'Macro', 'Combo outputs', 'System', 'Other']

export function groupActions(actions: PickerAction[], search: string, t: (text: string) => string) {
  const groups = new Map<string, Map<string, PickerAction[]>>()
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean)
  for (const action of actions) {
    if (terms.length) {
      const text = [action.group, t(action.group), action.row, t(action.row), action.label, t(action.label), action.title].join(' ').toLowerCase()
      if (!terms.every(term => text.includes(term))) continue
    }
    let rows = groups.get(action.group)
    if (!rows) {
      rows = new Map()
      groups.set(action.group, rows)
    }
    let row = rows.get(action.row)
    if (!row) {
      row = []
      rows.set(action.row, row)
    }
    row.push(action)
  }
  return groupOrder.filter(name => groups.has(name)).map(name => ({ name, rows: [...groups.get(name)!] }))
}
