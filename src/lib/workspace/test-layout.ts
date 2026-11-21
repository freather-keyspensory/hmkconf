export type TestKey = { angle?: number; originX?: number; originY?: number; code: string; label: string; x: number; y: number; w: number; h: number }
const keys: TestKey[] = []
function row(top: number, left: number, codes: string, labels: string, widths: Record<string, number> = {}, heights: Record<string, number> = {}) {
  const legends = labels.split(' ')
  for (const [index, code] of codes.split(' ').entries()) {
    const width = widths[code] ?? 1
    keys.push({ code, label: legends[index], x: left, y: top, w: width, h: heights[code] ?? 1 })
    left += width
  }
}

row(0, 0, 'Escape', 'Esc')
for (let group = 0; group < 3; group++) {
  const names = Array.from({length: 4}, (_, index) => 'F' + (group * 4 + index + 1)).join(' ')
  row(0, 2 + group * 4.5, names, names)
}
row(0, 15.25, 'PrintScreen ScrollLock Pause', 'PrtSc ScrLk Pause')
row(0, 18.5, 'AudioVolumeMute AudioVolumeDown AudioVolumeUp MediaPlayPause', 'Mute Vol− Vol+ Play')
row(1.25, 0, 'Backquote Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal Backspace', '~ 1 2 3 4 5 6 7 8 9 0 − = Backspace', {Backspace:2})
row(2.25, 0, 'Tab KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP BracketLeft BracketRight Backslash', 'Tab Q W E R T Y U I O P [ ] ∖', {Tab:1.5,Backslash:1.5})
row(3.25, 0, 'CapsLock KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote Enter', "Caps A S D F G H J K L ; ' Enter", {CapsLock:1.75,Enter:2.25})
row(4.25, 0, 'ShiftLeft KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash ShiftRight', 'Shift Z X C V B N M , . / Shift', {ShiftLeft:2.25,ShiftRight:2.75})
row(5.25, 0, 'ControlLeft MetaLeft AltLeft Space AltRight MetaRight ContextMenu ControlRight', 'Ctrl Meta Alt Space Alt Meta Menu Ctrl', {ControlLeft:1.25,MetaLeft:1.25,AltLeft:1.25,Space:6.25,AltRight:1.25,MetaRight:1.25,ContextMenu:1.25,ControlRight:1.25})
row(1.25, 15.25, 'Insert Home PageUp', 'Ins Home PgUp')
row(2.25, 15.25, 'Delete End PageDown', 'Del End PgDn')
row(4.25, 16.25, 'ArrowUp', '↑')
row(5.25, 15.25, 'ArrowLeft ArrowDown ArrowRight', '← ↓ →')
row(1.25, 18.5, 'NumLock NumpadDivide NumpadMultiply NumpadSubtract', 'Num / * −')
row(2.25, 18.5, 'Numpad7 Numpad8 Numpad9 NumpadAdd', '7 8 9 +', {}, {NumpadAdd:2})
row(3.25, 18.5, 'Numpad4 Numpad5 Numpad6', '4 5 6')
row(4.25, 18.5, 'Numpad1 Numpad2 Numpad3 NumpadEnter', '1 2 3 Enter', {}, {NumpadEnter:2})
row(5.25, 18.5, 'Numpad0 NumpadDecimal', '0 .', {Numpad0:2})

export const fullKeyboard = { keys, width: 22.5, height: 6.25 }
export type MatrixSource = {
  layout: typeof fullKeyboard
  read: (signal: AbortSignal) => Promise<number[]>
  pulse?: () => void
}
