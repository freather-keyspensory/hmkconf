<script lang="ts">
  import { t } from '$lib/i18n'
  import { onMount } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import { Button } from '$lib/components/ui/button'
  import { Switch } from '$lib/components/ui/switch'
  import { fullKeyboard, type MatrixSource } from './test-layout'
  import TypingCat from './typing-cat.svelte'

  let { source }: { source?: MatrixSource } = $props()
  let matrix = $state(false)
  let error = $state('')
  let board: HTMLDivElement
  let cat: TypingCat | undefined = $state()
  let visible = $state(true)
  const held = new SvelteSet<string>()
  const tested = new SvelteSet<string>()
  const layout = $derived(matrix && source ? source.layout : fullKeyboard)
  const known = new Set(fullKeyboard.keys.map(key => key.code))

  function reset() { held.clear(); tested.clear(); cat?.reset(); board?.focus({preventScroll:true}) }
  function toggle(value: boolean) { reset(); error = ''; matrix = value; board.focus({preventScroll:true}) }
  function press(event: KeyboardEvent) {
    if (matrix || !known.has(event.code) || (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable=true]'))) return
    if (event.target === board && event.code !== 'Tab') event.preventDefault()
    held.add(event.code)
    tested.add(event.code)
    const shortcut = event.metaKey || (event.ctrlKey || event.altKey) && !event.getModifierState('AltGraph')
    const testing = event.target === board || event.target === document.body
    if (testing && !event.repeat && !event.isComposing && !shortcut && [...event.key].length === 1) {
      cat?.strike()
    }
  }
  onMount(() => { board.focus({preventScroll:true}); visible = !document.hidden })
  $effect(() => {
    if (!matrix || !source || !visible) return
    const current = source
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    let previous: Set<number> | undefined
    async function poll() {
      try {
        const down = new Set(await current.read(controller.signal))
        if (controller.signal.aborted) return
        let presses = 0
        held.clear()
        for (const index of down) {
          held.add(String(index))
          tested.add(String(index))
          if (previous && !previous.has(index)) presses++
        }
        previous = down
        if (presses) cat?.strike(presses)
        timer = setTimeout(poll, 25)
      } catch (cause) {
        if (!controller.signal.aborted) { reset(); matrix = false; error = 'Matrix read failed · ' + String(cause) }
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  })
</script>

<svelte:window onkeydown={press} onkeyup={event => { if (!matrix) held.delete(event.code) }} onblur={() => held.clear()}/>
<svelte:document onvisibilitychange={() => { visible = !document.hidden; if (!visible) held.clear() }}/>
<section class="mx-auto grid w-full max-w-6xl gap-5 p-5 sm:p-8">
  <div><h1 class="text-2xl font-semibold">{$t("Key tester")}</h1>
    <p class="mt-1 text-sm text-muted-foreground">{$t(matrix ? 'Switch positions reported by this board, independent of layers and key assignments.' : 'Press keys to see what reaches the computer. Some system shortcuts are intercepted before they reach the browser.')}</p>
  </div>
  <div class="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
    <Switch id="test-matrix" aria-describedby="test-matrix-note" checked={matrix} disabled={!source} onCheckedChange={toggle}/>
    <div class="grid min-w-0 flex-1 gap-0.5">
      <label for="test-matrix" class="w-fit text-sm font-medium">{$t("Test matrix")}</label>
      <p id="test-matrix-note" class="text-xs text-muted-foreground">{$t("Matrix mode is available only on supported VIA keyboards.")}</p>
    </div>
    <Button class="ml-auto" variant="outline" size="sm" onclick={reset}>{$t("Reset test")}</Button>
  </div>
  {#if error}<p class="text-sm" role="alert">{error}</p>{/if}
  <div class="overflow-auto rounded-xl border bg-muted/25 p-4 focus-visible:ring-2" bind:this={board} role="group" tabindex="-1" aria-label={$t(matrix ? 'Switch matrix' : 'Full-size keyboard')}>
    <div class="relative mx-auto" style:width={layout.width / fullKeyboard.width * 100 + '%'} style:min-width={layout.width * 31 + 'px'} style:aspect-ratio={layout.width + '/' + layout.height}>
      {#each layout.keys as key}
        <div class="cap" class:tested={tested.has(key.code)} class:held={held.has(key.code)} data-code={key.code}
          title={key.label + ' · ' + $t(held.has(key.code) ? 'Held' : tested.has(key.code) ? 'Tested' : 'Untested')}
          style:rotate={key.angle ? key.angle + 'deg' : undefined}
          style:transform-origin={key.angle ? (key.originX ?? 0) / key.w * 100 + '% ' + (key.originY ?? 0) / key.h * 100 + '%' : undefined}
          style:left={key.x/layout.width*100+'%'} style:top={key.y/layout.height*100+'%'}
          style:width={'calc('+key.w/layout.width*100+'% - 3px)'} style:height={'calc('+key.h/layout.height*100+'% - 3px)'}>{key.label}</div>
      {/each}
    </div>
  </div>
  <div class="flex flex-wrap items-center gap-4 text-sm"><span class="counter"><i class="held-dot"></i>{$t('{count} held', { count: held.size })}</span><span class="counter"><i></i>{$t('{count} tested', { count: tested.size })}</span>
    <span class="ml-auto text-xs text-muted-foreground">{$t(matrix ? 'Raw switch positions' : '108-key layout · browser input')}</span></div>
  {#if matrix && source?.pulse}<Button class="justify-self-start" variant="outline" onclick={source.pulse}>{$t("Pulse sample switch 0,0")}</Button>{/if}
  <TypingCat bind:this={cat} {matrix}/>
</section>
<style>
  .cap {position:absolute;display:grid;place-items:center;border:1px solid var(--border);border-bottom-width:3px;border-radius:.35rem;background:var(--background);font:500 clamp(.6rem,.85vw,.8rem)/1 system-ui}
  .cap.tested {background:#daebdd;border-color:#6e987e;color:#183928}.cap.held {background:#23543e;border-color:#153525;color:white;transform:translateY(1px)}
  .counter {display:inline-flex;align-items:center;gap:.45rem}.counter i {width:.8rem;height:.8rem;border-radius:.2rem;background:#daebdd;border:1px solid #6e987e}.counter i.held-dot {background:#23543e}
</style>
