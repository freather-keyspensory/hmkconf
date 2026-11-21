<script lang="ts">
  import { language, t } from '$lib/i18n'
  import { onMount } from 'svelte'
  import { parseExpr } from '@the-via/pelpi'
  import * as Tabs from '$lib/components/ui/tabs'
  import { Button } from '$lib/components/ui/button'
  import type { ViaAdapter } from '$lib/via/adapter'
  import { LiveLighting } from '$lib/via/live-lighting'
  import ColorPicker from '$lib/via/color-picker.svelte'
  import { hexToHsv, hsvToHex } from '$lib/via/color'
  import { controlWidth, isByte, isLightingMenu, menuVisible, type ViaControl, type ViaMenu, type ViaMenuNode, type ViaMenuValues } from '$lib/via/custom-menus'

  let { adapter, menus, legacy = false, lightingOnly = false, sample = false, onWriting = () => {} }: {
    adapter: ViaAdapter; menus: ViaMenu[]; legacy?: boolean; lightingOnly?: boolean; sample?: boolean; onWriting?: (value: boolean) => void
  } = $props()
  let values = $state.raw<ViaMenuValues>(Object.create(null))
  let sliderDraft = $state<{ id: string; value: number } | null>(null)
  let attempted = new Set<string>()
  let activeMenu = $state(-1)
  let busy = $state(true)
  let status = $state('Reading firmware version…')
  let closed = false
  const visibleMenus = $derived(menus.filter(menu => menuVisible(menu, values) && isLightingMenu(menu) === lightingOnly))
  const menu = $derived(menus[activeMenu])
  function menuText(source: string) {
    const dictionary = adapter.definition.translations?.[$language]
    const translated = dictionary && Object.hasOwn(dictionary, source) ? dictionary[source] : undefined
    return typeof translated === 'string' && translated.length ? translated : $t(source)
  }
  let live: LiveLighting
  let previewing = $state(false)
  let previewId = ''
  let previewBytes: number[] = []

  function preview(control: ViaControl, data: number[]) {
    if (!lightingOnly || busy || closed || !data.length) return
    if (previewId === control.id && data.every((value,index) => previewBytes[index] === value)) return
    previewId = control.id
    previewBytes = data
    live.update(control.command.join(':'), [7, ...control.command, ...data])
    previewing = true
    onWriting(true)
    status = 'Updating keyboard…'
  }

  function visibleControls(nodes: ViaMenuNode[]): ViaControl[] {
    return nodes.filter(node => menuVisible(node, values)).flatMap(node =>
      'type' in node ? [node] : visibleControls(node.content),
    )
  }

  async function readControl(control: ViaControl) {
    if (closed || attempted.has(control.id) || !control.command.length || control.type === 'button') return
    attempted.add(control.id)
    try {
      const data = await adapter.readCustomValue(control.command, controlWidth(control))
      if (!closed) values = { ...values, [control.id]: data }
    } catch {
      // Drop the last value if the firmware no longer responds to this control.
      const next = { ...values }
      delete next[control.id]
      values = next
    }
  }

  async function loadControls() {
    if (!menu) return
    while (!closed) {
      const pending = visibleControls(menu.content).filter(item =>
        item.type !== 'button' && item.command.length && !attempted.has(item.id),
      )
      if (!pending.length) break
      for (const item of pending) await readControl(item)
    }
  }

  async function loadVisibilityValues() {
    const references = new Set<string>()
    const controls = new Map<string, ViaControl>()
    function collect(nodes: ViaMenuNode[]) {
      for (const node of nodes) {
        if (node.showIf) {
          try {
            const keys = Object.keys(parseExpr(node.showIf).state)
            if (keys.length === 1 && keys[0] === 'id_firmware_version' && !menuVisible(node, values)) continue
            for (const key of keys) references.add(key)
          } catch {
            continue
          }
        }
        if ('type' in node) controls.set(node.id, node)
        else collect(node.content)
      }
    }
    collect(menus)
    for (const id of references) {
      const control = controls.get(id)
      if (id !== 'id_firmware_version' && control) await readControl(control)
    }
  }

  async function selectMenu(index: number) {
    activeMenu = index
    busy = true
    status = 'Reading controls…'
    try {
      await loadControls()
      status = ''
    } finally {
      busy = false
    }
  }

  onMount(() => {
    live = new LiveLighting(packet => adapter.command(packet), error => { status = 'Live update failed · ' + String(error) })
    void (async () => {
      try {
        if (!legacy) values = { ...values, id_firmware_version: [await adapter.firmwareVersion()] }
      } catch {
        // Firmware version gates stay hidden if the board cannot report it.
      }
      await loadVisibilityValues()
      if (!closed) await selectMenu(menus.indexOf(visibleMenus[0]))
    })()
    return () => { closed = true; live.dispose() }
  })

  const bytes = (value: unknown): number[] => {
    const data = Array.isArray(value) ? value : [value]
    return data.every(isByte) ? data : []
  }

  function numberValue(control: ViaControl, value: number) {
    const width = controlWidth(control)
    if (!Number.isInteger(value) || value < 0 || value >= 256 ** width) return []
    return width === 2 ? [value >> 8, value & 255] : [value]
  }

  async function write(control: ViaControl, data: number[]) {
    if (busy || closed || !data.length) return
    busy = true
    onWriting(true)
    status = 'Saving…'
    try {
      if (previewing) await live.flush()
      const brightness = control.id === 'id_qmk_backlight_brightness' || (legacy && control.command[0] === 9)
      const actual = await adapter.writeCustomValue(control.command, data, control.type !== 'button', brightness)
      if (!closed) {
        values = { ...values, [control.id]: actual }
        attempted.clear()
        attempted.add(control.id)
        await loadVisibilityValues()
        if (menu && !menuVisible(menu, values)) activeMenu = menus.indexOf(visibleMenus[0])
        await loadControls()
        status = sample ? 'Saved in sample session.' : 'Saved to keyboard.'
      }
    } catch (error) {
      attempted.delete(control.id)
      await readControl(control)
      status = 'Not confirmed · ' + String(error)
    } finally {
      previewId = ''
      previewBytes = []
      previewing = false
      busy = false
      onWriting(false)
    }
  }
