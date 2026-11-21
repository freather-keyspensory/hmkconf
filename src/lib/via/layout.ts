import { kleLayoutToVIALayout, type LayoutLabel, type VIALayout } from '@the-via/reader'
import { fitKeys } from '../workspace/key-geometry'
import type { ViaDefinition } from './adapter'

const count = (label: LayoutLabel) => typeof label === 'string' ? 2 : label.length - 1
const bits = (label: LayoutLabel) => Math.max(1, Math.ceil(Math.log2(count(label))))

export function validateLayoutLabels(labels: LayoutLabel[]) {
  if (!Array.isArray(labels) || labels.some(label => typeof label !== 'string' &&
      (!Array.isArray(label) || label.length < 2 || !label.every(value => typeof value === 'string')))) {
    throw Error('Invalid VIA layout labels.')
  }
  if (labels.reduce((total, label) => total + bits(label), 0) > 32) throw Error('VIA layout options exceed 32 bits.')
}

export function unpackLayout(word: number, labels: LayoutLabel[]) {
  const values: number[] = []
  for (let i = labels.length - 1; i >= 0; i--) {
    const radix = 2 ** bits(labels[i])
    values[i] = word % radix
    word = Math.floor(word / radix)
  }
  return values
}

// VIA places the last option in the least significant bits. Preserve all unedited bits.
export function updateLayoutWord(word: number, labels: LayoutLabel[], changes: Map<number, number>) {
  let shift = 0
  const current = unpackLayout(word, labels)
  for (let i = labels.length - 1; i >= 0; i--) {
    const next = changes.get(i)
    if (next !== undefined) {
      if (!Number.isInteger(next) || next < 0 || next >= count(labels[i])) throw Error('Invalid layout choice.')
      word += (next - current[i]) * 2 ** shift
    }
    shift += bits(labels[i])
  }
  return word
}

export function parseViaGeometry(definition: ViaDefinition) {
  // Color themes do not affect key geometry. Imported custom themes can exceed the reader's color limit.
  const rows = definition.layouts.keymap.map(row => Array.isArray(row) ? row.map(key => {
    if (typeof key === 'string') return key
    const { c, t, ...geometry } = key
    return geometry
  }) : row)
  return kleLayoutToVIALayout(rows)
}

export function visibleViaLayout(parsed: VIALayout, columns: number, values: number[] = []) {
  const alternate = Object.entries(parsed.optionKeys).flatMap(([group, variants]) =>
    variants[values[Number(group)] ?? 0] ?? [])
  const keys = [...parsed.keys, ...alternate]
    .filter(key => !key.d && key.row >= 0 && key.col >= 0)
    .map(key => ({ index: key.row * columns + key.col, x: key.x, y: key.y, w: key.w, h: key.h,
      angle: key.r, originX: key.rx - key.x, originY: key.ry - key.y }))
  return fitKeys(keys)
}
