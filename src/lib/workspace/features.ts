export type Protocol = 'via' | 'studio' | 'hmk'
export type Tool = 'keymap' | 'layout' | 'lighting' | 'custom' | 'actuation' | 'advanced' | 'gamepad' | 'profiles' | 'calibration' | 'settings' | 'extensions' | 'design' | 'test' | 'bindings'

export const tools: Record<Tool, string> = {
  keymap: 'Keymap', layout: 'Layout', bindings: 'Combos & macros', lighting: 'Lighting', custom: 'Custom controls', actuation: 'Key feel',
  advanced: 'Advanced keys', gamepad: 'Gamepad', profiles: 'Profiles', calibration: 'Calibration',
  settings: 'Device', extensions: 'Studio modules', design: 'Definition library', test: 'Key tester',
}

export function availableTools(protocol: Protocol | null, lighting: boolean, custom: boolean): Tool[] {
  if (protocol === 'hmk') return ['keymap', 'layout', 'actuation', 'advanced', 'gamepad', 'calibration', 'profiles', 'test', 'settings']
  if (protocol === 'studio') return ['keymap', 'layout', 'bindings', 'extensions', 'test']
  if (protocol === 'via') {
    const result: Tool[] = ['keymap', 'layout']
    if (lighting) result.push('lighting')
    if (custom) result.push('custom')
    return [...result, 'test', 'settings']
  }
  return ['design', 'extensions', 'bindings', 'test']
}
