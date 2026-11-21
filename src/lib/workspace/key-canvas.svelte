<script lang="ts">
  import { isoEnterPath, type CanvasKey } from './key-geometry'
  import { t } from '$lib/i18n'
  let { keys, width, height, scale, selected, highlighted, disabled, label, description = label, selectable = () => true, onClear, onSelect }: {
    keys: CanvasKey[]; width: number; height: number; scale: number; selected: number | null; disabled: boolean
    highlighted?: number[]
    onClear?: (position: number) => void
    label: (position: number) => string; description?: (position: number) => string; selectable?: (position: number) => boolean; onSelect: (position: number) => void
  } = $props()
  let available = $state(0)
  const fit = $derived(available && width > 0 ? Math.min(scale, Math.max(scale * 0.6, available / width)) : scale)
</script>
<div class="my-5 overflow-x-auto rounded-lg border bg-muted/25 p-4" role="group" aria-label={$t('Physical keyboard')}>
  <div bind:clientWidth={available}>
    <div class="relative mx-auto" style:width={width * fit + 'px'} style:height={height * fit + 'px'}>
      {#each keys as key}
        {@const legend = label(key.index)}
        {@const fullLabel = description(key.index)}
        {@const longestWord = Math.max(1, ...legend.split(/\s+/).map(word => word.length))}
        {@const keyWidth = Math.max(1, key.w * fit - 3)}
        {@const keyHeight = Math.max(1, key.h * fit - 3)}
        {@const stemLeft = (key.upperLeftExtension ?? 0) * fit}
        {@const outline = stemLeft ? isoEnterPath(keyWidth, keyHeight, stemLeft, key.h * fit / 2 - 3) : undefined}
        <button type="button" disabled={disabled || !selectable(key.index)} title={fullLabel}
          aria-label={$t('Key position {number}: {label}', { number: key.index + 1, label: fullLabel })}
          oncontextmenu={onClear ? event => { event.preventDefault(); if (!disabled) onClear(key.index) } : undefined}
          aria-pressed={highlighted ? highlighted.includes(key.index) : key.index === selected} onclick={() => onSelect(key.index)}
          class="absolute grid grid-cols-[minmax(0,1fr)] place-items-center rounded-md border border-b-2 bg-background px-1 font-medium [container-type:size] aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          class:stepped={!!outline}
          style:clip-path={outline && `path('${outline}')`}
          style:padding-left={outline ? stemLeft + 'px' : undefined}
          style:left={key.x * fit + 'px'} style:top={key.y * fit + 'px'}
          style:width={keyWidth + 'px'} style:height={keyHeight + 'px'}
          style:transform-origin={(key.originX ?? 0) * fit + 'px ' + (key.originY ?? 0) * fit + 'px'}
          style:transform={'rotate(' + (key.angle ?? 0) + 'deg)'}>
          {#if outline}
            <svg aria-hidden="true" class="pointer-events-none absolute inset-0 size-full" fill="none">
              <path d={outline} stroke-width="2"/>
            </svg>
          {/if}
          <span class="max-w-full text-center leading-tight whitespace-pre-line wrap-anywhere"
            style:font-size={'clamp(9px, ' + (155 / longestWord) + 'cqw, 12px)'}>{legend}</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .stepped { border: 0; border-radius: 0; }
  .stepped path { stroke: var(--border); }
  .stepped[aria-pressed="true"] path { stroke: var(--primary); }
  .stepped:focus-visible path { stroke: currentColor; stroke-width: 4px; }
</style>
