<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { t } from '$lib/i18n'
  import { drawCat, sceneHeight, sceneWidth, type Paw } from './typing-cat'

  let { matrix }: { matrix: boolean } = $props()
  const windowMs = 5000
  const angryThresholdWpm = 80
  let canvas: HTMLCanvasElement
  let timestamps: number[] = []
  let timer: ReturnType<typeof setInterval> | undefined
  let nextPaw: Paw = 'left'
  let paw = $state<Paw>('rest')
  let reducedMotion = $state(false)
  let wpm = $state(0)
  const angry = $derived(wpm > angryThresholdWpm)

  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    function updateMotion() { reducedMotion = media.matches }
    updateMotion()
    media.addEventListener('change', updateMotion)
    return () => media.removeEventListener('change', updateMotion)
  })
  onDestroy(() => clearInterval(timer))

  $effect(() => {
    const ctx = canvas?.getContext('2d')
    if (ctx) drawCat(ctx, reducedMotion ? 'rest' : paw, angry)
  })

  function updateRate(now: number) {
    timestamps = timestamps.filter(at => at > now - windowMs)
    wpm = Math.round(timestamps.length / 5 * 60_000 / windowMs)
    if (!timestamps.length || now - timestamps[timestamps.length - 1] >= 120) paw = 'rest'
    if (!timestamps.length) {
      clearInterval(timer)
      timer = undefined
    }
  }

  export function strike(count = 1) {
    const now = performance.now()
    for (let i = 0; i < count; i++) timestamps.push(now)
    paw = nextPaw
    nextPaw = paw === 'left' ? 'right' : 'left'
    updateRate(now)
    timer ??= setInterval(() => updateRate(performance.now()), 60)
  }

  export function reset() {
    timestamps = []
    updateRate(performance.now())
    nextPaw = 'left'
  }
</script>

<div class="flex flex-wrap items-center justify-center gap-5 rounded-xl border bg-card p-4" role="group" aria-label={$t('Typing cat')}>
  <canvas bind:this={canvas} width={sceneWidth} height={sceneHeight} aria-hidden="true"
    class="w-40 max-w-full rounded-lg bg-[#eaf0e8]"></canvas>
  <span class="flex items-baseline gap-1.5 tabular-nums" title={$t(matrix
    ? 'Five switch presses count as one word over the last five seconds.'
    : 'Five typed characters count as one word over the last five seconds.')}>
    <strong class="text-3xl tracking-tight">{wpm}</strong><span class="text-sm text-muted-foreground">{$t('WPM')}</span>
  </span>
</div>
