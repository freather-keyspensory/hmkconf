<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte'
  import { ChevronUpIcon, ChevronDownIcon, Trash2Icon, PlusIcon, PlayIcon, CheckIcon, CircleIcon } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import { t } from '$lib/i18n'
  import KeyCanvas from './key-canvas.svelte'
  import { initialSample, keyName, keyOptions, legend, positions, type Sample, type Step } from './bindings-preview'

  const storageKey = 'keyspensory-bindings-preview-v1'
  let sample = $state<Sample>(initialSample())
  let mode = $state<'combos' | 'macros'>('combos')
  let comboId = $state('escape'), macroId = $state('copy')
  let loaded = $state(false), stored = $state(false)
  const combo = $derived(sample.combos.find(item => item.id === comboId))
  const macro = $derived(sample.macros.find(item => item.id === macroId))
  const isCombo = $derived(mode === 'combos')
  const selected = $derived(isCombo ? combo?.keys ?? [] : macro?.trigger == null ? [] : [macro.trigger])
  let result = $state<string[]>([]), playing = $state(false)
  let recording = $state(false), recorder = $state<HTMLInputElement>()
  const recordedDown = new Set<string>()
  async function startRecording() {
    clearTest()
    recording = true
    await tick()
    recorder?.focus()
  }
  function stopRecording() {
    if (!recording) return
    for (const key of recordedDown) macro?.steps.push({ action: 'Release', key })
    recordedDown.clear()
    recording = false
  }
  function capture(event: KeyboardEvent, down: boolean) {
    if (event.code === 'Tab') return
    event.preventDefault()
    if (!recording || !macro || event.repeat || !keyOptions.includes(event.code)) return
    if (down === recordedDown.has(event.code)) return
    if (down) recordedDown.add(event.code)
    else recordedDown.delete(event.code)
    macro.steps.push({ action: down ? 'Press' : 'Release', key: event.code })
  }
  let playback = 0
  const held = new Map<string, number>()
  const label = (index: number) => legend(positions[index].code)
  const chord = (keys: number[]) => keys.map(label).join(' + ')
  const duplicate = $derived(isCombo && combo && sample.combos.some(other => other.id !== combo.id &&
    other.keys.length === combo.keys.length && combo.keys.every(key => other.keys.includes(key))))
  const repeatedTrigger = $derived(!isCombo && macro?.trigger != null && sample.macros.some(other => other.id !== macro.id && other.trigger === macro.trigger))
  const canTest = $derived(isCombo ? !!combo && combo.keys.length >= 2 && combo.windowMs >= 1 && combo.windowMs <= 1000 && !duplicate :
    !!macro?.steps.length && !repeatedTrigger && macro.steps.every(step => step.action !== 'Delay' || (Number.isInteger(step.ms) && step.ms >= 0 && step.ms <= 5000)))

  onMount(() => {
    try {
      const entry = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
      if (Array.isArray(entry?.sample?.combos) && Array.isArray(entry?.sample?.macros)) {
        sample = entry.sample
        mode = entry.mode === 'macros' ? 'macros' : 'combos'
        comboId = entry.comboId
        macroId = entry.macroId
      }
    } catch { /* Use the example if tab storage is unavailable. */ }
    loaded = true
  })
  $effect(() => {
    if (loaded) {
      const json = JSON.stringify({ sample, mode, comboId, macroId })
      try { sessionStorage.setItem(storageKey, json); stored = true } catch { stored = false }
    }
  })
  function clearTest() {
    stopRecording(); playback++; playing = false; result = []; held.clear()
  }
  onDestroy(clearTest)
  function switchMode(next: typeof mode) { clearTest(); mode = next }
  function select(index: number) {
    clearTest()
    if (isCombo && combo) combo.keys = combo.keys.includes(index) ? combo.keys.filter(key => key !== index) : [...combo.keys, index].sort((a,b) => a-b)
    if (!isCombo && macro) macro.trigger = macro.trigger === index ? null : index
  }
  function add() {
    clearTest()
    const id = crypto.randomUUID()
    if (isCombo) { sample.combos.push({ id, keys: [], windowMs: 50, output: 'Escape' }); comboId = id }
    else { sample.macros.push({ id, name: '', trigger: null, steps: [] }); macroId = id }
  }
  function remove() {
    clearTest()
    if (isCombo) { sample.combos = sample.combos.filter(item => item.id !== comboId); comboId = sample.combos[0]?.id ?? '' }
    else { sample.macros = sample.macros.filter(item => item.id !== macroId); macroId = sample.macros[0]?.id ?? '' }
  }
  function changeAction(index: number, action: Step['action']) {
    if (!macro) return
    const previous = macro.steps[index]
    macro.steps[index] = action === 'Delay' ? { action, ms: 100 } : { action, key: previous.action === 'Delay' ? 'KeyA' : previous.key }
    clearTest()
  }
  function moveStep(from: number, to: number) {
    if (!macro || to < 0 || to >= macro.steps.length) return
    const [step] = macro.steps.splice(from, 1)
    macro.steps.splice(to, 0, step)
    clearTest()
  }
  async function test() {
    if (!canTest) return
    clearTest()
    if (isCombo && combo) { result = [keyName(combo.output)]; return }
    if (!macro) return
    const run = playback
    playing = true
    for (const step of $state.snapshot(macro.steps)) {
      if (playback !== run) return
      result.push(step.action === 'Delay' ? step.ms + ' ms' : $t(step.action) + ' ' + keyName(step.key))
      await new Promise(resolve => setTimeout(resolve, step.action === 'Delay' ? step.ms : 100))
    }
    if (playback === run) playing = false
  }
  function testDown(event: KeyboardEvent) {
    if (event.key === 'Tab') return
    event.preventDefault()
    if (event.repeat || !canTest) return
    held.set(event.code, performance.now())
    if (!isCombo && macro?.trigger != null && positions[macro.trigger].code === event.code) { void test(); return }
    if (!isCombo || !combo) return
    const needed = new Set(combo.keys.map(i => positions[i].code))
    if (needed.size !== combo.keys.length || held.size !== needed.size || ![...needed].every(code => held.has(code))) return
    const times = [...held.values()]
    if (Math.max(...times) - Math.min(...times) <= combo.windowMs) void test()
    else result = [$t('Outside the combo window')]
  }
