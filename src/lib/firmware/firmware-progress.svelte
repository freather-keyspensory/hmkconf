<script lang="ts">
  import { Tween, prefersReducedMotion } from 'svelte/motion'
  import { t } from '$lib/i18n'

  let { stage, value }: { stage: string; value: number } = $props()
  const finished = $derived(stage === 'Ready' || stage === 'Failed')
  const tween = Tween.of(() => value, { duration: 450 })
  const displayed = $derived(Math.round(finished || prefersReducedMotion.current ? value : tween.current))
</script>

<div class="grid gap-2">
  <div class="flex items-baseline justify-between gap-3">
    <strong role="status">{$t(stage)}</strong>
    <span class="text-sm font-medium tabular-nums" aria-hidden="true">{displayed}%</span>
  </div>
  <div role="progressbar" aria-label={$t('Build firmware')} aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={displayed} class="h-2 overflow-hidden rounded-full bg-muted">
    <div class="fill h-full rounded-full" class:active={!finished} class:failed={stage === 'Failed'}
      style:width={displayed + '%'}></div>
  </div>
</div>

<style>
  .fill {background-color:var(--primary);}
  .fill.failed {background-color:var(--destructive);}
  @media (prefers-reduced-motion: no-preference) {
    .active {
      background-image:repeating-linear-gradient(110deg, transparent 0 8px, color-mix(in srgb, var(--primary-foreground) 23%, transparent) 8px 16px);
      background-size:34px 100%;
      animation:flow 1.2s linear infinite;
    }
    @keyframes flow {to {background-position:34px 0;}}
  }
</style>
