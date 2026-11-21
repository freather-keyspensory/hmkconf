<script lang="ts">
  import { t } from '$lib/i18n'
  import { onDestroy, onMount, untrack } from 'svelte'
  import { Button } from '$lib/components/ui/button'
  import { LockState } from '@zmkfirmware/zmk-studio-ts-client/core'
  import type { BehaviorBinding, Keymap, PhysicalLayouts } from '@zmkfirmware/zmk-studio-ts-client/keymap'
  import type { GetBehaviorDetailsResponse } from '@zmkfirmware/zmk-studio-ts-client/behaviors'
  import { connectBluetooth } from './bluetooth-transport'
  import { StudioSession } from './studio-session'
  import { createSampleStudioTransport } from './sample-transport'
  import { moduleEditors, type StudioModule } from './module-protocol'
  import { bindingLabel } from './binding-label'
  import LayoutOptions from '$lib/workspace/layout-options.svelte'
  import KeymapLayers from '$lib/workspace/keymap-layers.svelte'
  import StudioKeycodePicker from './keycode-picker.svelte'
  import { zmkKeyLegend, type PickerAction } from './key-picker'
  import { studioLayoutOptions } from './studio-layout-options'
  import { studioLayoutPreview } from './studio-layout'
  import ComboEditor from './combo-editor.svelte'
  import MacroEditor from './macro-editor.svelte'
  import { StudioActions } from './studio-actions.svelte'
  import KeyCanvas from '$lib/workspace/key-canvas.svelte'

  import { findKnownStudioPort, openStudioPort, rememberStudioPort, studioSerial } from './serial-transport'
  import type { RpcTransport } from '@zmkfirmware/zmk-studio-ts-client/transport/index'

  let { sample = false, view = 'keymap', inlineLayout = false, onNavigate = () => {}, onBusy = () => {}, onConnected = () => {}, onDisconnected = () => {}, onConnectError = () => {}, canAutoConnect = () => false }: {
    sample?: boolean
    onNavigate?: (view: 'keymap' | 'extensions') => void
    view?: string
    inlineLayout?: boolean
    onBusy?: (value: boolean) => void
    onConnected?: (name: string) => void
    onDisconnected?: (manual: boolean) => void
    onConnectError?: (error: string) => void
    canAutoConnect?: () => boolean
  } = $props()

  let actions = $state.raw(new StudioActions())
  let actionsLoaded = $state(false)
  let macrosLoaded = $state(false)
  let actionTab = $state<'combos' | 'macros'>('combos')
  let comboIndex = $state(0)
  const selectedCombo = $derived(actions.combos.find(item => item.index === comboIndex) ?? actions.combos[0])
  let assignNext = $state.raw<BehaviorBinding>()
  let session: StudioSession | undefined
  let destroyed = false
  let manualDisconnect = false
  let name = $state('')
  let status = $state('')
  let busy = $state(false)
  let editTimer = $state<ReturnType<typeof setTimeout>>()
  const occupied = $derived(busy || editTimer !== undefined)
  $effect(() => onBusy(occupied))
  let scanned = $state(false)
  let modules = $state.raw<StudioModule[]>([])
  let moduleStatus = $state('Scan to find modules exposed by this firmware.')
  let moduleValues = $state<Record<number, string>>({})
  let writing = false
  let ownPending = false
  let foreignChanges = $state(false)
  let unlocked = $state(false)
  let unsaved = $state(false)
  let keymap = $state.raw<Keymap>()
  let layouts = $state.raw<PhysicalLayouts>()
  let behaviors = $state.raw<GetBehaviorDetailsResponse[]>([])
  let layerIndex = $state(0)
  let position = $state<number | null>(null)
  const keyPress = $derived(behaviors.find(item => item.displayName === 'Key Press'))
  let draft = $state<BehaviorBinding>({ behaviorId: 0, param1: 0, param2: 0 })
  const layer = $derived(keymap?.layers[layerIndex])
  const behavior = $derived(behaviors.find(item => item.id === draft.behaviorId))
  let requestedLayout = $state<number>()
  const previewLayouts = $derived(layouts && requestedLayout !== undefined && requestedLayout !== layouts.activeLayoutIndex
    ? { ...layouts, activeLayoutIndex: requestedLayout } : layouts)
  const layoutControlsDisabled = $derived(!unlocked || foreignChanges || (occupied && requestedLayout === undefined))
  const groupedLayout = $derived(studioLayoutOptions(previewLayouts))
  const layoutPreview = $derived(studioLayoutPreview(name, previewLayouts))
  const runtimeMacro = $derived(behaviors.find(item => item.displayName === 'Runtime Macro'))
  function outputLabel(binding: BehaviorBinding) {
    if (runtimeMacro?.id === binding.behaviorId) {
      const entry = actions.macros?.macros.find(item => item.slot === binding.param1)
      if (entry) return entry.name
    }
    return bindingLabel(binding, behaviors.find(item => item.id === binding.behaviorId))
  }
  function extraAction(binding: BehaviorBinding, label: string, group: string): PickerAction {
    return {group, row: '', label, title: label, behaviorId: binding.behaviorId, args: [binding.param1, binding.param2]}
  }
  const macroActions = $derived((actions.macros?.macros ?? []).flatMap(item => runtimeMacro ?
    [extraAction({behaviorId: runtimeMacro.id, param1:item.slot, param2:0}, item.name, 'Macro')] : []))
  const comboActions = $derived(actions.combos.flatMap(item => item.behavior && item.keyPositions.length ?
    [extraAction(item.behavior, $t('Combo {number}', {number:item.index+1}) + ' · ' + outputLabel(item.behavior), 'Combo outputs')] : []))
  const comboKeyLabel = (index: number) => {
    const binding = keymap?.layers[0]?.bindings[index]
    return binding ? outputLabel(binding) : String(index + 1)
  }

  function keyLabel(index: number) {
    // Position numbers can refer to different switches until the new bindings arrive.
    if (previewLayouts !== layouts) return ''
    const binding = layer?.bindings[index]
    if (!binding) return '—'
    return outputLabel(binding)
  }
  const uint32 = (value: number) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff

  function selectPosition(index: number | null) {
    position = index
    const binding = index === null ? undefined : layer?.bindings[index]
    if (binding) draft = { ...binding }
  }

  function showKeymap(next: Keymap | undefined) {
    if (!next) throw Error('The keyboard did not return a Studio keymap.')
    keymap = next
    layerIndex = Math.min(layerIndex, Math.max(0, next.layers.length - 1))
    selectPosition(position !== null && layer?.bindings[position] ? position : null)
  }

  let keymapLoaded = $state(false)
  let readActivity = $state('')
  let readKiB = $state<number>()
  export function keymapLoad() {
    return {
      ready: keymapLoaded && unlocked,
      activity: busy && !keymapLoaded ? readActivity : '',
      readKiB: busy && !keymapLoaded ? readKiB : undefined,
      notice: name && !busy && !keymapLoaded ? status : '',
      retry: name && !busy && !keymapLoaded ? () => run(readKeyboard) : undefined,
    }
  }
  async function readKeyboard(active: StudioSession) {
    keymapLoaded = false
    actions = new StudioActions()
    actionsLoaded = false
    macrosLoaded = false
    assignNext = undefined
    readActivity = ''
    readKiB = undefined
    unlocked = (await active.request({ core: { getLockState: true } })).core?.getLockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    if (!unlocked) {
      keymap = undefined
      status = 'Use the Studio Unlock binding on the keyboard, then select Read keyboard.'
      return
    }
    showKeymap((await active.request({ keymap: { getKeymap: true } })).keymap?.getKeymap)
    readActivity = 'Reading physical layouts…'
    layouts = (await active.request({ keymap: { getPhysicalLayouts: true } }, bytes => {
      readKiB = Math.floor(bytes / 1024)
    })).keymap?.getPhysicalLayouts
    readActivity = 'Reading key behaviors…'
    readKiB = undefined
    const ids = (await active.request({ behaviors: { listAllBehaviors: true } })).behaviors?.listAllBehaviors?.behaviors ?? []
    const details: GetBehaviorDetailsResponse[] = []
    for (const id of ids) {
      const response = await active.request({ behaviors: { getBehaviorDetails: { behaviorId: id } } })
      if (response.behaviors?.getBehaviorDetails) details.push(response.behaviors.getBehaviorDetails)
    }
    behaviors = details
    unsaved = (await active.request({ keymap: { checkUnsavedChanges: true } })).keymap?.checkUnsavedChanges ?? false
    foreignChanges = unsaved && !ownPending
    keymapLoaded = session === active && unlocked
    status = foreignChanges ? 'Read only: the device already has pending changes. Resolve them in their originating editor and read the keyboard again.' : unsaved ? 'Last edit is not confirmed. Edit the binding again to retry.' : 'Keyboard settings loaded.'
  }

  export function connect(transport: 'usb' | 'bluetooth') {
    return open(async () => {
      if (transport === 'bluetooth') {
        if (!('bluetooth' in navigator)) throw Error('Web Bluetooth is unavailable in this browser.')
        return { connection: await connectBluetooth() }
      }
      const serial = studioSerial()
      if (!serial) throw Error('Web Serial is unavailable in this browser.')
      const port = await serial.requestPort()
      return { connection: await openStudioPort(port), verified: () => rememberStudioPort(port) }
    })
  }

  export function openKeyboard(prepare: () => Promise<RpcTransport>) {
    return open(async () => ({ connection: await prepare() }))
  }

  function openSample() {
    return open(async () => ({ connection: createSampleStudioTransport() }))
  }

  async function open(prepare: () => Promise<{ connection: RpcTransport; verified?: () => void }>, automatic = false) {
    if (busy || session || destroyed) return
    busy = true
    manualDisconnect = false
    status = 'Opening the Studio connection…'
    try {
      const { connection, verified } = await prepare()
      const active = new StudioSession(connection, () => {
        const interrupted = writing || editTimer !== undefined
        clearTimeout(editTimer)
        editTimer = undefined
        session = undefined
        keymapLoaded = false
        readActivity = ''
        readKiB = undefined
        requestedLayout = undefined
        name = ''
        unlocked = false
        keymap = undefined
        layouts = undefined
        behaviors = []
        actions = new StudioActions()
        actionsLoaded = false
        macrosLoaded = false
        assignNext = undefined
        unsaved = false
        ownPending = false
        scanned = false
        modules = []
        moduleValues = {}
        moduleStatus = 'Scan to find modules exposed by this firmware.'
        status = interrupted ? 'Not saved · Studio disconnected before confirmation.' : 'Studio disconnected.'
        if (interrupted && !destroyed) onConnectError(status)
        if (!destroyed) onDisconnected(manualDisconnect)
      }, notification => {
        if (notification.core?.lockStateChanged !== undefined) {
          unlocked = notification.core.lockStateChanged === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
          if (!unlocked) {
            assignNext = undefined
            keymapLoaded = false
            status = 'Use the Studio Unlock binding on the keyboard, then select Read keyboard.'
          }
          if (!unlocked && editTimer !== undefined) {
            clearTimeout(editTimer)
            editTimer = undefined
            status = 'Not saved · keyboard locked.'
          }
        }
        if (notification.keymap?.unsavedChangesStatusChanged !== undefined) {
          unsaved = notification.keymap.unsavedChangesStatusChanged
          if (!writing) foreignChanges = unsaved && !ownPending
        }
      })
      if (destroyed) {
        active.close()
        return
      }
      session = active
      const info = (await active.request({ core: { getDeviceInfo: true } })).core?.getDeviceInfo
      if (!info?.name) throw Error('The selected device did not identify itself as a ZMK Studio keyboard.')
      if (automatic && !canAutoConnect()) {
        active.close()
        return
      }
      verified?.()
      name = info.name
      onConnected(name)
      layerIndex = 0
      position = null
      await readKeyboard(active)
    } catch (error) {
      if (!name) session?.close()
      status = error instanceof Error ? error.message : String(error)
      if (!name && !automatic && !destroyed) onConnectError(status)
    } finally {
      busy = false
    }
  }

  async function run(action: (active: StudioSession) => Promise<void>) {
    if (busy || !session) return
    busy = true
    try {
      await action(session)
    } catch (error) {
      status = String(error)
    } finally {
      busy = false
    }
  }

  function edit(action: (active: StudioSession) => Promise<void>) {
    if (!unlocked || busy || foreignChanges) return
    void run(async active => {
      writing = true
      status = 'Saving…'
      try {
        await action(active)
        status = sample ? 'Saved in sample session.' : 'Saved to keyboard.'
      } catch (error) {
        status = 'Not confirmed · ' + (error instanceof Error ? error.message : String(error))
      } finally {
        writing = false
      }
    })
  }

  async function persist(active: StudioSession) {
    ownPending = true
    const result = await active.request({ keymap: { saveChanges: true } })
    if (!result.keymap?.saveChanges?.ok) throw Error('Firmware did not confirm the save.')
    if ((await active.request({ keymap: { checkUnsavedChanges: true } })).keymap?.checkUnsavedChanges !== false)
      throw Error('The keyboard did not confirm a clean saved state.')
    unsaved = false
    ownPending = false
  }

  function assign() {
    if (position === null || !layer || !behaviors.some(item => item.id === draft.behaviorId) || !uint32(draft.param1) || !uint32(draft.param2)) return
    const layerId = layer.id
    const keyPosition = position
    const binding = { ...draft }
    const current = layer.bindings[position]
    if (!unsaved && current?.behaviorId === binding.behaviorId && current.param1 === binding.param1 && current.param2 === binding.param2) return
    edit(async active => {
      const result = await active.request({ keymap: { setLayerBinding: { layerId, keyPosition, binding } } })
      if (result.keymap?.setLayerBinding !== 0) throw Error('The keyboard rejected that binding or parameter value.')
      unsaved = true
      await persist(active)
      showKeymap((await active.request({ keymap: { getKeymap: true } })).keymap?.getKeymap)
      const actual = layer?.bindings[keyPosition]
      if (!actual || actual.behaviorId !== binding.behaviorId || actual.param1 !== binding.param1 || actual.param2 !== binding.param2)
        throw Error('Binding readback differs from the requested edit.')
    })
  }

  function chooseBinding(binding: BehaviorBinding) {
    if (position === null || occupied || foreignChanges || !unlocked) return
    draft = { ...binding }
    assign()
  }

  function changeParameter(field: string, input: HTMLInputElement) {
    clearTimeout(editTimer)
    editTimer = undefined
    if (!input.validity.valid) {
      status = 'Not saved · enter a whole number in range.'
      return
    }
    draft = { ...draft, [field]: input.valueAsNumber }
    status = 'Editing…'
    editTimer = setTimeout(() => {
      editTimer = undefined
      status = 'No change.'
      assign()
    }, 450)
  }

  $effect(() => {
    if (view === 'extensions' && name && unlocked && !occupied && !scanned) scanModules()
  })

  export function moduleTools() {
    if (!name) return undefined
    return { name, unlocked, occupied, sample, modules, moduleValues, moduleStatus, status,
      scan: scanModules, read: () => run(readKeyboard), close: () => session?.close() }
  }

  function scanModules() {
    if (!session || !unlocked || occupied) return
    scanned = true
    void run(async active => {
      modules = []
      moduleValues = {}
      moduleStatus = 'Checking module support…'
      try {
        const result = await active.moduleRequest({ list: {} })
        if (!result.list) throw Error('No module listing returned.')
        modules = result.list.subsystems
        moduleStatus = modules.length ? 'Modules reported by this session' : 'No modules reported.'
        for (const item of modules) {
          const editor = moduleEditors.get(item.identifier)
          if (!editor) continue
          try {
            const { call } = await active.moduleRequest({ call: { index: item.index, payload: editor.request() } })
            if (!call || call.index !== item.index) throw Error('Unexpected module response.')
            moduleValues[item.index] = editor.display(call.payload)
          } catch (error) {
            moduleValues[item.index] = error instanceof Error ? error.message : String(error)
          }
        }
      } catch (error) {
        moduleStatus = modules.length ? String(error) : 'No compatible module listing available. The standard keymap editor does not require one.'
      }
    })
  }

  $effect(() => {
    if (!keymapLoaded || !unlocked || occupied) return
    if (view === 'bindings' && !actionsLoaded) {
      actionsLoaded = true
      untrack(() => void run(active => actions.readCombos(active)))
    } else if ((view === 'bindings' || view === 'keymap') && runtimeMacro && !macrosLoaded) {
      macrosLoaded = true
      untrack(() => void run(active => actions.discoverMacros(active)))
    }
  })
  $effect(() => { if (view !== 'keymap') assignNext = undefined })
  function startAssignment(binding: BehaviorBinding) {
    if (occupied || !unlocked || foreignChanges) return
    selectPosition(null)
    assignNext = {...binding}
    onNavigate('keymap')
  }
  function pickPosition(index: number) {
    selectPosition(index)
    if (assignNext) {
      const binding = assignNext
      assignNext = undefined
      chooseBinding(binding)
    }
  }
  function chooseLayout(index: number) {
    if (layoutControlsDisabled || !session || !layouts?.layouts[index] || index === previewLayouts?.activeLayoutIndex) return
    requestedLayout = index
    if (busy) return // The active writer will pick up the latest selection.
    edit(async active => {
      selectPosition(null)
      try {
        while (requestedLayout !== undefined && layouts) {
          const target: number = requestedLayout
          if (!unlocked) throw Error('Keyboard locked.')
          if (target !== layouts.activeLayoutIndex) {
            const reply = await active.request({ keymap: { setActivePhysicalLayout: target } })
            showKeymap(reply.keymap?.setActivePhysicalLayout?.ok)
            // A successful set acknowledges exactly this target and returns its bindings.
            layouts = { ...layouts, activeLayoutIndex: target }
            ownPending = true
            unsaved = true
          }
          if (target !== requestedLayout) continue
          if (!unlocked) throw Error('Keyboard locked.')
          await persist(active)
          if (target === requestedLayout) break
        }
      } catch (error) {
        // A rejected or interrupted save can still have switched the live layout.
        requestedLayout = undefined
        layouts = undefined
        keymap = undefined
        if (session === active && unlocked) {
          const reported = (await active.request({ keymap: { getPhysicalLayouts: true } })).keymap?.getPhysicalLayouts
          showKeymap((await active.request({ keymap: { getKeymap: true } })).keymap?.getKeymap)
          layouts = reported
        }
        throw error
      } finally {
        requestedLayout = undefined
      }
    })
  }

  onMount(() => {
    if (sample) {
      void openSample()
      return
    }
    const serial = studioSerial()
    if (!serial) return
    async function reconnect() {
      if (!serial || busy || session || !canAutoConnect()) return
      try {
        const port = await findKnownStudioPort(serial)
        if (port && canAutoConnect()) await open(async () => ({ connection: await openStudioPort(port) }), true)
      } catch {
        // A previously used port can be unavailable or held by another app.
      }
    }
    serial.addEventListener('connect', reconnect)
    void reconnect()
    return () => serial.removeEventListener('connect', reconnect)
  })
  onDestroy(() => {
    destroyed = true
    clearTimeout(editTimer)
    session?.close()
  })
