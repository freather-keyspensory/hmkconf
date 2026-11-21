<script lang="ts">
  import type { GetBehaviorDetailsResponse as Behavior } from "@zmkfirmware/zmk-studio-ts-client/behaviors"
  import type { BehaviorBinding, Layer } from "@zmkfirmware/zmk-studio-ts-client/keymap"
  import { Button } from "$lib/components/ui/button"
  import { t } from "$lib/i18n"
  import KeyCanvas from "$lib/workspace/key-canvas.svelte"
  import type { CanvasKey } from "$lib/workspace/key-geometry"
  import { untrack } from "svelte"
  import type { Combo } from "./action-protocol"
  import type { PickerAction } from "./key-picker"
  import Picker from "./keycode-picker.svelte"

  let {
    combo,
    combos,
    canvas,
    keyLabel,
    outputLabel,
    behaviors,
    layers,
    extras,
    disabled,
    save,
    assign,
  }: {
    combo: Combo
    combos: Combo[]
    canvas?: { keys: CanvasKey[]; width: number; height: number }
    keyLabel: (index: number) => string
    outputLabel: (binding: BehaviorBinding) => string
    behaviors: Behavior[]
    layers: Layer[]
    extras: PickerAction[]
    disabled: boolean
    save: (original: Combo, next: Combo) => void
    assign: (binding: BehaviorBinding) => void
  } = $props()
  let positions = $state<number[]>(untrack(() => [...combo.keyPositions]))
  let output = $state.raw<BehaviorBinding | undefined>(
    untrack(() => (combo.keyPositions.length ? combo.behavior : undefined)),
  )
  let timeout = $state<number | undefined>(untrack(() => combo.timeoutMs))
  const signature = (keys: number[]) => [...keys].sort((a, b) => a - b).join(",")
  const duplicate = $derived(
    positions.length >= 2 &&
      combos.some(
        (item) =>
          item.index !== combo.index &&
          (!combo.layerMask || !item.layerMask || !!(combo.layerMask & item.layerMask)) &&
          signature(positions) === signature(item.keyPositions),
      ),
  )
  function changed() {
    if (
      disabled ||
      !output ||
      duplicate ||
      positions.length < 2 ||
      timeout === undefined ||
      !Number.isInteger(timeout) ||
      timeout < 1 ||
      timeout > 2147483647
    )
      return
    save(combo, { ...combo, behavior: output, keyPositions: [...positions], timeoutMs: timeout })
  }
  function toggle(index: number) {
    positions = positions.includes(index) ? positions.filter((p) => p !== index) : [...positions, index]
    changed()
  }
</script>

<div class="grid gap-3">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h3 class="font-medium">{$t("Trigger keys")}</h3>
    {#if combo.keyPositions.length && combo.editableKeyPositions}
      <Button
        variant="outline"
        size="sm"
        {disabled}
        onclick={() => save(combo, { ...combo, keyPositions: [] })}>{$t("Clear combo")}</Button
      >
    {/if}
  </div>
  <p class="text-sm text-muted-foreground">
    {$t("Choose at least two keys and an output. Press the keys together to trigger it.")}
  </p>
  {#if canvas}
    <KeyCanvas
      {...canvas}
      scale={0.54}
      selected={null}
      highlighted={positions}
      disabled={disabled || !combo.editableKeyPositions}
      label={keyLabel}
      selectable={(index) => positions.includes(index) || positions.length < 20}
      onSelect={toggle}
    />
  {:else}
    <div class="flex flex-wrap gap-1">
      {#each layers[0]?.bindings ?? [] as _, index}
        <button
          class="rounded-md border px-2 py-1 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          disabled={disabled ||
            !combo.editableKeyPositions ||
            (!positions.includes(index) && positions.length >= 20)}
          aria-pressed={positions.includes(index)}
          onclick={() => toggle(index)}>{index + 1} · {keyLabel(index)}</button
        >
      {/each}
    </div>
  {/if}
  <p class="text-sm" aria-live="polite">
    {positions.map((p) => keyLabel(p) + " (" + (p + 1) + ")").join(" + ") || "—"}
  </p>
  {#if duplicate}<p class="text-sm" role="alert">{$t("Another combo uses these trigger keys.")}</p>{/if}
  <label class="flex items-center justify-between gap-2 text-sm"
    >{$t("Detection window (ms)")}
    <input
      class="w-24 rounded-md border bg-background p-2"
      type="number"
      min="1"
      max="2147483647"
      step="1"
      required
      {disabled}
      bind:value={timeout}
      onchange={changed}
    />
  </label>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h3 class="font-medium">{$t("Output action")} · {output ? outputLabel(output) : "—"}</h3>
    {#if combo.keyPositions.length && combo.behavior}<Button
        variant="outline"
        size="sm"
        {disabled}
        onclick={() => combo.behavior && assign(combo.behavior)}>{$t("Assign output in Keymap")}</Button
      >{/if}
  </div>
  <Picker
    selection={"combo-" + combo.index}
    {behaviors}
    {layers}
    {extras}
    disabled={disabled || !combo.editableBehavior}
    onSelect={(binding) => {
      output = binding
      changed()
    }}
  />
</div>
