<script lang="ts">
  import type { GetBehaviorDetailsResponse as Behavior } from "@zmkfirmware/zmk-studio-ts-client/behaviors"
  import type { BehaviorBinding, Layer } from "@zmkfirmware/zmk-studio-ts-client/keymap"
  import { Button } from "$lib/components/ui/button"
  import { t } from "$lib/i18n"
  import type { Macro, MacroEdit, Step } from "./action-protocol"
  import { isPresetMacro } from "./action-protocol"
  import Picker from "./keycode-picker.svelte"
  import MacroSource from "./macro-source.svelte"
  import type { StudioActions } from "./studio-actions.svelte"

  let {
    actions,
    behaviors,
    layers,
    disabled,
    outputLabel,
    create,
    read,
    edit,
    assign,
    openModules,
  }: {
    actions: StudioActions
    behaviors: Behavior[]
    layers: Layer[]
    disabled: boolean
    outputLabel: (b: BehaviorBinding) => string
    create: (name: string) => void
    read: (slot: number) => void
    edit: (macro: Macro, change: MacroEdit, expected: Step[]) => void
    assign: (b: BehaviorBinding) => void
    openModules: () => void
  } = $props()
  const presets = $derived(behaviors.filter((item) => isPresetMacro(item.displayName)))
  const runtime = $derived(behaviors.find((item) => item.displayName === "Runtime Macro"))
  const macro = $derived(actions.macro)
  const pending = $derived(
    actions.macros?.macros.find((item) => item.slot === macro?.slot)?.hasUnsavedChanges,
  )
  let name = $state("")
  let mode = $state<"tap" | "down" | "up" | "delay">("tap")
  let delay = $state<number | undefined>(100)
  let stepIndex = $state<number | null>(null)
  let presetId = $state<number | undefined>()
  const preset = $derived(presets.find((item) => item.id === presetId) ?? presets[0])
  const presetAssignable = $derived(
    !!preset &&
      (!preset.metadata.length ||
        preset.metadata.some((set) =>
          [set.param1, set.param2].every(
            (options) =>
              !options.length ||
              options.some(
                (choice) =>
                  choice.nil ||
                  choice.constant === 0 ||
                  (choice.range && choice.range.min <= 0 && choice.range.max >= 0),
              ),
          ),
        )),
  )
  function choose(slot: number) {
    stepIndex = null
    read(slot)
  }
  function put(step: Step) {
    if (!macro || disabled || pending) return
    const { slot, steps } = macro
    if (stepIndex === null)
      edit(macro, { appendMacroStep: { slot, step, persist: true } }, [...steps, step])
    else
      edit(
        macro,
        { setMacroStep: { slot, stepIndex, step, persist: true } },
        steps.map((s, i) => (i === stepIndex ? step : s)),
      )
    stepIndex = null
  }
  function describe(step: Step) {
    if ("tap" in step) return $t("Tap") + " · " + outputLabel(step.tap)
    if ("down" in step) return $t("Press") + " · " + outputLabel(step.down)
    if ("up" in step) return $t("Release") + " · " + outputLabel(step.up)
    if ("delay" in step) return $t("Delay") + " · " + step.delay.delayMs + " ms"
    return $t("Packed key sequence")
  }
</script>

