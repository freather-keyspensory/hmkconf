<script lang="ts">
  import { keyboardContext } from '$lib/keyboard'
  import { globalStateContext, displayLayoutContext, remapStateContext } from '$lib/configurator/context.svelte'
  import { keymapQueryContext } from '$lib/configurator/queries/keymap-query.svelte'
  import { Button } from '$lib/components/ui/button'
  import KeycodeAccordion from '$lib/components/keycode-accordion.svelte'
  import { t } from '$lib/i18n'
  import { Keycode } from '$lib/libhmk/keycodes'
  import KeyCanvas from './key-canvas.svelte'
  import KeymapLayers from './keymap-layers.svelte'
  import { hmkLegend } from './hmk-key-values'

  let { disabled }: { disabled: boolean } = $props()
  const board = keyboardContext.get()
  const layout = displayLayoutContext.get()
  const state = remapStateContext.get()
  const global = globalStateContext.get()
  const query = keymapQueryContext.get()
  const layer = $derived(query.keymap.current?.[state.layer])
  const keys = $derived(layout.displayKeys.map(key => ({ ...key, index: key.key })))
  function label(index: number) {
    const value = layer?.[index]
    return value === undefined ? '—' : hmkLegend(value)
  }
  function assign(index: number | null, value: number) {
    if (index === null || disabled || !layer || layer[index] === value) return
    void query.set({ layer: state.layer, offset: index, data: [value] })
  }
</script>

<section class="mx-auto w-full max-w-5xl p-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <KeymapLayers count={board.metadata.numLayers} current={state.layer} {disabled} onSelect={index => state.layer = index}/>
    <div class="flex items-center gap-2">
      <Button size="sm" variant="destructive" disabled={disabled || !layer}
        onclick={() => query.set({ layer: state.layer, offset: 0, data: board.metadata.defaultKeymaps[global.profile][state.layer] })}>{$t('Reset Current Layer')}</Button>
    </div>
  </div>
  <KeyCanvas {keys} width={layout.width} height={layout.height} scale={64} selected={state.key}
    disabled={disabled || !layer} {label} onSelect={index => state.key = index}
    onClear={index => assign(index, Keycode.KC_NO)}/>
  <div class="rounded-lg border p-5">
    <h2 class="font-medium">{state.key === null ? $t('Assign keycode · select a key above') : $t('Assign keycode · key {number}', { number: state.key + 1 })}</h2>
    {#if state.key !== null}<p class="mt-1 text-sm text-muted-foreground">{label(state.key)}</p>{/if}
    <KeycodeAccordion workspacePicker bindingDisabled={disabled || !layer || state.key === null}
      onKeycodeSelected={value => assign(state.key, value)}/>
  </div>
</section>
