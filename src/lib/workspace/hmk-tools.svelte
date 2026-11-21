<script lang="ts">
  import { t } from '$lib/i18n'
  import { untrack } from 'svelte'
  import { keyboardContext, type Keyboard, type SetKeymapParams } from '$lib/keyboard'
  import { setConfiguratorStateContext, remapStateContext, performanceStateContext, layoutToolContext, displayLayoutContext, persistedStateContext, gamepadStateContext } from '$lib/configurator/context.svelte'
  import { keymapQueryContext } from '$lib/configurator/queries/keymap-query.svelte'
  import { setConfiguratorQueryContext } from '$lib/configurator/queries'
  import { fitKeys } from './key-geometry'
  import KeyCanvas from './key-canvas.svelte'
  import LayoutOptions from './layout-options.svelte'
  import HmkKeymap from './hmk-keymap.svelte'
  import Performance from '$lib/configurator/performance/performance-tab.svelte'
  import Advanced from '$lib/configurator/advanced-keys/advanced-keys-tab.svelte'
  import Gamepad from '$lib/configurator/gamepad/gamepad-tab.svelte'
  import Calibration from '$lib/configurator/calibration/calibration-tab.svelte'
  import Profiles from '$lib/configurator/profiles/profiles-tab.svelte'
  import Settings from '$lib/configurator/settings/settings-tab.svelte'
  import ProfileSelect from '$lib/configurator/profile-select.svelte'
  import { tools, type Tool } from './features'

  let { keyboard, view, onBusy }: { keyboard: Keyboard; view: Tool; onBusy: (busy: boolean) => void } = $props()
  const board = untrack(() => keyboard)
  let status = $state('')
  let pending = $state(0)
  let queue = Promise.resolve()
  let failure = ''
  keyboardContext.set(new Proxy(board, {
    get(target, property: keyof Keyboard) {
      const method = target[property]
      if (typeof method !== 'function') return method
      if (typeof property !== 'string' || !/^(set|resetProfile|duplicateProfile|saveCalibrationThreshold)/.test(property)) return method.bind(target)
      return (...args: unknown[]) => {
        if (!pending) failure = ''
        pending++
        onBusy(true)
        status = 'Saving…'
        const operation = queue.then(async () => {
          await Reflect.apply(method, target, args)
          if (property === 'setKeymap') {
            const { profile, layer, offset, data } = args[0] as SetKeymapParams
            const read = await target.getKeymap({ profile })
            if (data.some((code, index) => read[layer]?.[offset + index] !== code)) throw Error('Keymap readback differs.')
          }
        }).catch(error => {
          failure = 'Not confirmed · ' + String(error)
          throw error
        }).finally(() => {
          if (!--pending) {
            status = failure || (board.demo ? 'Saved in sample session.' : 'Keyboard accepted the edit.')
            onBusy(false)
          }
        })
        queue = operation.catch(() => {})
        return operation
      }
    },
  }))
  setConfiguratorStateContext()
  setConfiguratorQueryContext()
  const { keymap } = keymapQueryContext.get()
  export function keymapLoad() {
    return {
      ready: keymap.current !== undefined,
      notice: keymap.error?.message,
      retry: keymap.error ? () => keymap.refetch() : undefined,
    }
  }
  layoutToolContext.set(true)
  const layout = displayLayoutContext.get()
  const saved = persistedStateContext.get()
  const gamepad = gamepadStateContext.get()
  const preview = $derived(fitKeys(layout.displayKeys.map(key => ({ ...key, index: key.key }))))
  function chooseLayout(group: number, value: number) {
    saved.current.layoutOptions[group] = value
    const visible = new Set(layout.displayKeys.map(key => key.key))
    if (remap.key !== null && !visible.has(remap.key)) remap.key = null
    if (gamepad.key !== null && !visible.has(gamepad.key)) gamepad.key = null
    for (const key of performance.keys) if (!visible.has(key)) performance.keys.delete(key)
  }
  const remap = remapStateContext.get()
  const performance = performanceStateContext.get()
  let lastEditor: Tool = 'keymap'
  $effect(() => {
    const next = view
    untrack(() => {
      if (next === 'actuation' && lastEditor === 'keymap' && remap.key !== null) {
        performance.keys.clear()
        performance.keys.add(remap.key)
      } else if (next === 'keymap' && lastEditor === 'actuation' && performance.keys.size === 1) {
        remap.key = [...performance.keys][0]
      }
      if (next === 'actuation' || next === 'keymap') lastEditor = next
    })
  })
</script>

<div class="flex min-w-0 flex-col">
  <div class="flex flex-wrap items-center gap-3 border-b px-5 py-3">
    <h1 class="mr-auto text-xl font-semibold">{$t(tools[view])}</h1>
    <span class="text-xs text-muted-foreground" role="status">{$t(status)}</span>{#if view !== 'layout'}<ProfileSelect/>{/if}
  </div>
  <div class={view === 'keymap' || view === 'layout' ? 'w-full' : 'flex h-[max(36rem,calc(100dvh-8rem))] flex-col overflow-auto'}>
    {#if view === 'keymap'}<HmkKeymap disabled={pending > 0}/>
    {:else if view === 'layout'}
      <section class="mx-auto grid w-full max-w-5xl gap-4 p-4">
        {#if board.metadata.layout.labels.length}
          <LayoutOptions labels={board.metadata.layout.labels} values={saved.current.layoutOptions} disabled={pending > 0} onChange={chooseLayout}/>
          <p class="text-sm text-muted-foreground">{$t('Layout choices are saved in this browser for this keyboard.')}</p>
        {:else}<p class="text-sm text-muted-foreground">{$t('Fixed physical layout')}</p>{/if}
        <KeyCanvas {...preview} scale={64} selected={null} disabled
          label={index => String(index + 1)} onSelect={() => {}}/>
        <span class="text-sm text-muted-foreground">{$t('{count} physical positions', { count: preview.keys.length })}</span>
      </section>
    {:else if view === 'actuation'}<Performance/>
    {:else if view === 'advanced'}<Advanced/>
    {:else if view === 'calibration'}<Calibration/>
    {:else if view === 'gamepad'}<Gamepad/>
    {:else if view === 'profiles'}<Profiles/>
    {:else if view === 'settings'}<Settings/>{/if}
  </div>
</div>
