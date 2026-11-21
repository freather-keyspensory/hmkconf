import type { BehaviorBinding } from '@zmkfirmware/zmk-studio-ts-client/keymap'
import type { GetBehaviorDetailsResponse } from '@zmkfirmware/zmk-studio-ts-client/behaviors'
import { zmkKeyLegend } from './key-picker'

export function bindingLabel(binding: BehaviorBinding, behavior?: GetBehaviorDetailsResponse) {
  const { param1, param2 } = binding
  const name = behavior?.displayName
  switch (name) {
    case 'Key Press': return zmkKeyLegend(param1)
    case 'Transparent': return '▽'
    case 'None': return 'KC_NO'
    case 'Momentary Layer': return `MO(${param1})`
    case 'Toggle Layer': return `TG(${param1})`
    case 'To Layer': return `TO(${param1})`
    case 'Layer-Tap': return `LT(${param1}, ${zmkKeyLegend(param2)})`
    case 'Mod-Tap': return `MT(${zmkKeyLegend(param1)}, ${zmkKeyLegend(param2)})`
    case 'Sticky Key': return `SK(${zmkKeyLegend(param1)})`
    case 'Bluetooth': {
      const actions = ['Clear pairing', 'Next profile', 'Previous profile', 'Profile ' + (param2 + 1), 'Clear all pairings', 'Disconnect ' + (param2 + 1)]
      return 'BT · ' + (actions[param1] ?? `${param1}, ${param2}`)
    }
    case 'Output Selection': return ['Toggle output', 'USB output', 'Bluetooth output'][param1] ?? `Output ${param1}`
  }
  const metadata = behavior?.metadata ?? []
  const fields = (['param1', 'param2'] as const).map(field => {
    const value = binding[field]
    const choices = metadata.flatMap(set => set[field])
    const constant = choices.find(choice => choice.constant === value)
    if (constant?.name) return constant.name
    if (choices.some(choice => choice.hidUsage)) return zmkKeyLegend(value)
    if (choices.some(choice => choice.layerId)) return 'L' + value
    if (value || choices.some(choice => choice.range)) return String(value)
    return ''
  }).filter(Boolean)
  return [name || 'ID ' + binding.behaviorId, ...fields].join(' ')
}