</script>

{#snippet layoutOptions()}
  {#if groupedLayout && previewLayouts}
    {@const groups = groupedLayout}
    <LayoutOptions labels={groups.labels} values={groups.values} disabled={layoutControlsDisabled}
      available={(group, value) => groups.resolve(group, value) !== undefined}
      onChange={(group, value) => {
        const index = groups.resolve(group, value)
        if (index !== undefined) chooseLayout(index)
      }}/>
    {#if groups.matrix !== undefined}
      <details class="text-sm text-muted-foreground">
        <summary class="cursor-pointer">{$t('Firmware layout')}</summary>
        <div class="mt-2 flex flex-wrap items-center gap-3">
          <span>{previewLayouts.layouts[previewLayouts.activeLayoutIndex].name}</span>
          <Button size="sm" variant="outline" disabled={layoutControlsDisabled}
            onclick={() => chooseLayout(previewLayouts?.activeLayoutIndex === groups.matrix ? groups.baseline : groups.matrix!)}>
            {previewLayouts.activeLayoutIndex === groups.matrix ? $t('Use {layout}', {layout: previewLayouts.layouts[groups.baseline].name}) : $t('Use all wired positions')}
          </Button>
        </div>
      </details>
    {/if}
  {:else if previewLayouts?.layouts.length}
    <LayoutOptions labels={[[ 'Physical layout', ...previewLayouts.layouts.map((item, i) => item.name || $t('Layout {number}', { number: i + 1 })) ]]}
      values={[previewLayouts.activeLayoutIndex]} disabled={layoutControlsDisabled}
      onChange={(_, index) => chooseLayout(index)}/>
  {:else}<p class="text-sm text-muted-foreground">{$t('No physical layouts reported.')}</p>{/if}
{/snippet}

<section class="mx-auto grid w-full max-w-5xl gap-4 p-6" aria-label="ZMK Studio">
  <h1 class="text-2xl font-semibold">{$t(view === 'bindings' ? 'Combos & macros' : view === 'layout' ? 'Layout' : 'Keymap')}</h1>
  {#if view === 'keymap'}<p class="text-sm text-muted-foreground">{$t('Select a position to edit its native behavior. Completed edits save automatically.')}</p>{/if}
  {#if sample && !name}
    <Button class="justify-self-start" variant="outline" disabled={busy} onclick={openSample}>{$t("Reload sample")}</Button>
  {:else if name}
    <div class="flex flex-wrap items-center gap-3">
      <strong>{name}</strong>
      <span class="text-sm text-muted-foreground">{$t(unlocked ? 'Unlocked' : 'Locked')}</span>
      <Button size="sm" variant="outline" disabled={occupied} onclick={() => run(readKeyboard)}>{$t("Read keyboard")}</Button>
      <Button size="sm" variant="outline" disabled={occupied} onclick={() => { manualDisconnect = true; session?.close() }}>{$t(sample ? 'Close sample session' : 'Disconnect Studio')}</Button>
    </div>
  {/if}
  <p class="text-sm" role="status">{$t(status)}</p>

  {#if unlocked && layoutPreview?.projectedLayout}
    <p class="text-sm text-muted-foreground">{$t('Showing the {layout} physical layout.', { layout: layoutPreview.projectedLayout })}</p>
  {/if}
  {#if unlocked && view === 'bindings'}
    <div class="flex gap-2" role="group" aria-label={$t('Combos & macros')}>
      <Button variant={actionTab==='combos'?'secondary':'outline'} aria-pressed={actionTab==='combos'} onclick={() => actionTab='combos'}>{$t('Combos')}</Button>
      <Button variant={actionTab==='macros'?'secondary':'outline'} aria-pressed={actionTab==='macros'} onclick={() => actionTab='macros'}>{$t('Macros')}</Button>
    </div>
    {#if actionTab==='combos'}
      {#if selectedCombo}
        <label class="grid gap-1 text-sm">{$t('Combo slot')}
          <select class="rounded-md border bg-background p-2" disabled={occupied} value={selectedCombo.index} onchange={e=>comboIndex=Number(e.currentTarget.value)}>
            {#each actions.combos as item}<option value={item.index}>{$t('Combo {number}', {number:item.index+1})} · {item.keyPositions.length ? item.keyPositions.map(comboKeyLabel).join(' + ') : $t('Empty')}</option>{/each}
          </select>
        </label>
        {#key selectedCombo}
          <ComboEditor combo={selectedCombo} combos={actions.combos} canvas={layoutPreview} keyLabel={comboKeyLabel} {outputLabel}
            {behaviors} layers={keymap?.layers ?? []} extras={macroActions} disabled={occupied || foreignChanges}
            save={(original,next)=>edit(active=>actions.writeCombo(active,original,next,persist))} assign={startAssignment}/>
        {/key}
      {:else}<p class="text-sm text-muted-foreground">{$t(actions.comboMessage || 'Reading combo slots…')}</p>{/if}
    {:else}
      <MacroEditor {actions} {behaviors} layers={keymap?.layers ?? []} disabled={occupied || foreignChanges} {outputLabel}
        create={name=>edit(active=>actions.createMacro(active,name))}
        read={slot=>void run(async active=>{await actions.readMacro(active,slot)})}
        edit={(macro,change,expected)=>edit(active=>actions.writeStep(active,macro,change,expected))}
        assign={startAssignment} openModules={()=>onNavigate('extensions')}/>
    {/if}
  {:else if unlocked && view === 'layout'}
    {@render layoutOptions()}
    {#if layoutPreview}
      <KeyCanvas {...layoutPreview} scale={0.64} selected={null} disabled label={keyLabel} onSelect={() => {}}/>
      <span class="text-sm text-muted-foreground">{$t('{count} physical positions', { count: layoutPreview.keys.length })}</span>
    {/if}
  {:else if unlocked && layer}
    <KeymapLayers count={keymap?.layers.length ?? 0} current={layerIndex} names={keymap?.layers.map(item => item.name)}
      disabled={occupied} onSelect={index => { layerIndex = index; selectPosition(position !== null && layer?.bindings[position] ? position : null) }}/>
    {#if assignNext}
      <div class="flex items-center justify-between gap-2 rounded-md border p-3" role="status">
        <strong>{$t('Choose a key for {action}',{action:outputLabel(assignNext)})}</strong>
        <Button size="sm" variant="outline" onclick={()=>assignNext=undefined}>{$t('Cancel')}</Button>
      </div>
    {/if}
    {#if layoutPreview}
      <KeyCanvas {...layoutPreview} scale={0.64} selected={position} disabled={occupied} label={keyLabel}
        selectable={index => index < (layer?.bindings.length ?? 0)} onSelect={pickPosition}/>
    {/if}
    <div class="rounded-lg border p-5">
      <h2 class="font-medium">{position === null ? $t('Assign keycode · select a key above') : $t('Assign keycode · key {number}', { number: position + 1 })}</h2>
      {#if position !== null}<p class="mt-1 text-sm text-muted-foreground">{keyLabel(position)}</p>{/if}
      <StudioKeycodePicker selection={`${layer.id}:${position}`} {behaviors} layers={keymap?.layers ?? []} disabled={occupied || foreignChanges || position === null}
        extras={[...macroActions,...comboActions]} onSelect={chooseBinding}/>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
      {#if inlineLayout}{@render layoutOptions()}{/if}
      {#if !layoutPreview || layoutPreview.keys.length < layer.bindings.length}
      <label class="grid gap-2 text-sm">
        {$t("Key position")}
        <select aria-label={$t("Key position")} class="rounded-md border bg-background p-2" disabled={occupied} value={position ?? -1}
          onchange={event => pickPosition(Number(event.currentTarget.value))}>
          <option value={-1} disabled>—</option>
          {#each layer.bindings as _, index}
            <option value={index}>{index + 1} · {keyLabel(index)}</option>
          {/each}
        </select>
      </label>
      {/if}
      {#if position !== null}
      <details class="text-sm sm:col-span-2" open={behavior?.id !== keyPress?.id}>
        <summary class="cursor-pointer">{$t('Behavior')} · {behavior?.id === keyPress?.id && draft.param1 ? zmkKeyLegend(draft.param1) : behavior?.displayName}</summary>
      <label class="grid gap-2 text-sm">
        {$t("Behavior")}
        <select aria-label={$t("Behavior")} class="rounded-md border bg-background p-2" disabled={occupied || foreignChanges} value={draft.behaviorId}
          onchange={event => { draft = { behaviorId: Number(event.currentTarget.value), param1: 0, param2: 0 }; if (draft.behaviorId !== keyPress?.id) assign() }}>
          {#if !behavior}<option value={draft.behaviorId}>{$t('Unknown behavior {number}', { number: draft.behaviorId })}</option>{/if}
          {#each behaviors as item}<option value={item.id}>{item.displayName}</option>{/each}
        </select>
      </label>
      {#key `${layer.id}:${position}:${draft.behaviorId}`}
      {#each ['param1', 'param2'] as field, index}
        <label class="grid gap-2 text-sm">{$t('Parameter {number}', { number: index + 1 })}
          <input class="rounded-md border p-2" type="number" min="0" max="4294967295" required value={index === 0 ? draft.param1 : draft.param2}
            disabled={busy || foreignChanges || !behavior} oninput={event => changeParameter(field, event.currentTarget)}/>
        </label>
      {/each}
      {/key}
      </details>
      {/if}
      </div>
    </div>
    {#if inlineLayout && layoutPreview}<p class="text-sm text-muted-foreground">{layoutPreview.projectedLayout ?? layouts?.layouts[layouts.activeLayoutIndex]?.name} · {$t('{count} physical positions', { count: layoutPreview.keys.length })}</p>{/if}
  {/if}
</section>
