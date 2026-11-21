import { evalExpr } from '@the-via/pelpi'
import { commonMenus, getLightingDefinition, LightingValue, type LightingTypeDefinitionV2 } from '@the-via/reader'

const controlTypes = ['range', 'keycode', 'dropdown', 'toggle', 'color', 'button', 'label'] as const
type ControlType = (typeof controlTypes)[number]

export type ViaMenu = {
  label: string
  showIf?: string
  content: ViaMenuNode[]
}
export type ViaControl = {
  label: string
  showIf?: string
  type: ControlType
  id: string
  command: number[]
  options: unknown[]
}
export type ViaMenuNode = ViaMenu | ViaControl
export type ViaMenuValues = Record<string, number[]>

export function isByte(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255
}

function parseMenuNode(raw: unknown): ViaMenuNode[] {
  if (!raw || typeof raw !== 'object' || !('content' in raw) || !Array.isArray(raw.content)) return []
  const label = 'label' in raw && typeof raw.label === 'string' ? raw.label : ''
  const showIf = 'showIf' in raw && typeof raw.showIf === 'string' ? raw.showIf : undefined
  if (!('type' in raw)) return [{ label, showIf, content: raw.content.flatMap(parseMenuNode) }]
  const type = controlTypes.find(type => type === raw.type)
  const [id, ...command] = raw.content
  if (!type || typeof id !== 'string' || command.length > 27 || !command.every(isByte)) return []
  if (command.length < 2 && !(type === 'label' && command.length === 0)) return []
  const options = 'options' in raw && Array.isArray(raw.options) ? raw.options : []
  return [{ label, showIf, type, id, command, options }]
}

export function parseViaMenus(rawMenus: unknown): ViaMenu[] {
  if (!Array.isArray(rawMenus)) return []
  return rawMenus.flatMap(menu => {
    if (typeof menu === 'string') {
      menu = Object.hasOwn(commonMenus, menu) ? commonMenus[menu as keyof typeof commonMenus] : []
    }
    return (Array.isArray(menu) ? menu : [menu]).flatMap(parseMenuNode)
  }).filter((node): node is ViaMenu => !('type' in node) && node.content.length > 0)
}

export function menuVisible(node: ViaMenuNode, values: ViaMenuValues) {
  if (!node.showIf) return true
  try {
    return Boolean(evalExpr(node.showIf, values))
  } catch {
    return false
  }
}

export const isLightingMenu = (menu: ViaMenu) => menu.label.trim().toLowerCase() === 'lighting'

export function legacyLightingMenus(definition?: LightingTypeDefinitionV2): ViaMenu[] {
  if (!definition) return []
  const preset = getLightingDefinition(definition)
  if (!Array.isArray(preset?.supportedLightingValues)) return []
  const controls: ViaControl[] = []
  function add(command: LightingValue, label: string, type: ViaControl['type'], options: unknown[] = [], showIf?: string) {
    if (preset.supportedLightingValues.includes(command) && (type !== 'dropdown' || options.length))
      controls.push({ id: 'legacy_' + command, label, type, options, command: [command], showIf })
  }
  function group(prefix: string, brightness: LightingValue, effect: LightingValue, speed: LightingValue, colors: LightingValue[], effects: [string, number][]) {
    const choices = Array.isArray(effects) ? effects : []
    add(brightness, prefix + 'Brightness', 'range', [0, 255])
    add(effect, prefix + 'Effect', 'dropdown', choices.map(choice => choice[0]))
    add(speed, prefix + 'Effect speed', 'range', [0, 3])
    colors.forEach((command, index) => {
      const matches = choices.flatMap((choice, number) => choice[1] > index && choice[1] <= colors.length ? ['{legacy_' + effect + '} == ' + number] : [])
      add(command, prefix + (colors.length > 1 ? 'Color ' + (index + 1) : 'Color'), 'color', [], matches.length ? matches.join(' || ') : undefined)
    })
  }
  const ids = LightingValue
  group('', ids.BACKLIGHT_BRIGHTNESS, ids.BACKLIGHT_EFFECT, ids.BACKLIGHT_EFFECT_SPEED, [ids.BACKLIGHT_COLOR_1, ids.BACKLIGHT_COLOR_2], preset.effects)
  group('Underglow ', ids.QMK_RGBLIGHT_BRIGHTNESS, ids.QMK_RGBLIGHT_EFFECT, ids.QMK_RGBLIGHT_EFFECT_SPEED, [ids.QMK_RGBLIGHT_COLOR], preset.underglowEffects)
  return controls.length ? [{ label: 'Lighting', content: controls }] : []
}

export function controlWidth(control: ViaControl) {
  if (control.type === 'keycode' || control.type === 'color') return 2
  if (control.type === 'range' && Number(control.options[1]) > 255) return 2
  if (control.type === 'toggle') {
    return Math.max(1, ...control.options.map(option => Array.isArray(option) ? option.length : 1))
  }
  if (control.type === 'label') return 31 - control.command.length
  return 1
}
