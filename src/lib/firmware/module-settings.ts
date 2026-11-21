// Num Word is an upstream behavior with a devicetree definition and no web editor.
export const numWord = {
  repository: 'https://github.com/urob/zmk-auto-layer',
  name: 'Auto Layer · Num Word',
  summary: 'Keep the number layer active while typing numbers.',
  author: { name: 'urob', url: 'https://github.com/urob' },
  revision: 'v0.3',
  overlay: '#include <behaviors/num_word.dtsi>',
}

// The enable switches from each editor's upstream installation instructions.
const switches: Record<string, string[]> = {
  'zmk-module-battery-history': ['ZMK_BATTERY_REPORTING', 'ZMK_BATTERY_HISTORY', 'ZMK_BATTERY_HISTORY_STUDIO_RPC'],
  'zmk-module-ble-management': ['ZMK_BLE_MANAGEMENT', 'ZMK_BLE_MANAGEMENT_STUDIO_RPC'],
  'zmk-feature-custom-settings': ['ZMK_CUSTOM_SETTINGS', 'ZMK_CUSTOM_SETTINGS_STUDIO_RPC'],
  'zmk-feature-device-info': ['ZMK_DEVICE_INFO', 'ZMK_DEVICE_INFO_STUDIO_RPC'],
  'zmk-feature-fast-keymap': ['ZMK_FAST_KEYMAP', 'ZMK_FAST_KEYMAP_STUDIO_RPC'],
  'zmk-feature-os-detection': ['ZMK_OS_DETECTION', 'ZMK_OS_DETECTION_STUDIO_RPC'],
  'zmk-feature-input-stream': ['ZMK_INPUT_STREAM_FEATURE', 'ZMK_INPUT_STREAM_FEATURE_STUDIO_RPC'],
  'zmk-feature-kscan-diagnostics': ['ZMK_KSCAN_DIAGNOSTICS', 'ZMK_KSCAN_DIAGNOSTICS_STUDIO_RPC'],
  'zmk-led-brightness-rpc': ['ZMK_LED_BRIGHTNESS', 'ZMK_LED_BRIGHTNESS_STUDIO_RPC'],
  'zmk-feature-module-physical-layout': ['ZMK_PHYSICAL_LAYOUTS_FEATURE', 'ZMK_PHYSICAL_LAYOUTS_FEATURE_STUDIO_RPC'],
  'zmk-driver-pmw3610-with-custom-studio-rpc': ['PMW3610', 'INPUT', 'ZMK_POINTING', 'ZMK_PMW3610_STUDIO_RPC'],
  'zmk-feature-runtime-combo': ['ZMK_RUNTIME_COMBO', 'ZMK_RUNTIME_COMBO_STUDIO_RPC'],
  'zmk-feature-runtime-input-processor': ['ZMK_RUNTIME_INPUT_PROCESSOR', 'ZMK_RUNTIME_INPUT_PROCESSOR_STUDIO_RPC'],
  'zmk-feature-runtime-macro': ['ZMK_RUNTIME_MACRO', 'ZMK_RUNTIME_MACRO_STUDIO_RPC'],
  'zmk-feature-runtime-tapdance': ['ZMK_RUNTIME_TAPDANCE', 'ZMK_RUNTIME_TAPDANCE_STUDIO_RPC'],
  'zmk-module-settings-rpc': ['ZMK_SETTINGS_RPC', 'ZMK_SETTINGS_RPC_STUDIO'],
  'zmk-feature-studio-rpc-perf': ['ZMK_STUDIO_RPC_PERF', 'ZMK_STUDIO_RPC_PERF_HANDLER'],
  'zmk-feature-watchdog': ['ZMK_WATCHDOG', 'ZMK_WATCHDOG_STUDIO_RPC'],
  'zmk-feature-zephyr-setting-expose': ['ZMK_SETTING_EXPOSE'],
}
export function moduleSettings(urls: string[]) {
  const flags = new Set<string>()
  for (const url of urls) {
    const match = /^https:\/\/github\.com\/cormoran\/([^/]+)$/i.exec(url)
    if (!match || !switches[match[1]]) continue
    for (const flag of ['ZMK_STUDIO', ...switches[match[1]]]) flags.add('CONFIG_' + flag + '=y')
  }
  return [...flags]
}