<div class="grid gap-4">
  {#if actions.macros}
    <form
      class="flex flex-wrap items-end gap-2"
      onsubmit={(event) => {
        event.preventDefault()
        if (name.trim()) {
          stepIndex = null
          create(name.trim())
        }
      }}
    >
      <label class="grid gap-1 text-sm"
        >{$t("Macro name")}
        <input
          class="rounded-md border bg-background p-2"
          {disabled}
          maxlength={actions.macros.maxNameLength || undefined}
          bind:value={name}
        />
      </label>
      <Button
        type="submit"
        variant="outline"
        disabled={disabled || !name.trim() || actions.macros.macros.some((m) => m.name === name.trim())}
        >{$t("New macro")}</Button
      >
    </form>
    {#if actions.macros.macros.length}
      <label class="grid gap-1 text-sm"
        >{$t("Macros")}
        <select
          class="rounded-md border bg-background p-2"
          {disabled}
          value={macro?.slot ?? -1}
          onchange={(e) => choose(Number(e.currentTarget.value))}
        >
          <option value="-1" disabled>—</option>
          {#each actions.macros.macros as entry}<option value={entry.slot}>{entry.name}</option>{/each}
        </select>
      </label>
    {/if}
    {#if macro}
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-medium">{macro.name}</h3>
        {#if runtime}<Button
            variant="outline"
            size="sm"
            {disabled}
            onclick={() =>
              runtime && macro && assign({ behaviorId: runtime.id, param1: macro.slot, param2: 0 })}
            >{$t("Assign in Keymap")}</Button
          >{/if}
      </div>
      {#if pending}<p class="text-sm" role="status">
          {$t("This macro has pending edits on the keyboard. Resolve them before editing.")}
        </p>{/if}
      <ol class="grid gap-1">
        {#each macro.steps as step, i}
          <li>
            <button
              class="w-full rounded-md border p-2 text-start text-sm aria-pressed:border-primary"
              disabled={disabled || pending}
              aria-pressed={stepIndex === i}
              onclick={() => (stepIndex = i)}>{i + 1}. {describe(step)}</button
            >
          </li>
        {/each}
      </ol>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={stepIndex === null ? "secondary" : "outline"}
          disabled={disabled || pending}
          onclick={() => (stepIndex = null)}>{$t("Add step")}</Button
        >
        {#if macro.steps.length}<Button
            size="sm"
            variant="outline"
            disabled={disabled || pending}
            onclick={() => {
              if (macro) {
                stepIndex = null
                edit(
                  macro,
                  {
                    setMacroStepCount: {
                      slot: macro.slot,
                      stepCount: macro.steps.length - 1,
                      persist: true,
                    },
                  },
                  macro.steps.slice(0, -1),
                )
              }
            }}>{$t("Remove last step")}</Button
          >{/if}
        <label class="flex items-center gap-2 text-sm"
          >{stepIndex === null ? $t("New step") : $t("Replace step {number}", { number: stepIndex + 1 })}
          <select
            class="rounded-md border bg-background p-2"
            disabled={disabled || pending}
            bind:value={mode}
          >
            <option value="tap">{$t("Tap")}</option><option value="down">{$t("Press")}</option><option
              value="up">{$t("Release")}</option
            ><option value="delay">{$t("Delay")}</option>
          </select>
        </label>
      </div>
      {#if mode === "delay"}
        <form
          class="flex items-end gap-2"
          onsubmit={(event) => {
            event.preventDefault()
            if (delay !== undefined) put({ delay: { delayMs: delay } })
          }}
        >
          <label class="grid gap-1 text-sm"
            >{$t("Delay")} (ms)<input
              type="number"
              class="w-32 rounded-md border p-2"
              required
              min="0"
              max="65535"
              step="1"
              bind:value={delay}
            /></label
          >
          <Button type="submit" disabled={disabled || pending}>{$t("Set delay")}</Button>
        </form>
      {:else}
        <Picker
          selection={"macro-" + macro.slot + "-" + stepIndex}
          behaviors={behaviors.filter((b) => b !== runtime)}
          {layers}
          disabled={disabled || !!pending}
          onSelect={(b) => put(mode === "down" ? { down: b } : mode === "up" ? { up: b } : { tap: b })}
        />
      {/if}
    {/if}
  {:else}
    <p class="text-sm text-muted-foreground">
      {$t(actions.macroMessage || "Live macro editing requires firmware with Runtime macros.")}
    </p>
    <Button size="sm" class="justify-self-start" variant="outline" {disabled} onclick={openModules}
      >{$t("Studio modules")}</Button
    >
  {/if}
  {#if preset}
    <div class="flex flex-wrap items-end gap-2 rounded-md border p-3">
      <label class="grid gap-1 text-sm"
        >{$t("Firmware macros")}
        <select
          class="rounded-md border bg-background p-2"
          {disabled}
          value={preset.id}
          onchange={(e) => (presetId = Number(e.currentTarget.value))}
        >
          {#each presets as b}<option value={b.id}>{b.displayName}</option>{/each}
        </select>
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !presetAssignable}
        onclick={() => preset && assign({ behaviorId: preset.id, param1: 0, param2: 0 })}
        >{$t("Assign in Keymap")}</Button
      >
    </div>
    <MacroSource name={preset.displayName} />
  {/if}
</div>
