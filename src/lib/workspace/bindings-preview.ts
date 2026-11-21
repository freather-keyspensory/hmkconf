import { fullKeyboard } from './test-layout'
import type { CanvasKey } from './key-geometry'

const codes = [
  'Escape Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal Backslash Backquote',
  'Tab KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP BracketLeft BracketRight Backspace',
  'ControlLeft KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote Enter',
  'ShiftLeft KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash ShiftRight Fn',
  'ControlLeft AltLeft Space AltRight MetaRight',
]
const widths = [
  {}, { 0: 1.5, 13: 1.5 }, { 0: 1.75, 12: 2.25 }, { 0: 2.25, 11: 1.75 }, { 1: 1.5, 2: 6, 3: 1.5 },
] as Record<number, number>[]
const legends = new Map(fullKeyboard.keys.map(key => [key.code, key.label]))
export const keyOptions = [...legends.keys()]
export function legend(code: string): string { return legends.get(code) ?? code }
export function keyName(code: string): string {
  if (code.startsWith('Numpad')) return 'Num ' + legend(code)
  if (/^(Control|Shift|Alt|Meta)(Left|Right)$/.test(code)) return code.replace(/(Left|Right)$/, ' $1')
  return legend(code)
}

// Base-layer positions in the KUSH HHKB Pro 2 physical layout, in firmware order.
export const positions: (CanvasKey & { code: string })[] = []
for (const [y, row] of codes.entries()) {
  let x = y === 4 ? 1.5 : 0
  for (const [column, code] of row.split(' ').entries()) {
    const w = widths[y][column] ?? 1
    positions.push({ index: positions.length, x, y, w, h: 1, code })
    x += w
  }
}

export type Combo = { id: string; keys: number[]; output: string; windowMs: number }
export type Step = { action: 'Tap' | 'Press' | 'Release'; key: string } | { action: 'Delay'; ms: number }
export type Macro = { id: string; name: string; trigger: number | null; steps: Step[] }
export type Sample = { combos: Combo[]; macros: Macro[] }

export function initialSample(): Sample {
  return {
    combos: [{ id: 'escape', keys: [36, 37], output: 'Escape', windowMs: 50 }],
    macros: [{ id: 'copy', name: 'Copy', trigger: 14, steps: [
      { action: 'Press', key: 'ControlLeft' }, { action: 'Tap', key: 'KeyC' }, { action: 'Release', key: 'ControlLeft' },
    ] }],
  }
}
