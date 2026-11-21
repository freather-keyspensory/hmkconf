import { Keycode as K } from '$lib/libhmk/keycodes'
import { getKeycodeMetadata } from '$lib/keycodes'
import { hidLegend } from './key-values'

// HMK firmware IDs are compact indices into its keycode_to_hid table.
const usages = new Map<number, number>()
function keyboardRange(first: number, last: number, firstUsage: number) {
  for (let code = first; code <= last; code++) usages.set(code, 0x70000 + firstUsage + code - first)
}
keyboardRange(K.KC_A, K.KC_APPLICATION, 4)
keyboardRange(K.KC_F13, K.KC_F24, 0x68)
keyboardRange(K.KC_INTERNATIONAL_1, K.KC_INTERNATIONAL_6, 0x87)
keyboardRange(K.KC_LANGUAGE_1, K.KC_LANGUAGE_5, 0x90)
keyboardRange(K.KC_LEFT_CTRL, K.KC_RIGHT_GUI, 0xe0)
for (const [code, usage] of [
  [K.KC_MUTE, 0xe2], [K.KC_VOLU, 0xe9], [K.KC_VOLD, 0xea], [K.KC_MNXT, 0xb5],
  [K.KC_MPRV, 0xb6], [K.KC_MSTP, 0xb7], [K.KC_MPLY, 0xcd], [K.KC_MSEL, 0x183],
  [K.KC_MAIL, 0x18a], [K.KC_CALC, 0x192], [K.KC_MYCM, 0x194], [K.KC_WSCH, 0x221],
  [K.KC_WHOM, 0x223], [K.KC_WBAK, 0x224], [K.KC_WFWD, 0x225], [K.KC_WREF, 0x227],
  [K.KC_WFAV, 0x22a], [K.KC_BRIU, 0x6f], [K.KC_BRID, 0x70],
]) usages.set(code, 0xc0000 + usage)
usages.set(K.KC_PWR, 0x10081).set(K.KC_SLEP, 0x10082).set(K.KC_WAKE, 0x10083)
const native = new Map(Array.from(usages, ([code, usage]) => [usage, code]))
export const hmkKeyValue = (usage: number) => native.get(usage)
export function hmkLegend(code: number) {
  if (code === K.KC_TRANSPARENT) return '▽'
  if (code === K.KC_NO) return 'KC_NO'
  const usage = usages.get(code)
  return usage === undefined ? getKeycodeMetadata(code).name : hidLegend(usage)
}