</script>

<section class="@container w-full py-6" aria-label={$t(lightingOnly ? 'VIA lighting' : 'VIA custom controls')}>
  <h2 class="text-xl font-semibold">{$t(lightingOnly ? 'Lighting' : 'Custom controls')}</h2>
  <p class="mt-2 text-sm text-muted-foreground">{$t(lightingOnly ? 'Changes update the keyboard as you adjust them. The final value saves automatically.' : 'Controls from the matched VIA definition and the connected firmware.')}</p>
  <Tabs.Root orientation="vertical" class="mt-4 grid grid-cols-1 items-start gap-3 @min-[44rem]:grid-cols-[minmax(0,1fr)_min(66%,44rem)_minmax(0,1fr)]" value={String(activeMenu)} onValueChange={value => selectMenu(Number(value))}>
    {#if visibleMenus.length}
      <Tabs.List aria-label={$t("Custom control menus")} class="col-start-1 row-start-1 max-h-60 w-full max-w-40 justify-start overflow-y-auto">
        {#each visibleMenus as item}
          <Tabs.Trigger class="h-auto shrink-0 whitespace-normal text-left wrap-anywhere" value={String(menus.indexOf(item))} disabled={busy || previewing}>{menuText(item.label || 'Custom')}</Tabs.Trigger>
        {/each}
      </Tabs.List>
    {/if}
    <div class="col-start-1 row-start-2 flex h-[clamp(18rem,calc(100dvh-22rem),48rem)] min-w-0 @min-[44rem]:col-start-2 @min-[44rem]:row-start-1 flex-col rounded-lg border">
      {#each visibleMenus as item}
        <Tabs.Content class="min-h-0 flex-1 overflow-auto p-3 [scrollbar-gutter:stable] sm:p-4" value={String(menus.indexOf(item))}>
          <div class="grid gap-4">{@render renderNodes(item.content)}</div>
        </Tabs.Content>
      {/each}
      {#if !menu && !busy}
        <p class="p-3 text-sm text-muted-foreground">{$t("The connected firmware reports no matching custom controls.")}</p>
      {/if}
      <p class="shrink-0 px-3 py-2 text-sm text-muted-foreground empty:hidden" role="status">{$t(status)}</p>
    </div>
  </Tabs.Root>
</section>

{#snippet renderNodes(nodes: ViaMenuNode[])}
  {#each nodes.filter(node => menuVisible(node, values)) as node}
    {#if !('type' in node)}
      <div class="grid gap-3 rounded-md border p-4">
        {#if node.label}<h3 class="text-sm font-medium">{menuText(node.label)}</h3>{/if}
        {@render renderNodes(node.content)}
      </div>
    {:else if node.type === 'button'}
      <Button class="justify-self-start" variant="outline" disabled={busy} onclick={() => write(node, bytes(node.options[0] ?? 1))}>{menuText(node.label)}</Button>
    {:else if node.type === 'label'}
      {#if node.command.length === 0}
        <p class="text-sm text-muted-foreground">{menuText(node.label || node.id)}</p>
      {:else if values[node.id]}
        <p class="text-sm">{menuText(node.label)} {menuText(new TextDecoder().decode(new Uint8Array(values[node.id])).split('\0')[0])}</p>
      {/if}
    {:else if lightingOnly && node.type === 'color' && values[node.id]}
      <ColorPicker label={menuText(node.label)} hue={values[node.id][0]} saturation={values[node.id][1]} disabled={busy}
        onInput={color => preview(node, [color.hue, color.saturation])} onCommit={color => write(node, [color.hue, color.saturation])}/>
    {:else if values[node.id]}
      {@const data = values[node.id]}
      {@const numeric = data.length === 2 ? (data[0] << 8) | data[1] : data[0]}
      <label class="flex flex-wrap items-center justify-between gap-3 text-sm">
        {menuText(node.label)}
        {#if node.type === 'range'}
          {@const displayed = sliderDraft?.id === node.id ? sliderDraft.value : numeric}
          <span class="flex w-48 max-w-full items-center gap-3">
            <input type="range" aria-label={menuText(node.label)} class="min-w-0 flex-1 accent-primary" disabled={busy}
              min={Number(node.options[0] ?? 0)} max={Number(node.options[1] ?? 255)} value={displayed}
              oninput={event => {
                sliderDraft = { id: node.id, value: event.currentTarget.valueAsNumber }
                preview(node, numberValue(node, sliderDraft.value))
              }}
              onblur={() => { if (previewing && previewId === node.id) void write(node, previewBytes); sliderDraft = null }}
              onchange={async event => {
                await write(node, numberValue(node, event.currentTarget.valueAsNumber))
                sliderDraft = null
              }} />
            <span aria-hidden="true" class="min-w-10 text-right font-medium tabular-nums">{displayed}</span>
          </span>
        {:else if node.type === 'keycode'}
          <input type="number" class="w-28 rounded-md border bg-background p-2" disabled={busy}
            min={0}
            max={65535}
            value={numeric} onchange={event => {
              if (event.currentTarget.validity.valid) void write(node, numberValue(node, event.currentTarget.valueAsNumber))
            }} />
        {:else if node.type === 'toggle'}
          {@const enabled = bytes(node.options[1] ?? 1)}
          {@const checked = enabled.every((byte, index) => byte === data[index])}
          <button type="button" role="switch" aria-label={menuText(node.label)} aria-checked={checked} disabled={busy}
            class="flex items-center gap-2 rounded-sm disabled:opacity-60"
            onclick={() => write(node, bytes(node.options[checked ? 0 : 1] ?? Number(!checked)))}>
            <span class="text-xs text-muted-foreground">{$t(checked ? 'On' : 'Off')}</span>
            <span class="flex h-5 w-9 items-center rounded-full border px-0.5 {checked ? 'bg-primary' : 'bg-muted'}">
              <span class="size-4 rounded-full bg-background shadow-sm transition-transform {checked ? 'translate-x-3.5' : ''}"></span>
            </span>
          </button>
        {:else if node.type === 'dropdown'}
          <select class="rounded-md border bg-background p-2" disabled={busy} value={data[0]}
            onchange={event => write(node, bytes(Number(event.currentTarget.value)))}>
            {#each node.options as option, index}
              <option value={Array.isArray(option) ? option[1] : index}>{menuText(String(Array.isArray(option) ? option[0] : option))}</option>
            {/each}
          </select>
        {:else if node.type === 'color'}
          <input type="color" aria-label={menuText(node.label)} disabled={busy} value={hsvToHex(data[0], data[1])} oninput={event => {
            const { hue, saturation } = hexToHsv(event.currentTarget.value)
            preview(node, [hue, saturation])
          }} onblur={() => { if (previewing && previewId === node.id) void write(node, previewBytes) }} onchange={event => {
            const { hue, saturation } = hexToHsv(event.currentTarget.value)
            void write(node, [hue, saturation])
          }} />
        {/if}
      </label>
    {/if}
  {/each}
{/snippet}
