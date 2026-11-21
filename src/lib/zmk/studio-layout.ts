import type { PhysicalLayout, PhysicalLayouts } from '@zmkfirmware/zmk-studio-ts-client/keymap'
import { fitKeys } from '$lib/workspace/key-geometry'

// Electrical addresses of the ANSI 87 switches in the Vortex 80+pad PCB,
// in physical-layout order. The firmware matrix has 16 columns.
const vortexAnsiAddresses = [
  0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 31,
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 46, 47,
  32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 61, 62, 63, 79,
  48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
  64, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 78,
  80, 81, 82, 86, 89, 90, 91, 92, 93, 94, 95,
]

function vortexPositions(matrix: PhysicalLayout) {
  const slots = new Map<number, number>()
  for (const [index, key] of matrix.keys.entries()) {
    // This firmware's diagnostic layout spaces matrix rows and columns by 1.1u.
    const row = key.y / 110, col = key.x / 110
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= 6 || col < 0 || col >= 16) return
    slots.set(row * 16 + col, index)
  }
  if (slots.size !== matrix.keys.length || !vortexAnsiAddresses.every(address => slots.has(address))) return
  return vortexAnsiAddresses.map(address => slots.get(address)!)
}

export function studioLayoutPreview(device: string, layouts?: PhysicalLayouts) {
  const active = layouts?.layouts[layouts.activeLayoutIndex]
  if (!active?.keys.length) return
  let display = active
  let positions: number[] | undefined
  if (device === 'Vortex_TKL' && active.name === 'All wired positions (matrix view)') {
    const ansi = layouts?.layouts.find(item => item.name === 'ANSI 87' && item.keys.length === vortexAnsiAddresses.length)
    if (ansi) {
      positions = vortexPositions(active)
      if (positions) display = ansi
    }
  }
  const vortexIso = device === 'Vortex_TKL' && display.name.split('/').some(part => part.trim() === 'ISO')
  const canvas = fitKeys(display.keys.map((key, index) => {
    // Vortex describes MX100 by its 1.25u × 2u stem. The top of the cap is 1.5u.
    const upperLeftExtension = vortexIso && key.width === 125 && key.height === 200 ? 25 : undefined
    const x = key.x - (upperLeftExtension ?? 0)
    return {
      index: positions?.[index] ?? index, x, y: key.y, w: key.width + (upperLeftExtension ?? 0), h: key.height,
      upperLeftExtension, originX: key.rx - x, originY: key.ry - key.y, angle: key.r / 100,
    }
  }))
  return { ...canvas, projectedLayout: positions ? display.name : undefined }
}
