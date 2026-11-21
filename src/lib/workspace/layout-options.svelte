<script lang="ts">
  import { t } from '$lib/i18n'
  import { Switch } from '$lib/components/ui/switch'

  let { labels, values, disabled = false, localize, available = () => true, onChange }: {
    labels: (string | string[])[]; values: (number | undefined)[]; disabled?: boolean
    available?: (group: number, value: number) => boolean
    localize?: (name: string) => string
    onChange: (group: number, value: number) => void
  } = $props()
  const translate = $derived(localize ?? $t)
  const uid = $props.id()
</script>

<div class="grid divide-y rounded-lg border px-4">
  {#each labels as label, group}
    {@const id = uid + '-' + group}
    {@const selected = values[group]}
    <div class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      {#if typeof label === 'string'}
        <label for={id}>{translate(label)}</label>
        <Switch {id} {disabled} bind:checked={() => selected === 1, checked => onChange(group, Number(checked))}/>
      {:else if label.length === 2}
        <span>{translate(label[0])}</span><strong>{translate(label[1])}</strong>
      {:else if label.length === 3}
        <label for={id}>{translate(label[0])}</label>
        <div class="flex items-center gap-3">
          <span class="text-muted-foreground" id={id + '-value'}>{selected === 0 || selected === 1 ? translate(label[selected + 1]) : '—'}</span>
          <Switch {id} aria-describedby={id + '-value'} disabled={disabled || !available(group, selected === 1 ? 0 : 1)}
            bind:checked={() => selected === 1, checked => onChange(group, Number(checked))}/>
        </div>
      {:else}
        <label for={id}>{translate(label[0])}</label>
        <select {id} {disabled} class="max-w-full rounded-md border bg-background p-2" value={selected ?? -1}
          onchange={event => {
            const next = Number(event.currentTarget.value)
            event.currentTarget.value = String(selected ?? -1)
            onChange(group, next)
          }}>
          {#if selected === undefined || selected >= label.length - 1}<option value={selected ?? -1} disabled>—</option>{/if}
          {#each label.slice(1) as option, index}<option value={index} disabled={!available(group, index)}>{translate(option)}</option>{/each}
        </select>
      {/if}
    </div>
  {/each}
</div>
