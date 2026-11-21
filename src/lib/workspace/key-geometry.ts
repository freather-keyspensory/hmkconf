export type CanvasKey = { index: number; x: number; y: number; w: number; h: number; angle?: number; originX?: number; originY?: number; upperLeftExtension?: number }

// The top row of ISO Enter extends to the left of its lower stem. Use a single
// closed contour for the visible rim and the button's pointer hit area.
export function isoEnterPath(width: number, height: number, stemLeft: number, shoulderY: number) {
  const r = Math.min(6, stemLeft / 2, shoulderY / 2, (height - shoulderY) / 2)
  return [
    `M ${r} 0 H ${width-r} q ${r} 0 ${r} ${r}`,
    `V ${height-r} q 0 ${r} -${r} ${r}`,
    `H ${stemLeft+r} q -${r} 0 -${r} -${r}`,
    `V ${shoulderY+r} q 0 -${r} -${r} -${r}`,
    `H ${r} q -${r} 0 -${r} -${r}`,
    `V ${r} q 0 -${r} ${r} -${r} Z`,
  ].join(' ')
}

export function fitKeys(keys: CanvasKey[]) {
  if (!keys.length) return { keys, width: 1, height: 1 }
  const corners = keys.flatMap(key => {
    const radians = (key.angle ?? 0) * Math.PI / 180
    const cos = Math.cos(radians), sin = Math.sin(radians)
    const ox = key.originX ?? 0, oy = key.originY ?? 0
    return [0, key.w].flatMap(x => [0, key.h].map(y => ({
      x: key.x + ox + (x - ox) * cos - (y - oy) * sin,
      y: key.y + oy + (x - ox) * sin + (y - oy) * cos,
    })))
  })
  const minX = Math.min(...corners.map(p => p.x)), minY = Math.min(...corners.map(p => p.y))
  return {
    width: Math.max(...corners.map(p => p.x)) - minX,
    height: Math.max(...corners.map(p => p.y)) - minY,
    keys: keys.map(key => ({ ...key, x: key.x - minX, y: key.y - minY })),
  }
}
