<script lang="ts">
  import { t } from '$lib/i18n'
  import * as Dialog from '$lib/components/ui/dialog'
  import type { BehaviorBinding } from '@zmkfirmware/zmk-studio-ts-client/keymap'
  import { allowsUsage, hidKeys, type PickerAction } from './key-picker'

  let { action, disabled, onCancel, onSelect }: {
    action: PickerAction; disabled: boolean; onCancel: () => void; onSelect: (binding: BehaviorBinding) => void
  } = $props()
  let values = $state<(number | undefined)[]>([])
  let masks = $state([0, 0])
  const modifiers = ['Left Ctrl', 'Left Shift', 'Left Alt', 'Left Win', 'Right Ctrl', 'Right Shift', 'Right Alt', 'Right Win']
  function fieldLabel(name: string, index: number) {
    if (action.title.includes('&mt')) return index === 0 ? $t('Hold') : $t('Tap')
    if (action.title.includes('&lt') && index === 1) return $t('Tap')
    return name || $t('Parameter {number}', { number: index + 1 })
  }
  function choose(index: number, value: number | undefined) {
    if (disabled) return
    values[index] = value
    const args = action.args.map((arg, i) => {
      if (typeof arg === 'number') return arg >>> 0
      if (values[i] === undefined) return undefined
      return (values[i]! | (masks[i] << 24)) >>> 0
    })
    if (args[0] !== undefined && args[1] !== undefined) {
      onSelect({ behaviorId: action.behaviorId, param1: args[0], param2: args[1] })
      onCancel()
    }
  }
</script>

<Dialog.Root open={true} onOpenChange={open => { if (!open) onCancel() }}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{action.row ? $t(action.row) + ' · ' : ''}{$t(action.label)}</Dialog.Title>
      <Dialog.Description>{$t('Choose the parameters to assign this binding.')}</Dialog.Description>
    </Dialog.Header>
    {#each action.args as arg, index}
      {#if typeof arg !== 'number'}
        {@const label = fieldLabel(arg.name, index)}
        {#if arg.hidUsage}
          <fieldset class="flex flex-wrap gap-1" {disabled}>
            <legend class="mb-1 text-xs text-muted-foreground">{label} · {$t('Modifiers')}</legend>
            {#each modifiers as modifier, bit}
              <button type="button" class="rounded border px-2 py-1 text-xs aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                aria-pressed={Boolean(masks[index] & (1 << bit))} onclick={() => masks[index] ^= 1 << bit}>{$t(modifier)}</button>
            {/each}
          </fieldset>
          <label class="grid gap-1 text-sm">{label}
            <select {disabled} class="min-w-0 rounded border bg-background p-2" value={values[index] ?? ''}
              onchange={event => choose(index, Number(event.currentTarget.value))}>
              <option disabled value="">{$t('Select')}</option>
              {#each hidKeys.filter(key => allowsUsage(key.value, arg.hidUsage)) as key}
                <option value={key.value}>{key.label.replace(/\s+/g, ' ')} · {key.code || key.description}</option>
              {/each}
            </select>
          </label>
        {:else if arg.range}
          <label class="grid gap-1 text-sm">{label} ({arg.range.min} – {arg.range.max})
            <input class="rounded border p-2" type="number" required step="1" {disabled} min={arg.range.min} max={arg.range.max}
              onchange={event => choose(index, event.currentTarget.validity.valid ? event.currentTarget.valueAsNumber : undefined)}/>
          </label>
        {/if}
      {/if}
    {/each}
  </Dialog.Content>
</Dialog.Root>
