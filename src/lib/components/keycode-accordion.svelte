<!--
This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
details.

You should have received a copy of the GNU General Public License along with
this program. If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
  import BasicKeyboardPicker from "$lib/via/basic-keyboard-picker.svelte"
  import { hmkKeyValue } from "$lib/workspace/hmk-key-values"
  import { Keycode } from "$lib/libhmk/keycodes"
  import { XIcon } from "@lucide/svelte"
  import { t } from "$lib/i18n"
  import { keyboardContext } from "$lib/keyboard"
  import {
    getCategorizedKeycodes,
    getKeycodeMetadata,
    keycodeCategories,
  } from "$lib/keycodes"
  import { unitToStyle } from "$lib/ui"
  import { cn, type WithoutChildrenOrChild } from "$lib/utils"
  import type { HTMLAttributes } from "svelte/elements"
  import { KeycodeButton } from "./keycode-button"
  import * as Accordion from "./ui/accordion"
  import * as InputGroup from "./ui/input-group"

  const {
    class: className,
    onKeycodeSelected,
    extraGroups = [],
    onBindingSelected,
    bindingDisabled = false,
    workspacePicker = false,
    ...props
  }: WithoutChildrenOrChild<HTMLAttributes<HTMLDivElement>> & {
    onKeycodeSelected?: (keycode: number) => void
    extraGroups?: {name:string; items:{id:string;label:string}[]}[]
    onBindingSelected?: (id:string,label:string) => void
    workspacePicker?: boolean
    bindingDisabled?: boolean
  } = $props()

  let search = $state("")
  let accordionValue = $state(["Basic"])

  const getAccordionValue = () =>
    search === "" ? accordionValue : [...Object.values(keycodeCategories), ...extraGroups.map(g=>g.name)]
  const setAccordionValue = (v: string[]) =>
    search === "" && (accordionValue = v)

  const categorizedKeycodes = getCategorizedKeycodes(
    keyboardContext.get().metadata,
  )
  const filteredKeycodes = $derived.by(() => {
    if (search === "") return categorizedKeycodes
    const lowerSearch = search.toLowerCase()
    return categorizedKeycodes.map(
      ([category, keycodes]) =>
        [
          category,
          keycodes.filter((keycode) => {
            const { name, tooltip = "" } = getKeycodeMetadata(keycode)
            return (
              name.toLowerCase().includes(lowerSearch) ||
              tooltip.toLowerCase().includes(lowerSearch) ||
              $t(tooltip).toLowerCase().includes(lowerSearch)
            )
          }),
        ] as const,
    )
  })
</script>

<div class={cn("flex w-full flex-col gap-2", className)} {...props}>
  <div class="flex justify-end">
    <InputGroup.Root class="w-60">
      <InputGroup.Input bind:value={search} aria-label={$t("Search keycodes")} placeholder={$t(workspacePicker ? "Search keycodes" : "Search...")} />
      <InputGroup.Addon align="inline-end">
        <InputGroup.Button onclick={() => (search = "")} size="icon-xs">
          <XIcon />
          <span class="sr-only">{$t("Clear Search")}</span>
        </InputGroup.Button>
      </InputGroup.Addon>
    </InputGroup.Root>
  </div>
  <Accordion.Root
    bind:value={getAccordionValue, setAccordionValue}
    type="multiple"
  >
    {#each filteredKeycodes as [category, keycodes] (category)}
      {#if keycodes.length > 0 || (workspacePicker && category === "Basic")}
        <Accordion.Item value={category}>
          <Accordion.Trigger>{$t(category)}</Accordion.Trigger>
          <Accordion.Content class="text-sm">
            {#if workspacePicker && category === 'Basic'}
              <BasicKeyboardPicker {search} disabled={bindingDisabled} resolve={hmkKeyValue} onSelect={code => onKeycodeSelected?.(code)}/>
            {/if}
            <div class="flex flex-wrap">
            {#each (workspacePicker && category === 'Basic' ? keycodes.filter(code => code === Keycode.KC_NONUS_HASH || code === Keycode.KC_NONUS_BACKSLASH) : keycodes) as keycode (keycode)}
              <div class="p-0.5" style={unitToStyle()}>
                <KeycodeButton
                  disabled={workspacePicker && bindingDisabled}
                  {keycode}
                  onclick={() => onKeycodeSelected?.(keycode)}
                  showTooltip
                />
              </div>
            {/each}
            </div>
          </Accordion.Content>
        </Accordion.Item>
      {/if}
    {/each}
    {#each extraGroups as group (group.name)}
      {@const items = group.items.filter(item => !search || (item.label+' '+item.id+' '+group.name).toLowerCase().includes(search.toLowerCase()))}
      {#if items.length}
        <Accordion.Item value={group.name}>
          <Accordion.Trigger>{group.name}</Accordion.Trigger>
          <Accordion.Content><div class="flex flex-wrap gap-2 py-2">{#each items as item (item.id)}<button type="button" disabled={bindingDisabled} title={item.id} class="rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-40" onclick={()=>onBindingSelected?.(item.id,item.label)}>{item.label}</button>{/each}</div></Accordion.Content>
        </Accordion.Item>
      {/if}
    {/each}
  </Accordion.Root>
</div>
