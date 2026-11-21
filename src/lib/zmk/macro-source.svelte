<script lang="ts">
  import { Button } from "$lib/components/ui/button"
  import { t } from "$lib/i18n"
  import {
    isKeyExpression,
    keySteps,
    replaceMacroBodies,
    sourceMacros,
    stepBindings,
    type SourceStep,
  } from "./macro-source"

  let { name }: { name: string } = $props()
  let source = $state(""),
    filename = $state("")
  let changes = $state<Record<number, string>>({})
  let error = $state("")
  let generation = 0
  const macros = $derived(sourceMacros(source))
  const matches = $derived(macros.filter((m) => m.name === name))
  const macro = $derived(matches.length === 1 ? matches[0] : undefined)
  const value = $derived(macro ? (changes[macro.start] ?? source.slice(macro.start, macro.end)) : "")
  const steps = $derived(keySteps(value))
  function changeStep(next: SourceStep[]) {
    if (macro && next.length) changes[macro.start] = stepBindings(next)
  }
  const valid = (body: string) =>
    /^\s*<[^;{}<>]+>(?:\s*,\s*<[^;{}<>]+>)*\s*$/.test(body) && body.includes("&")
  async function load(file?: File) {
    if (!file) return
    const seq = ++generation
    try {
      const text = await file.text()
      if (seq !== generation) return
      source = text
      filename = file.name
      changes = {}
      error = ""
    } catch {
      if (seq === generation) error = "Could not read the keymap file."
    }
  }
  function download() {
    if (!Object.keys(changes).length || !Object.values(changes).every(valid)) return
    const url = URL.createObjectURL(
      new Blob([replaceMacroBodies(source, macros, changes)], { type: "text/plain" }),
    )
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
</script>

<details class="rounded-md border p-3 text-sm">
  <summary class="cursor-pointer font-medium">{$t("Edit firmware macro source")}</summary>
  <div class="mt-3 grid gap-3">
    <p class="text-muted-foreground">
      {$t(
        "Edit your original .keymap file here. Rebuild the firmware with the downloaded file and flash it to use the new sequence.",
      )}
    </p>
    <input
      type="file"
      accept=".keymap,.dtsi,.overlay,.dts"
      aria-label={$t("Open keymap source")}
      onchange={(e) => load(e.currentTarget.files?.[0])}
    />
    {#if error}<p role="alert">{$t(error)}</p>{/if}
    {#if macro}
      {#if steps}
        <h4 class="font-medium">{name} · {$t("Action sequence")}</h4>
        {#each steps as step, i}
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground">{i + 1}</span>
            <select
              class="rounded-md border bg-background p-2"
              aria-label={$t("Step action")}
              value={step.mode}
              onchange={(e) => {
                const mode = e.currentTarget.value as SourceStep["mode"]
                changeStep((steps ?? []).map((s, j) => (j === i ? { ...s, mode } : s)))
              }}
            >
              <option value="tap">{$t("Tap")}</option><option value="press">{$t("Press")}</option><option
                value="release">{$t("Release")}</option
              >
            </select>
            <input
              class="w-32 rounded-md border bg-background p-2"
              aria-label={$t("Keycode")}
              value={step.key}
              required
              onchange={(e) => {
                const input = e.currentTarget
                const key = input.value.trim().toUpperCase()
                if (isKeyExpression(key)) {
                  input.setCustomValidity("")
                  changeStep((steps ?? []).map((s, j) => (j === i ? { ...s, key } : s)))
                } else {
                  input.setCustomValidity($t("Enter a ZMK keycode."))
                  input.reportValidity()
                  input.value = step.key
                  input.setCustomValidity("")
                }
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={steps.length <= 1}
              onclick={() => changeStep((steps ?? []).filter((_, j) => j !== i))}>{$t("Remove")}</Button
            >
          </div>
        {/each}
        <Button
          class="justify-self-start"
          size="sm"
          variant="outline"
          onclick={() => changeStep([...(steps ?? []), { mode: "tap", key: "SPACE" }])}
          >{$t("Add step")}</Button
        >
      {/if}
      <label class="grid gap-1"
        >{$t("ZMK bindings")}
        <textarea
          class="min-h-20 rounded-md border bg-background p-2 font-mono"
          {value}
          oninput={(e) => {
            if (macro) changes[macro.start] = e.currentTarget.value
          }}
        ></textarea>
      </label>
      {#if !valid(value)}<span>{$t("Enter ZMK bindings inside angle brackets.")}</span>{/if}
    {:else if filename}<p>{$t("No unique definition for this macro in the selected file.")}</p>{/if}
    {#if filename}<Button
        class="justify-self-start"
        variant="outline"
        size="sm"
        disabled={!Object.keys(changes).length || !Object.values(changes).every(valid)}
        onclick={download}>{$t("Download edited keymap")}</Button
      >{/if}
  </div>
</details>
