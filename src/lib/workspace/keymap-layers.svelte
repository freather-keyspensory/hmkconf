<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import { t } from '$lib/i18n'
  let { count, current, disabled = false, names = [], onSelect }: {
    count: number; current: number; disabled?: boolean; names?: string[]; onSelect: (index: number) => void
  } = $props()
</script>
<div class="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label={$t('Layer')}>
  <span class="mr-1">{$t('Layer')}</span>
  {#each Array.from({ length: count }).keys() as index}
    <Button size="sm" class="min-w-8" variant={current === index ? 'default' : 'outline'} {disabled}
      title={names[index] || undefined} aria-label={$t('Layer {number}', { number: index + 1 })}
      aria-pressed={current === index} onclick={() => onSelect(index)}>{index + 1}</Button>
  {/each}
</div>
