<script lang="ts">
  import type { GetBehaviorDetailsResponse as Behavior } from '@zmkfirmware/zmk-studio-ts-client/behaviors'
  import type { BehaviorBinding, Layer } from '@zmkfirmware/zmk-studio-ts-client/keymap'
  import * as Accordion from '$lib/components/ui/accordion'
  import { Button } from '$lib/components/ui/button'
  import { t } from '$lib/i18n'
  import BasicKeyboardPicker from '$lib/via/basic-keyboard-picker.svelte'
  import BindingArguments from './binding-arguments.svelte'
  import { allowsUsage, groupActions, keyPressLimits, pickerActions, type PickerAction } from './key-picker'

  let { behaviors, layers, extras = [], selection, disabled, onSelect }: {
    extras?: PickerAction[]; behaviors: Behavior[]; layers: Layer[]; selection: string; disabled: boolean; onSelect: (binding: BehaviorBinding) => void
  } = $props()
  let search = $state('')
  let expanded = $state(['Basic'])
  let pending = $state.raw<PickerAction>()
  $effect(() => { selection; pending = undefined })
  const keyPress = $derived(behaviors.find(item => item.displayName === 'Key Press'))
  const limits = $derived(keyPressLimits(keyPress))
  const actions = $derived([...extras, ...pickerActions(behaviors, layers)])
  const groups = $derived(groupActions(actions, search, $t))
  const searching = $derived(Boolean(search.trim()))

  function select(action: PickerAction) {
    if (disabled || action.firmwareOnly) return
    const [first, second] = action.args
    if (typeof first === 'number' && typeof second === 'number') {
      onSelect({ behaviorId: action.behaviorId, param1: first >>> 0, param2: second >>> 0 })
    } else pending = action
  }
</script>

<input class="my-3 w-full rounded border bg-background p-2" aria-label={$t('Search keycodes')}
  placeholder={$t('Search keycodes')} bind:value={search}/>
<Accordion.Root type="multiple" bind:value={
  () => searching ? groups.map(group => group.name) : expanded,
  (value) => { if (!searching) expanded = value }
}>
  {#each groups as group (group.name)}
    <Accordion.Item value={group.name}>
      <Accordion.Trigger>{$t(group.name)}</Accordion.Trigger>
      <Accordion.Content>
        {#if group.name === 'Basic' && keyPress && !searching}
          <BasicKeyboardPicker {disabled} resolve={value => allowsUsage(value, limits) ? value : undefined}
            onSelect={value => { if (keyPress) onSelect({ behaviorId: keyPress.id, param1: value, param2: 0 }) }}/>
        {/if}
        {#each group.rows as [row, items]}
          {@const visible = group.name === 'Basic' && !searching ? items.filter(item => item.behaviorId !== keyPress?.id) : items}
          {#if visible.length}
            <div class="picker-row" class:named={Boolean(row)} role="group" aria-label={$t(row || group.name)}>
              {#if row}<span class="pt-1 text-sm text-muted-foreground">{$t(row)}</span>{/if}
              <div class="picker-actions">
                {#each visible as item}
                  <Button type="button" size="sm" variant="outline" class="h-auto min-h-8 min-w-0 whitespace-normal wrap-anywhere px-2 py-1"
                    disabled={disabled || item.firmwareOnly} title={item.title} onclick={() => select(item)}>{$t(item.label)}</Button>
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      </Accordion.Content>
    </Accordion.Item>
  {/each}
</Accordion.Root>
{#if !groups.length && searching}<p class="py-2 text-sm text-muted-foreground" role="status">{$t('No matching keycodes.')}</p>{/if}
{#if pending && !disabled}
  <BindingArguments action={pending} {disabled} onCancel={() => pending = undefined} {onSelect}/>
{/if}

<style>
  .picker-row { padding-block: .45rem }
  .picker-row + .picker-row { border-top: 1px solid var(--border) }
  .picker-actions { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 6rem), 1fr)); gap: .4rem }
  @media (min-width: 48rem) {
    .picker-row.named { display: grid; grid-template-columns: minmax(7rem, 22%) minmax(0, 1fr); gap: .8rem }
  }
</style>