</script>

<section class="mx-auto grid w-full max-w-5xl gap-5 px-4 py-7 sm:px-8">
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div><h1 class="text-2xl font-semibold tracking-tight">{$t('Combos & macros')}</h1>
      <p class="mt-1 text-sm text-muted-foreground">KUSH HHKB Pro 2 · {$t('Base layer preview')}</p></div>
    <span class="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
      {#if stored}<CheckIcon size={14}/>{$t('Saved in this tab')}{:else}{$t('Preview session')}{/if}
    </span>
  </header>
  <div class="flex w-fit gap-1 rounded-lg bg-muted p-1" role="group" aria-label={$t('Combos & macros')}>
    {#each ['combos', 'macros'] as tab}
      <button type="button" class="segment" aria-pressed={mode === tab} onclick={() => switchMode(tab === 'macros' ? 'macros' : 'combos')}>{$t(tab === 'combos' ? 'Combos' : 'Macros')}</button>
    {/each}
  </div>
  <div class="editor">
    <aside class="library">
      <div class="mb-3 flex items-center justify-between gap-2"><h2 class="text-sm font-semibold">{$t(isCombo ? 'Combos' : 'Macros')}</h2>
        <Button size="sm" variant="outline" aria-label={$t(isCombo ? 'Add combo' : 'Add macro')} onclick={add}><PlusIcon size={14}/>{$t('Add')}</Button></div>
      {#each (isCombo ? sample.combos : sample.macros) as item (item.id)}
        <button class="entry" aria-pressed={item.id === (isCombo ? comboId : macroId)}
          onclick={() => { clearTest(); if (isCombo) comboId = item.id; else macroId = item.id }}>
          <b>{'keys' in item ? chord(item.keys) || $t('New combo') : item.name || $t('New macro')}</b>
          <small>{'keys' in item ? '→ ' + keyName(item.output) : item.trigger == null ? $t('Unassigned') : label(item.trigger)}</small>
        </button>
      {:else}<p class="text-sm text-muted-foreground">{$t(isCombo ? 'Add a combo to begin.' : 'Add a macro to begin.')}</p>{/each}
    </aside>
    {#if isCombo ? combo : macro}
      <div class="min-w-0">
        <section class="panel">
          <div class="flex items-start justify-between gap-2">
            <div><h2 class="font-semibold">{$t(isCombo ? 'Trigger keys' : 'Trigger key')}</h2>
            <p class="hint">{$t(isCombo ? 'Select two or more keys to press together.' : 'Select the key that plays this macro.')}</p></div>
            <Button variant="ghost" size="icon" aria-label={$t(isCombo ? 'Delete combo' : 'Delete macro')} onclick={remove}><Trash2Icon size={16}/></Button>
          </div>
          <KeyCanvas keys={positions} width={15} height={5} scale={45} selected={null} highlighted={selected} disabled={false} {label} onSelect={select}/>
          {#if isCombo && combo}
            <div class="flex flex-wrap gap-4">
              <label class="field-label">{$t('Output key')}<select class="field" aria-label={$t('Output key')} bind:value={combo.output} onchange={clearTest}>
                {#each keyOptions as key}<option value={key}>{keyName(key)}</option>{/each}</select></label>
              <label class="field-label">{$t('Combo window (ms)')}<input class="field w-28" type="number" min="1" max="1000" bind:value={combo.windowMs} oninput={clearTest}/></label>
            </div>
            {#if duplicate}<p class="hint" role="alert">{$t('Another combo uses these keys.')}</p>{/if}
          {:else if macro}
            <label class="field-label">{$t('Macro name')}<input class="field" bind:value={macro.name} placeholder={$t('New macro')}/></label>
            {#if repeatedTrigger}<p class="hint" role="alert">{$t('Another macro uses this key.')}</p>{/if}
          {/if}
        </section>
        {#if !isCombo && macro}
          <section class="panel mt-3">
            <div class="mb-3 flex flex-wrap items-center gap-2"><h2 class="mr-auto font-semibold">{$t('Action sequence')}</h2>
              {#if !recording}<Button size="sm" variant="outline" onclick={startRecording}><CircleIcon size={12}/>{$t('Record keys')}</Button>{/if}
              <Button size="sm" variant="outline" onclick={() => { clearTest(); macro?.steps.push({action:'Tap', key:'KeyA'}) }}><PlusIcon size={14}/>{$t('Add step')}</Button></div>
            {#if recording}<div class="my-2 flex flex-wrap items-center gap-2">
              <input class="field min-w-0 flex-1" readonly bind:this={recorder} aria-label={$t('Record keys')} placeholder={$t('Press keys to append actions')}
                onkeydown={event => capture(event,true)} onkeyup={event => capture(event,false)} onblur={stopRecording}/>
              <Button size="sm" variant="outline" onpointerdown={event => event.preventDefault()} onclick={stopRecording}>{$t('Stop recording')}</Button>
            </div>{/if}
            {#each macro.steps as step, i}
              <div class="step">
                <span class="text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <select class="field" aria-label={$t('Action') + ' ' + (i+1)} value={step.action}
                  onchange={event => changeAction(i, event.currentTarget.value as Step['action'])}>
                  {#each ['Tap','Press','Release','Delay'] as action}<option value={action}>{$t(action)}</option>{/each}
                </select>
                {#if step.action === 'Delay'}<input class="field" aria-label={$t('Delay (ms)')} type="number" min="0" max="5000" bind:value={step.ms} oninput={clearTest}/>
                {:else}<select class="field" aria-label={$t('Key') + ' ' + (i+1)} bind:value={step.key} onchange={clearTest}>
                  {#each keyOptions as key}<option value={key}>{keyName(key)}</option>{/each}</select>{/if}
                <div class="flex">
                  <button class="icon" aria-label={$t('Move up')} disabled={i===0} onclick={() => moveStep(i,i-1)}><ChevronUpIcon size={15}/></button>
                  <button class="icon" aria-label={$t('Move down')} disabled={i===macro.steps.length-1} onclick={() => moveStep(i,i+1)}><ChevronDownIcon size={15}/></button>
                  <button class="icon" aria-label={$t('Delete step')} onclick={() => { clearTest(); macro?.steps.splice(i,1) }}><Trash2Icon size={14}/></button>
                </div>
              </div>
            {:else}<p class="hint">{$t('Add the first action to this macro.')}</p>{/each}
          </section>
        {/if}
        <section class="panel mt-3">
          <h2 class="font-semibold">{$t('Test binding')}</h2>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <input class="field min-w-0 flex-1" readonly aria-label={$t('Test input')} placeholder={$t('Focus here and press the trigger keys')}
              onkeydown={testDown} onkeyup={event => held.delete(event.code)} onblur={() => held.clear()}/>
            <Button variant="outline" size="sm" disabled={!canTest || playing} onclick={test}><PlayIcon size={14}/>{$t(isCombo ? 'Simulate combo' : 'Play macro')}</Button>
          </div>
          {#if result.length}<output class="mt-3 flex flex-wrap items-center gap-1.5 text-sm" aria-label={$t('Test output')}>
            {#each result as text, i}{#if i}<span aria-hidden="true">→</span>{/if}<kbd>{text}</kbd>{/each}
          </output>{/if}
        </section>
      </div>
    {/if}
  </div>
</section>

<style>
  .editor {display:grid;grid-template-columns:minmax(8rem,11rem) minmax(0,1fr);gap:1rem;align-items:start}
  .panel,.library {border:1px solid var(--border);border-radius:.75rem;background:var(--card);padding:1rem}
  .entry {display:grid;width:100%;gap:.2rem;text-align:start;padding:.5rem .65rem;border:1px solid transparent;border-radius:.45rem;overflow-wrap:anywhere}
  .entry[aria-pressed=true] {background:var(--muted);border-color:var(--border)}
  .entry small,.hint {color:var(--muted-foreground)} .hint {font-size:.8125rem;margin-top:.3rem}
  .entry b,.field,.segment {font-size:.875rem}.segment {padding:.4rem 1rem;border-radius:.4rem;font-weight:550}
  .segment[aria-pressed=true] {background:var(--background);box-shadow:0 1px 3px #0002}
  .field-label {display:grid;gap:.4rem;font-size:.8rem;font-weight:550}
  .field {min-width:0;border:1px solid var(--border);border-radius:.4rem;background:var(--background);color:var(--foreground);padding:.4rem .55rem;font-weight:400}
  .step {display:grid;grid-template-columns:1rem minmax(4rem,1fr) minmax(4rem,1fr) auto;align-items:center;gap:.5rem;padding:.45rem 0;border-top:1px solid var(--border)}
  .icon {padding:.4rem;border-radius:.25rem}.icon:disabled {opacity:.3}.icon:enabled:hover {background:var(--muted)}
  kbd {background:var(--muted);border:1px solid var(--border);border-radius:.3rem;padding:.2rem .45rem}
  @media(max-width:850px){.editor{grid-template-columns:minmax(0,1fr)}.library .entry{width:auto;display:inline-grid;min-width:7rem}}
  @media(max-width:420px){.step{gap:.2rem}.icon{padding:.25rem}.panel,.library{padding:.7rem}}
</style>
