export const sceneWidth = 240
export const sceneHeight = 132

export type Paw = 'rest' | 'left' | 'right'

const colors = {
  paper: '#eaf0e8', shadow: '#cedbce', ink: '#293e36', fur: '#e9b37e', cream: '#fff0d8',
  stripe: '#ac704d', blush: '#dc9786', case: '#52705e', key: '#d5e3cf', accent: '#93bc78',
}
export function drawCat(ctx: CanvasRenderingContext2D, paw: Paw, angry: boolean) {
  const c = colors
  ctx.fillStyle = c.paper
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.lineWidth = 2.6
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  function shape(path: string, fill: string, outline = true) {
    const p = new Path2D(path)
    ctx.fillStyle = fill
    ctx.fill(p)
    if (outline) { ctx.strokeStyle = c.ink; ctx.stroke(p) }
  }
  function stroke(path: string, color = c.ink) {
    ctx.strokeStyle = color
    ctx.stroke(new Path2D(path))
  }
  function oval(x: number, y: number, rx: number, ry: number, fill: string) {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
  }

  oval(121, 116, 92, 7, c.shadow)
  shape('M165 92 Q189 96 190 78 Q190 72 186 68 Q181 62 187 58 Q195 54 201 66 Q215 99 181 107 L162 107 Z', c.fur)
  stroke('M191 76 L200 72 M192 85 L203 82', c.stripe)
  ctx.save()
  ctx.translate(0, paw === 'rest' ? 0 : 1)
  shape('M67 98 Q63 81 74 62 L74 32 Q74 25 80 28 L99 39 Q115 32 136 38 L154 23 Q159 20 160 28 L165 53 Q176 64 178 80 Q179 94 171 103 Z', c.fur)
  shape('M79 34 L92 42 L79 47 Z M154 30 L156 44 L144 40 Z', c.blush, false)
  shape('M101 39 L106 48 Q108 51 109 46 L110 37 Z M116 36 L120 47 Q122 49 123 45 L125 36 Z M131 37 L133 45 L138 38 Z', c.stripe, false)
  shape('M78 90 Q81 70 99 72 Q108 69 117 74 Q125 68 138 72 Q153 73 162 94 L163 103 L76 103 Z', c.cream, false)
  if (angry) {
    shape('M90 55 L106 61 Q100 67 96 63 Z M145 54 L129 60 Q135 66 139 62 Z', c.ink, false)
    stroke('M110 76 Q117 67 124 75')
    stroke('M172 25 Q177 27 177 32 M181 32 Q181 27 186 25 M186 38 Q181 36 181 33 M177 34 Q177 38 172 39', '#b34e39')
  } else {
    oval(98, 61, 3, 4, c.ink)
    oval(137, 60, 3, 4, c.ink)
    ctx.lineWidth = 1.6
    stroke('M117 70 Q114 76 110 72 M117 70 Q119 75 124 71')
  }
  oval(87, 69, 5, 2.6, c.blush)
  oval(148, 68, 5, 2.6, c.blush)
  shape('M113 66 Q117 64 121 66 L117 70 Z', c.ink, false)
  ctx.lineWidth = 1.6
  stroke('M83 69 L65 65 M84 74 L66 77 M151 68 L169 62 M151 73 L171 74')
  ctx.restore()

  shape('M58 90 L167 86 Q170 86 172 89 L184 108 L184 114 Q184 117 180 117 L51 121 Q47 121 47 117 L47 111 Z', c.case)
  shape('M58 90 L168 87 L181 109 L49 114 Z', c.key)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 10; col++) {
      const x = 60 + col * 10.8 - row * 2.3
      const y = 93 + row * 6 - col * .37
      ctx.fillStyle = (paw === 'left' && col === 2 || paw === 'right' && col === 7) && row === 1 ? c.accent : c.case
      ctx.fillRect(x, y, 8, 3.6)
    }
  }
  for (const [side, x] of [['left', 83], ['right', 147]] as const) {
    ctx.save()
    ctx.translate(x, paw === side ? 98 : 86)
    ctx.rotate(side === 'left' ? -.18 : .18)
    shape('M-11 -7 Q-9 -14 1 -13 Q12 -13 13 -4 Q15 5 7 7 Q3 10 -3 7 Q-12 8 -12 0 Z', c.cream)
    ctx.lineWidth = 1.3
    stroke('M-5 3 L-5 6 M2 3 L2 7', c.stripe)
    ctx.restore()
  }
}
