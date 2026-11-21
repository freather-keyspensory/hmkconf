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
  import FixedScrollArea from "$lib/components/fixed-scroll-area.svelte"
  import KeycodeAccordion from "$lib/components/keycode-accordion.svelte"
  import { displayLayoutContext, remapStateContext } from "../context.svelte"
  import { keymapQueryContext } from "../queries/keymap-query.svelte"

  const { bluetooth = false, customBindings = [] }: { bluetooth?: boolean; customBindings?: {id:string;label:string;kind:string}[] } = $props()
  let bluetoothBinding = $state("")
  const bluetoothKeys = [
    ["BT_SEL 0", "Profile 1"], ["BT_SEL 1", "Profile 2"],
    ["BT_SEL 2", "Profile 3"], ["BT_SEL 3", "Profile 4"],
    ["BT_SEL 4", "Profile 5"], ["BT_NXT", "Next profile"],
    ["BT_PRV", "Previous profile"], ["BT_CLR", "Clear pairing"],
    ["BT_CLR_ALL", "Clear all pairings"],
    ["OUT_USB", "USB output"], ["OUT_BLE", "Bluetooth output"],
    ["OUT_TOG", "Toggle output"],
  ]
  const allKeys = $derived(
    displayLayoutContext.get().displayKeys.map(({ key }) => key),
  )

  const remapState = remapStateContext.get()
  const { layer, key } = $derived(remapState)

  const keymapQuery = keymapQueryContext.get()
</script>

<FixedScrollArea class="p-4">
  <KeycodeAccordion
    extraGroups={[
      ...(bluetooth ? [{name:'Bluetooth',items:bluetoothKeys.map(([id,label])=>({id,label}))}] : []),
      ...['Combo','Macro'].map(kind=>({name:kind==='Combo'?'Combos':'Macros',items:customBindings.filter(b=>b.kind===kind).map(b=>({id:b.id,label:b.label}))})),
    ]}
    bindingDisabled={key===null}
    onBindingSelected={(id,label)=>bluetoothBinding=`Layer ${layer} · key ${key}: ${label} (${id})`}

    onKeycodeSelected={(keycode) => {
      if (key === null) return
      keymapQuery.set({ layer, offset: key, data: [keycode] })
      const index = allKeys.indexOf(key)
      remapState.key =
        index !== -1 && index + 1 < allKeys.length ? allKeys[index + 1] : null
    }}
  />
  {#if bluetoothBinding}<p class="mt-3 text-xs text-muted-foreground" role="status">Preview selection · {bluetoothBinding}</p>{/if}
</FixedScrollArea>
