<script lang="ts">
  import { t } from '$lib/i18n'
  import ModuleLibrary from '$lib/zmk/module-library.svelte'
  import LanguageSelect from '$lib/components/language-select.svelte'
  import { onMount, tick, untrack } from 'svelte'
  import { base } from '$app/paths'
  import { KeyboardIcon, PanelsTopLeftIcon, LayersIcon, SlidersHorizontalIcon, LightbulbIcon, Gamepad2Icon, ScanLineIcon, SettingsIcon, PackageIcon, FileJsonIcon, CableIcon } from '@lucide/svelte'
  import * as Sidebar from '$lib/components/ui/sidebar'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Button } from '$lib/components/ui/button'
  import ThemeSwitcher from '$lib/components/theme-switcher.svelte'
  import BindingsPreview from '$lib/workspace/bindings-preview.svelte'
  import KeyTester from '$lib/workspace/key-tester.svelte'
  import type { MatrixSource } from '$lib/workspace/test-layout'
  import ViaDeviceProbe from '$lib/configurator/via-device-probe.svelte'
  import HmkTools from '$lib/workspace/hmk-tools.svelte'
  import { DemoKeyboard } from '$lib/keyboard/demo-keyboard.svelte'
  import { connectHmkDevice } from '$lib/keyboard/hmk-keyboard.svelte'
  import type { Keyboard } from '$lib/keyboard'
  import { availableTools, tools, type Protocol, type Tool } from '$lib/workspace/features'

  import { discoverKeyboards, rememberKeyboard, requestKeyboard, type FoundKeyboard } from '$lib/workspace/keyboard-discovery'
  import { connectBluetooth } from '$lib/zmk/bluetooth-transport'
  import { openStudioPort } from '$lib/zmk/serial-transport'
  import { openLocalKeyboard } from '$lib/zmk/local-bluetooth'

  const samples = [
    { id: 'via', title: 'VIA Macro Pad', detail: 'Explore a six-key layout and a definition-driven lighting menu.' },
    { id: 'studio', title: 'Studio Macro Pad', detail: 'Edit native behaviors, switch layouts, and inspect a module.' },
    { id: 'hmk', title: 'Hall Effect Board', detail: 'Tune individual keys, rapid trigger, profiles, and gamepad mapping.' },
  ] as const
  const protocols = { via: 'VIA', studio: 'ZMK Studio', hmk: 'HMK' }
  const icons = { bindings: LayersIcon, keymap: KeyboardIcon, layout: PanelsTopLeftIcon, lighting: LightbulbIcon, custom: SlidersHorizontalIcon, actuation: SlidersHorizontalIcon,
    advanced: LayersIcon, gamepad: Gamepad2Icon, calibration: ScanLineIcon, profiles: LayersIcon, settings: SettingsIcon, extensions: PackageIcon, design: FileJsonIcon, test: ScanLineIcon }
  let protocol = $state<Protocol | null>(null)
  let name = $state('')
  let sample = $state(false)
  let active = $state<Tool | 'home'>('home')
  let modulesVisited = $state(false)
  $effect(() => { if (active === 'extensions') modulesVisited = true })
  let light = $state(false), custom = $state(false)
  let matrixSource = $state.raw<MatrixSource>()
  let hidBusy = $state(false), studioBusy = $state(false), hmkBusy = $state(false), choosing = $state(false)
  const busy = $derived(hidBusy || studioBusy || hmkBusy || choosing)
  let message = $state('')
  let epoch = $state(0)
  let dialog = $state(false)
  let hardware = $state({ hid: false, serial: false, bluetooth: false })
  let hid = $state<ViaDeviceProbe>()
  let hmk = $state.raw<Keyboard>()
  let hmkTools = $state<HmkTools>()
  let Studio = $state<typeof import('$lib/zmk/studio-panel.svelte').default>()
  let studio = $state<ReturnType<NonNullable<typeof Studio>>>()
  let boards = $state.raw<FoundKeyboard[]>([])
  let nativeBluetooth = $state(false)
  let bluetoothName = $state('')
  let bluetoothHelp = $state(false)
  let hostedOnMac = $state(false)
  let current = $state<string>()
  let opening = $state.raw<FoundKeyboard>()
  const keymapLoad = $derived<{ ready: boolean; notice?: string; activity?: string; readKiB?: number; retry?: () => void } | undefined>(
    protocol === 'via' ? hid?.keymapLoad() : protocol === 'hmk' ? hmkTools?.keymapLoad() : protocol === 'studio' ? studio?.keymapLoad() : undefined
  )
  const keymapReady = $derived(!!keymapLoad?.ready && !opening)
  const waiting = $derived(!!opening || active === 'home' || (active === 'keymap' && !keymapReady))
  let pending: FoundKeyboard | undefined
  let discovery: ReturnType<typeof discoverKeyboards> | undefined
  const attempted = new Set<string>()
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let lastRetryKey = ''
  let retryCount = 0
  function cancelRetry() {
    clearTimeout(retryTimer)
    retryTimer = undefined
  }
  function retryWireless(key: string) {
    if (!key.startsWith('local:')) return
    if (retryTimer !== undefined && lastRetryKey === key) return
    cancelRetry()
    retryCount = key === lastRetryKey ? retryCount + 1 : 0
    lastRetryKey = key
    const delay = Math.min(30000, 2000 * 2 ** Math.min(retryCount, 4))
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      const board = boards.find(board => board.key === key)
      if (!mounted || current || !board || pending) return
      attempted.delete(key)
      pending = board
      inventoryChanged = true
      boards = [...boards]
    }, delay)
  }
  let inventoryChanged = false
  let mounted = false
  let foreground = $state(true)
  function inventory(next: FoundKeyboard[], native: boolean) {
    nativeBluetooth = native
    const previous = new Set(boards.map(board => board.key))
    const present = new Set(next.map(board => board.key))
    const added = next.filter(board => !previous.has(board.key))
    if (!added.length && previous.size === present.size) return
    for (const key of attempted) if (!present.has(key)) attempted.delete(key)
    if (!present.has(lastRetryKey)) cancelRetry()
    if (current && added.length === 1 && added[0].key !== current && added[0].kind !== 'bluetooth') pending = added[0]
    if (added.length > 1 || (pending && !present.has(pending.key))) pending = undefined
    inventoryChanged = true
    boards = next
  }

  // Only one transport may open or switch a board at a time.
  $effect(() => {
    const hidOnly = boards.length > 0 && boards.every(board => board.kind === 'hid')
    const ready = !!(protocol || hid) && (hidOnly || !!(protocol ? Studio : studio))
    const available = boards
    if (ready && !busy && foreground && !dialog && !sample) untrack(() => {
      if (!mounted || !inventoryChanged) return
      inventoryChanged = false
      if (pending && !attempted.has(pending.key)) void switchTo(pending)
      else if (!protocol && available.length === 1 && !attempted.has(available[0].key)) void switchTo(available[0])
      else if (!protocol && available.length > 1 && retryTimer === undefined && active === 'home') dialog = true
      pending = undefined
    })
  })
  const navigation = $derived(availableTools(protocol, light, custom))
  onMount(() => {
    if (new URLSearchParams(location.search).get('demo') === 'true') {
      location.replace(base + '/unified/lab/' + location.search)
      return
    }
    if (new URLSearchParams(location.search).get('tool') === 'modules') active = 'extensions'
    if (new URLSearchParams(location.search).get('tool') === 'bindings') active = 'bindings'
    mounted = true
    hostedOnMac = /Mac/.test(navigator.platform) && navigator.maxTouchPoints < 2 &&
      !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    foreground = !document.hidden
    discovery = discoverKeyboards(inventory)
    hardware = { hid: 'hid' in navigator, serial: 'serial' in navigator, bluetooth: 'bluetooth' in navigator }
    void import('$lib/zmk/studio-panel.svelte').then(({ default: component }) => Studio = component).catch(() => message = 'Studio could not load. Refresh to try again.')
    return () => { mounted = false; cancelRetry(); discovery?.stop(); if (hmk && !sample) void hmk.disconnect() }
  })
  function enter(kind: Protocol, boardName: string, simulation: boolean) {
    if (opening && !simulation) {
      attempted.delete(opening.key)
      current = opening.key
      rememberKeyboard(opening, boardName)
    }
    protocol = kind; name = boardName; sample = simulation; active = 'keymap'; dialog = false; message = ''
  }
  function reset(notice = '', manual = false) {
    if (notice && current && boards.some(board => board.key === current)) {
      attempted.add(current)
      if (!manual) retryWireless(current)
    }
    if (current?.startsWith('bluetooth:')) void discovery?.refresh()
    protocol = null; sample = false; active = 'home'; name = ''; hmk = undefined; light = false; custom = false
    message = notice; current = undefined; inventoryChanged = true; matrixSource = undefined; hidBusy = false; studioBusy = false; hmkBusy = false; epoch++
  }
  async function disconnect() {
    if (busy) return
    choosing = true
    try {
      cancelRetry()
      for (const board of boards) attempted.add(board.key)
      dialog = false
      await closeCurrent()
      inventoryChanged = false
      pending = undefined
    } finally { choosing = false }
  }
  async function closeCurrent() {
    const previous = hmk
    const realHmk = previous && !sample
    reset()
    if (realHmk) await previous.disconnect()
    await tick()
  }
  function openSample(kind: Protocol) {
    if (busy || protocol) return
    if (kind === 'hmk') hmk = new DemoKeyboard()
    enter(kind, samples.find(board => board.id === kind)!.title, true)
  }
  async function connectHmk(device: HIDDevice) {
    const board = await connectHmkDevice(device, disconnected => {
      if (hmk === disconnected) reset(hmkBusy ? 'Keyboard disconnected · last edit not confirmed.' : 'Keyboard disconnected.')
    })
    hmk = board
    hidBusy = false
    enter('hmk', board.metadata.name, false)
  }
  async function openBoard(board: FoundKeyboard) {
    pending = undefined
    cancelRetry()
    attempted.add(board.key)
    if (current === board.key) { attempted.delete(board.key); dialog = false; return }
    dialog = false
    if (protocol) await closeCurrent()
    opening = board
    message = ''
    try {
      if (board.kind === 'hid') await hid?.openDevice(board.device)
      else {
        const panel = studio
        if (!panel) throw Error('Studio could not load. Refresh to try again.')
        await panel.openKeyboard(() => {
          if (board.kind === 'local') return openLocalKeyboard(board.device)
          if (board.kind === 'bluetooth') return connectBluetooth(board.device)
          return openStudioPort(board.device)
        })
      }
    } finally {
      opening = undefined
      if (current === board.key) lastRetryKey = ''
      else if (!current && attempted.has(board.key)) retryWireless(board.key)
      void discovery?.refresh()
    }
  }

  async function switchTo(board: FoundKeyboard) {
    if (busy) return
    choosing = true
    try { await openBoard(board) }
    catch (error) { message = String(error) }
    finally { choosing = false }
  }

  async function connect(kind: 'hid' | 'usb' | 'bluetooth', exactName = '') {
    if (busy) return
    choosing = true
    try {
      // Request permission during the click and keep the active keyboard if the picker is cancelled.
      const board = await requestKeyboard(kind, exactName)
      if (board) {
        await openBoard(board)
        if (current === board.key) { bluetoothName = ''; bluetoothHelp = false }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        if (kind === 'bluetooth') bluetoothHelp = true
      } else message = String(error)
    } finally { choosing = false }
  }
