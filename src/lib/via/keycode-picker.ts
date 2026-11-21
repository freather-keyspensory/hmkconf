type Keycode = { name: string; code: string; value: number; title?: string }
type RowSpec = { label: string; actions: [code: string, caption: string][] }

function pair(label: string, decrease: string, increase: string): RowSpec {
  return { label, actions: [[decrease, '−'], [increase, '+']] }
}

const layouts: Record<string, RowSpec[]> = {
  wt_lighting: [
    pair('Brightness', 'BR_DEC', 'BR_INC'),
    pair('Effect', 'EF_DEC', 'EF_INC'),
    pair('Effect speed', 'ES_DEC', 'ES_INC'),
    pair('Color 1 hue', 'H1_DEC', 'H1_INC'),
    pair('Color 1 saturation', 'S1_DEC', 'S1_INC'),
    pair('Color 2 hue', 'H2_DEC', 'H2_INC'),
    pair('Color 2 saturation', 'S2_DEC', 'S2_INC'),
  ],
  qmk_lighting: [
    { label: 'Backlight', actions: [['BL_TOGG', 'Toggle'], ['BL_ON', 'On'], ['BL_OFF', 'Off'], ['BL_STEP', 'Cycle'], ['BL_BRTG', 'Toggle breathing']] },
    pair('Backlight brightness', 'BL_DEC', 'BL_INC'),
    { label: 'RGB lighting', actions: [['RGB_TOG', 'Toggle']] },
    pair('Brightness', 'RGB_VAD', 'RGB_VAI'),
    pair('Effect', 'RGB_RMOD', 'RGB_MOD'),
    pair('Effect speed', 'RGB_SPD', 'RGB_SPI'),
    pair('Hue', 'RGB_HUD', 'RGB_HUI'),
    pair('Saturation', 'RGB_SAD', 'RGB_SAI'),
    { label: 'RGB presets', actions: [
      ['RGB_M_P', 'Solid'], ['RGB_M_B', 'Breathing'], ['RGB_M_R', 'Rainbow'], ['RGB_M_SW', 'Swirl'],
      ['RGB_M_SN', 'Snake'], ['RGB_M_K', 'Knight'], ['RGB_M_X', 'Christmas'], ['RGB_M_G', 'Gradient'],
    ] },
  ],
  media: [
    { label: 'Volume', actions: [['KC_VOLD', '−'], ['KC_VOLU', '+'], ['KC_MUTE', 'Mute']] },
    { label: 'Playback', actions: [['KC_MPLY', 'Play / pause'], ['KC_MSTP', 'Stop']] },
    { label: 'Track', actions: [['KC_MPRV', 'Previous'], ['KC_MNXT', 'Next'], ['KC_MRWD', 'Rewind'], ['KC_MFFD', 'Fast forward']] },
    { label: 'Player', actions: [['KC_MSEL', 'Select'], ['KC_EJCT', 'Eject']] },
  ],
}

export function pickerRows(category: string, items: Keycode[], search: string, t: (text: string) => string) {
  const query = search.trim().toLowerCase()
  const remaining = new Map(items.map(item => [item.code, item]))
  const rows: { label: string; actions: { item: Keycode; caption: string; name: string; column?: number }[] }[] = []

  function matches(item: Keycode, label = '', caption = '') {
    return [item.code, item.name, item.title, label, caption].join(' ').toLowerCase().includes(query)
  }

  for (const spec of layouts[category] ?? []) {
    const label = t(spec.label)
    const actions = []
    for (const [code, text] of spec.actions) {
      const item = remaining.get(code)
      if (!item) continue
      remaining.delete(code)
      const caption = t(text)
      if (!matches(item, label, caption)) continue
      const column = text === '−' ? 1 : text === '+' ? 2 : undefined
      actions.push({ item, caption, name: label + ' · ' + caption, column })
    }
    if (actions.length) rows.push({ label, actions })
  }

  const rest = [...remaining.values()].filter(item => matches(item))
  if (rest.length) rows.push({ label: '', actions: rest.map(item => ({ item, caption: item.name, name: item.name })) })
  return rows
}