</script>

<svelte:document onvisibilitychange={() => foreground = !document.hidden}/>
<svelte:head><title>Keyspensory · Keyboard Workspace 0.1</title></svelte:head>
<Dialog.Root bind:open={dialog}>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto">
    <Dialog.Header><Dialog.Title>{$t(protocol ? 'Change keyboard' : 'Connect your keyboard')}</Dialog.Title><Dialog.Description>{$t(boards.length ? 'Choose a detected keyboard or connect another one.' : 'Choose its configuration interface. Connecting reads settings; it does not change them.')}</Dialog.Description></Dialog.Header>
    {#each boards as board (board.key)}
      <Button variant="outline" disabled={busy || board.key === current} onclick={() => switchTo(board)} class="h-auto justify-between gap-3 py-2">
        <span>{board.key === current ? name : board.name}</span><span class="text-xs text-muted-foreground">{board.label}</span>
      </Button>
    {/each}
    <Button variant="outline" disabled={busy || !hardware.hid} onclick={() => connect('hid')}>{$t("USB HID · VIA or HMK")}</Button>
    <Button variant="outline" disabled={busy || !hardware.serial || !Studio} onclick={() => connect('usb')}>{$t("USB serial · ZMK Studio")}</Button>
    {#if nativeBluetooth}
      {#if !boards.some(board => board.kind === 'local')}
        <p class="text-sm text-muted-foreground">{$t('Connect your Studio keyboard in macOS Bluetooth settings to see it here.')}</p>
      {/if}
    {:else}
      <Button variant="outline" disabled={busy || !hardware.bluetooth || !Studio} onclick={() => connect('bluetooth')}>Bluetooth · ZMK Studio</Button>
      {#if hardware.bluetooth || hostedOnMac}
        <details class="text-sm" bind:open={bluetoothHelp}>
          <summary class="cursor-pointer text-muted-foreground">{$t('Keyboard missing from Bluetooth picker?')}</summary>
          <div class="mt-2 grid gap-2">
            <p>{$t('Some keyboards stop advertising once connected to the computer. The browser may then show an empty list, even when you enter the exact name.')}</p>
            <p>{$t('To use this site with a cable, connect the keyboard by USB and choose USB serial · ZMK Studio.')}</p>
            {#if hostedOnMac}
              <p>{$t('For Bluetooth on a Mac running the local configurator, open it to use the current connection.')}</p>
              <div class="flex flex-wrap items-center gap-3">
                <Button href="http://127.0.0.1:4176/hmkconf/unified/" variant="outline" rel="noreferrer">{$t('Open local configurator')}</Button>
                <a class="underline underline-offset-2" href="https://github.com/freather-keyspensory/hmkconf/blob/unified-beta/README.md#local-bluetooth-on-macos" target="_blank" rel="noreferrer">{$t('Mac setup instructions')}</a>
              </div>
            {/if}
          </div>
          {#if hardware.bluetooth}
            <form class="mt-2 grid gap-2" onsubmit={event => { event.preventDefault(); void connect('bluetooth', bluetoothName) }}>
              <label class="grid gap-1">
                {$t('Keyboard name from Bluetooth settings')}
                <input class="h-9 rounded-md border bg-background px-3" bind:value={bluetoothName} autocomplete="off" required />
              </label>
              <Button type="submit" variant="outline" disabled={busy || !Studio || !bluetoothName.trim()}>{$t('Find this keyboard')}</Button>
            </form>
          {/if}
        </details>
      {/if}
    {/if}
    {#if protocol}<Button variant="ghost" disabled={busy} onclick={disconnect}>{$t('Disconnect keyboard')}</Button>{/if}
    {#if !protocol}
      <details class="border-t pt-3">
        <summary class="cursor-pointer text-sm">{$t('Try a sample board')}</summary>
        <div class="mt-2 grid gap-2">{#each samples as board}
          <Button variant="outline" class="grid h-auto justify-items-start gap-1 whitespace-normal py-2 text-left" aria-label={board.title} aria-describedby={'sample-' + board.id} disabled={busy || (board.id === 'studio' && !Studio)} onclick={() => openSample(board.id)}>
            {board.title}<span id={'sample-' + board.id} class="text-xs font-normal text-muted-foreground">{$t(board.detail)}</span>
          </Button>
        {/each}</div>
      </details>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<Sidebar.Provider>
  <Sidebar.Root collapsible="offcanvas">
    <Sidebar.Header class="gap-4 p-4">
      <div class="flex items-center gap-3"><span class="brand"><KeyboardIcon size={21}/></span><div><strong>Keyspensory</strong><p class="eyebrow">{$t('Workspace')} / 0.1</p></div></div>
      {#if protocol}<div class="rounded-lg border bg-background p-3"><p class="eyebrow">{$t(sample ? 'SAMPLE SESSION' : 'CONNECTED DEVICE')}</p><strong class="text-sm">{name}</strong></div>{/if}
      <Button variant="outline" disabled={busy} onclick={() => { pending = undefined; inventoryChanged = false; dialog = true }}><CableIcon/>{$t(protocol ? 'Change keyboard' : 'Connect keyboard')}</Button>
    </Sidebar.Header>
    <Sidebar.Content><Sidebar.Group><Sidebar.GroupLabel>{$t(protocol ? 'Keyboard tools' : 'Workspace')}</Sidebar.GroupLabel><Sidebar.Menu>
      {#if !protocol}<Sidebar.MenuItem><Sidebar.MenuButton disabled={busy} isActive={active === 'home'} onclick={() => active = 'home'}><KeyboardIcon/><span>{$t("Overview")}</span></Sidebar.MenuButton></Sidebar.MenuItem>{/if}
      {#each navigation as tool}
        {@const Icon = icons[tool]}
        <Sidebar.MenuItem><Sidebar.MenuButton disabled={busy} isActive={active === tool} onclick={() => active = tool}><Icon/><span>{$t(tools[tool])}</span></Sidebar.MenuButton></Sidebar.MenuItem>
      {/each}
    </Sidebar.Menu></Sidebar.Group></Sidebar.Content>
    <Sidebar.Footer class="p-4 text-xs text-muted-foreground">{#if !protocol}<a href={base + '/unified/lab/?demo=true'}>{$t("Design lab ↗")}</a>{/if}<span>{$t("Built on HMKconf · GPL-3.0")}</span></Sidebar.Footer>
  </Sidebar.Root>
  <Sidebar.Inset class="min-w-0">
    <header class="flex min-h-16 flex-wrap items-center gap-2 border-b px-3 py-2 sm:gap-3 sm:px-6">
      <Sidebar.Trigger/>
      <div class="flex items-center gap-2 text-sm sm:gap-3">
        <span class="font-medium">{protocol ? protocols[protocol] : $t('Workspace')}</span>
        <span class="text-muted-foreground">/</span>
        <span>{$t(active === 'home' ? 'Overview' : tools[active])}</span>
      </div>
      <div class="ml-auto flex items-center gap-2 sm:gap-3">
        <span class="pill">{$t(sample || (!protocol && active === 'bindings') ? 'Simulation' : opening || (protocol && !keymapReady && !keymapLoad?.notice) ? 'Loading...' : protocol ? 'Connected' : 'Offline')}</span>
        <LanguageSelect/>
        <ThemeSwitcher/>
      </div>
    </header>
    {#if message}<p class="border-b px-6 py-3 text-sm" role="status">{$t(message)}</p>{/if}
    {#if waiting}
      <section class="keyboard-wait">
        <div class="grid justify-items-center gap-4 text-center">
          <div class="dot-ring" aria-hidden="true">
            {#each Array(10) as _, i}
              <span style:--dot={i}></span>
            {/each}
          </div>
          <div role="status" class="grid gap-1">
            <h1 class="text-xl font-semibold">{$t(protocol || opening ? 'Loading keymap…' : 'Waiting for a keyboard')}</h1>
            {#if keymapLoad?.activity}<p class="text-sm text-muted-foreground">{$t(keymapLoad.activity)}</p>{/if}
            {#if keymapLoad?.notice && !opening}<p class="max-w-md text-sm text-muted-foreground">{$t(keymapLoad.notice)}</p>{/if}
          </div>
          {#if keymapLoad?.readKiB !== undefined}
            <span class="font-mono text-xs tabular-nums text-muted-foreground">{$t('{size} KiB received', {size: keymapLoad.readKiB})}</span>
          {/if}
          {#if keymapLoad?.retry && !opening}
            <Button variant="outline" disabled={busy} onclick={keymapLoad.retry}>{$t('Read keyboard')}</Button>
          {:else if !protocol && !opening}
            <Button variant="outline" disabled={busy} onclick={() => dialog = true}><CableIcon/>{$t('Connect a keyboard')}</Button>
          {/if}
        </div>
      </section>
    {/if}
    {#if !waiting && !protocol && active === 'bindings'}<BindingsPreview/>{/if}
    {#if modulesVisited}
      <div hidden={waiting || active !== 'extensions'}>
        <ModuleLibrary keyboard={protocol === 'studio' ? studio?.moduleTools() : undefined}/>
      </div>
    {/if}
    {#key epoch}
      {#if !protocol || protocol === 'via'}
        {#key sample}
          <div hidden={waiting || active === 'test' || !(protocol === 'via' || active === 'design')}>
            <ViaDeviceProbe bind:this={hid} {sample} view={active} onBusy={value => hidBusy = value}
              onMessage={value => message = value} onHmk={connectHmk}
              onCustom={value => custom = value} onLighting={value => light = value}
              onMatrix={source => matrixSource = source}
              onConnected={(value, boardName) => {
                if (value) enter('via', boardName ?? 'VIA keyboard', false)
                else if (protocol === 'via' && !sample) reset(hidBusy ? 'Disconnected · last operation not confirmed.' : 'Keyboard disconnected.')
              }}/>
          </div>
        {/key}
      {/if}
      {#if Studio && (!protocol || protocol === 'studio')}
        {#key sample}
          <div hidden={waiting || protocol !== 'studio' || active === 'test' || active === 'extensions'}>
            <Studio bind:this={studio} {sample} view={active} onNavigate={tool => active = tool} onBusy={value => studioBusy = value}
              onConnected={boardName => { if (!sample) enter('studio', boardName, false) }}
              onDisconnected={manual => { if (protocol === 'studio') reset(message || 'Studio session closed.', manual) }}
              onConnectError={error => message = error}/>
          </div>
        {/key}
      {/if}
      {#if protocol === 'hmk' && hmk && active !== 'home'}<div hidden={waiting || active === 'test'}><HmkTools bind:this={hmkTools} keyboard={hmk} view={active} onBusy={value => hmkBusy = value}/></div>{/if}
      {#if !waiting && active === 'test'}
        <KeyTester source={protocol === 'via' ? matrixSource : undefined}/>
      {/if}
    {/key}
  </Sidebar.Inset>
</Sidebar.Provider>

<style>
  .brand {display:grid;place-items:center;width:2.5rem;height:2.5rem;border-radius:.65rem;background:#234636;color:#d9f9c6}
  .eyebrow,.pill {font:600 .67rem/1.5 ui-monospace,monospace;letter-spacing:.08em;color:var(--muted-foreground)}
  .pill {letter-spacing:.02em;border:1px solid var(--border);border-radius:1rem;padding:.22rem .65rem}
  .keyboard-wait {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 3rem 1.25rem;
  }
  .dot-ring {
    position: relative;
    width: 3rem;
    height: 3rem;
    color: var(--foreground);
    animation: orbit 3.6s linear infinite;
  }
  .dot-ring span {
    position: absolute;
    inset: 50% auto auto 50%;
    width: .38rem;
    height: .38rem;
    border-radius: 50%;
    background: currentColor;
    opacity: calc(.22 + var(--dot) * .085);
    transform: translate(-50%, -50%) rotate(calc(var(--dot) * 36deg)) translateY(-1.24rem);
  }
  @keyframes orbit { to { transform: rotate(1turn) } }
  @media (prefers-reduced-motion: reduce) { .dot-ring { animation: none } }
</style>
