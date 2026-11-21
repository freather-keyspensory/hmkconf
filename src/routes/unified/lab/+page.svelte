<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar"
  import * as Dialog from "$lib/components/ui/dialog"
  import { Button } from "$lib/components/ui/button"
  import { Switch } from "$lib/components/ui/switch"
  import ThemeSwitcher from "$lib/components/theme-switcher.svelte"
  import LanguageSelect from "$lib/components/language-select.svelte"
  import { KeyboardIcon, ScanLineIcon, BluetoothIcon, SlidersHorizontalIcon, Gamepad2Icon, LightbulbIcon, FileJsonIcon, SettingsIcon, PackageIcon } from "@lucide/svelte"
  import Configurator from "$lib/configurator/configurator.svelte"
  import { connectHmkDevice } from "$lib/keyboard/hmk-keyboard.svelte"
  import { keyboardContext, type Keyboard } from "$lib/keyboard"
  import { DemoKeyboard } from "$lib/keyboard/demo-keyboard.svelte"
  import { setConfiguratorStateContext, persistedStateContext, displayLayoutContext } from "$lib/configurator/context.svelte"
  import { setConfiguratorQueryContext } from "$lib/configurator/queries"
  import RemapTab from "$lib/configurator/remap/remap-tab.svelte"
  import { KeyboardEditorKeyboard } from "$lib/components/keyboard-editor"
  import { KeycodeButton } from "$lib/components/keycode-button"
  import { keymapQueryContext } from "$lib/configurator/queries/keymap-query.svelte"
  import RemapKeyboard from "$lib/configurator/remap/remap-keyboard.svelte"
  import ViaDeviceProbe from "$lib/configurator/via-device-probe.svelte"
  import EC23UDefinitionPreview from "$lib/configurator/ec23u-definition-preview.svelte"
  import CipulotECPreview from "$lib/configurator/cipulot-ec-preview.svelte"
  import FirmwareBuildPanel from "$lib/firmware/firmware-build-panel.svelte"
  import FirmwarePanel from "$lib/firmware/firmware-panel.svelte"
  import GamepadTester from "$lib/configurator/gamepad/gamepad-tester.svelte"
  import GamepadTab from "$lib/configurator/gamepad/gamepad-tab.svelte"
  import PerformanceTab from "$lib/configurator/performance/performance-tab.svelte"
  import { onMount } from "svelte"

  keyboardContext.set(new DemoKeyboard())
  setConfiguratorStateContext()
  setConfiguratorQueryContext()
  const testerKeymap = keymapQueryContext.get()
  const layoutState = persistedStateContext.get()
  const layoutLabels = keyboardContext.get().metadata.layout.labels
  let deviceConnection=$state<ViaDeviceProbe>()
  let connectedBoards=$state<{id:string;name:string}[]>([])
  let selectedBoard=$state('')
  const studioBoardId = 'studio-device'
  let studioName = $state('')
  let studioSelected = $state(false)
  let studioConnecting = $state(false)
  let studioStatus = $state('')
  let connectDialog = $state(false)
  let StudioPanel = $state<typeof import('$lib/zmk/studio-panel.svelte').default>()
  let studioEditor = $state<ReturnType<NonNullable<typeof StudioPanel>>>()

  function showStudio(name: string) {
    studioName = name
    studioSelected = true
    sampleBoard = ''
    studioStatus = ''
    tab = 'studio'
  }

  function clearStudio() {
    studioName = ''
    if (studioSelected) {
      studioSelected = false
      if (tab === 'studio') tab = 'keymap'
    }
  }

  async function connectStudio(transport: 'usb' | 'bluetooth') {
    if (!studioEditor || studioConnecting) return
    if (studioName) {
      showStudio(studioName)
      connectDialog = false
      return
    }
    studioConnecting = true
    studioStatus = ''
    connectDialog = false
    try {
      await studioEditor.connect(transport)
    } finally {
      studioConnecting = false
    }
  }

  function connectHid() {
    studioStatus = ''
    connectDialog = false
    void deviceConnection?.connectNew()
  }
  let demoPreview=$state(false)
  const testBoard = { id:'test-nrf54', name:'nRF54LM20A Tri-mode · Test board', protocol:'ZMK Studio', sensor:'mechanical', bluetooth:true, lighting:false }
  const samples = [
    { id: 'sample-via', name: 'VIA Macro Pad · Sample' },
    { id: 'sample-zmk', name: 'ZMK Studio Macro Pad · Sample' },
    { id: 'sample-hmk', name: 'HMK Hall Effect · Sample' },
    testBoard,
  ]
  let sampleBoard = $state('')
  const selectedSample = $derived(samples.find(board => board.id === sampleBoard))
  const testBoardSelected = $derived(sampleBoard === testBoard.id)
  const viaSampleSelected = $derived(sampleBoard === 'sample-via')
  const outputModes = ['Wired USB', 'Bluetooth', '2.4 GHz receiver'] as const
  let testOutput = $state<(typeof outputModes)[number]>('Wired USB')
  let hardwareName = $state('VIA keyboard')
  let hardwareConnected = $state(false)
  let viaLighting = $state(false)
  let viaCustom = $state(false)
  let hmkKeyboard = $state<Keyboard | null>(null)

  async function openHmk(device: HIDDevice) {
    hmkKeyboard = await connectHmkDevice(device, (keyboard) => {
      if (hmkKeyboard === keyboard) {
        hmkKeyboard = null
        tab = 'keymap'
      }
    })
    sampleBoard = ''
    hardwareConnected = false
    viaLighting = false
  }
  const liveBoardSelected = $derived(hardwareConnected && !selectedSample && !studioSelected)
  const showBuildFirmware = $derived(!liveBoardSelected && !viaSampleSelected)
  let tab = $state('keymap')
  const showKeymapInstructions = $derived(tab === 'keymap' && !hardwareConnected && !selectedSample && !demoPreview)
  const centerViaPanel = $derived(!selectedSample && tab === 'design')
  let section = $state('Keymap')
  let device = $state('ec23u')
  let design = $state(true)
  let brightness = $state(70)
  let lightingEffect = $state('Static')
  let color = $state('#a78bfa')
  let sleepEnabled = $state(true)
  let sleepMinutes = $state(5)
  let deepSleepEnabled = $state(true)
  let deepSleepMinutes = $state(30)
  let settingsView = $state('info')
  let gamepadView = $state('configure')
  let advancedMode = $state('Rappy Snappy')
  let advancedPair = $state({ first: 'A', second: 'D', enabled: true, resolution: 'Last input wins' })
  let dks = $state([{point:'Press · stage 1',depth:0.5,action:'Key down',key:'W'},{point:'Press · stage 2',depth:2,action:'Key down',key:'Shift'},{point:'Release · stage 2',depth:1.5,action:'Key up',key:'Shift'},{point:'Release · stage 1',depth:0.2,action:'Key up',key:'W'}])
  let combos = $state([{ name: 'Combo 1', keys: 'Q + W', output: 'Escape', timeout: 50, enabled: true }])
  let macros = $state([{ name: 'Macro 1', text: '', delay: 20 }])
  let editorIndex = $state(0)
  let indicators = $state([
    { id: 'caps', name: 'Caps Lock', enabled: true, linked: false, color: '#ffffff', brightness: 100 },
    { id: 'layer', name: 'Layer', enabled: true, linked: true, color: '#a78bfa', brightness: 70 },
    { id: 'connection', name: 'Connection', enabled: true, linked: false, color: '#60a5fa', brightness: 70 },
  ])
  let definition = $state('')
  let definitionStatus = $state('No definition imported')
  let actuationView = $state('settings')
  let calibrationPressed = $state<number[]>([])
  let calibrationHeld = $state<number[]>([])
  const calibrationLayout = displayLayoutContext.get()
  let calibrationStep = $state(0)
  let testMatrix = $state(false)
  let tested = $state<string[]>([])
  let active = $state<string[]>([])
  let ready = $state(false)
  const devices = [{ id:'via', name:'My design', protocol:'VIA', sensor:'mechanical', bluetooth:false, lighting:true }, { id:'zmk', name:'M50', protocol:'ZMK Studio', sensor:'mechanical', bluetooth:true, lighting:false }, { id:'cinque', name:'cinqueHE', protocol:'HMKconf', sensor:'hall-effect', bluetooth:false, lighting:true }, { id:'ec23u', name:'Cipulot EC23U · protocol preview', protocol:'VIA', sensor:'ec', bluetooth:false, lighting:true }, { id:'zmk-ec', name:'EC Bluetooth · test', protocol:'ZMK Studio', sensor:'ec', bluetooth:true, lighting:true }]
  const current = $derived(testBoardSelected ? testBoard : devices.find(d => d.id === device)!)
  function selectBoard(id: string) {
    if (id === studioBoardId && studioName) {
      showStudio(studioName)
      return
    }
    studioSelected = false
    sampleBoard = samples.some(board => board.id === id) ? id : ''
    section = 'Keymap'
    if (sampleBoard === 'sample-hmk') {
      hardwareConnected = false
      selectedBoard = ''
      hmkKeyboard = new DemoKeyboard()
      tab = 'keymap'
    } else if (sampleBoard === 'sample-zmk') {
      tab = 'studio'
    } else {
      tab = testBoardSelected ? 'connection' : 'keymap'
      if (!sampleBoard && id && id !== selectedBoard) void deviceConnection?.selectDevice(id)
    }
  }
  // Preview capabilities only. Real adapters must supply these after discovery.
  const sections = $derived(['Keymap','Combos','Macros', ...(['hall-effect','ec'].includes(current.sensor) ? ['Advanced keys'] : []), 'Layout'])
  const navigation = [{id:'keymap',label:'Keymap',icon:KeyboardIcon},{id:'custom',label:'Custom controls',icon:SlidersHorizontalIcon},{id:'tester',label:'Matrix tester',icon:ScanLineIcon},{id:'actuation',label:'Actuation',icon:SlidersHorizontalIcon},{id:'lighting',label:'Lighting',icon:LightbulbIcon},{id:'gamepad',label:'Gamepad',icon:Gamepad2Icon},{id:'bluetooth',label:'Bluetooth',icon:BluetoothIcon},{id:'design',label:'Design',icon:FileJsonIcon},{id:'settings',label:'Settings',icon:SettingsIcon}]
  const codeUsages: Record<string, number> = { Enter:40, Escape:41, Backspace:42, Tab:43, Space:44, Minus:45, Equal:46, BracketLeft:47, BracketRight:48, Backslash:49, Semicolon:51, Quote:52, Backquote:53, Comma:54, Period:55, Slash:56, CapsLock:57, ArrowRight:79, ArrowLeft:80, ArrowDown:81, ArrowUp:82, ControlLeft:224, ShiftLeft:225, AltLeft:226, MetaLeft:227, ControlRight:228, ShiftRight:229, AltRight:230, MetaRight:231 }
  const fullRows = [
    ['Escape','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12','PrintScreen','ScrollLock','Pause','AudioVolumeMute','AudioVolumeDown','AudioVolumeUp','MediaPlayPause'],
    ['Backquote','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal','Backspace','Insert','Home','PageUp','NumLock','NumpadDivide','NumpadMultiply','NumpadSubtract'],
    ['Tab','KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight','Backslash','Delete','End','PageDown','Numpad7','Numpad8','Numpad9','NumpadAdd'],
    ['CapsLock','KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote','Enter','Numpad4','Numpad5','Numpad6'],
    ['ShiftLeft','KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash','ShiftRight','ArrowUp','Numpad1','Numpad2','Numpad3','NumpadEnter'],
    ['ControlLeft','MetaLeft','AltLeft','Space','AltRight','MetaRight','ContextMenu','ControlRight','ArrowLeft','ArrowDown','ArrowRight','Numpad0','NumpadDecimal'],
  ]
  const keyLabels: Record<string,string> = { Backquote:'~ \u0060',Minus:'−',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',ControlLeft:'Ctrl',ControlRight:'Ctrl',MetaLeft:'Win',MetaRight:'Win',AltLeft:'Alt',AltRight:'Alt',ShiftLeft:'Shift',ShiftRight:'Shift',CapsLock:'Caps',ContextMenu:'Menu',ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',AudioVolumeMute:'Mute',AudioVolumeDown:'Vol−',AudioVolumeUp:'Vol+',MediaPlayPause:'Play',NumpadDivide:'/',NumpadMultiply:'*',NumpadSubtract:'−',NumpadAdd:'+',NumpadDecimal:'.',NumpadEnter:'Enter' }
  function keyLabel(code: string) { return keyLabels[code] ?? code.replace(/^(Key|Digit|Numpad)/,'') }
  function eventUsage(code: string) { if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3)-65+2; if (/^Digit[0-9]$/.test(code)) return code==='Digit0'?37:Number(code.slice(5))+27; const usage = codeUsages[code]; return usage === undefined ? undefined : usage >= 224 ? usage - 101 : usage - 2 }
  onMount(() => {
    void import('$lib/zmk/studio-panel.svelte').then(({ default: Panel }) => {
      StudioPanel = Panel
    }).catch(() => {
      studioStatus = 'ZMK Studio could not load. Refresh the configurator and try again.'
    })
    demoPreview=new URLSearchParams(window.location.search).get('demo')==='true'
    try { const saved = JSON.parse(localStorage.getItem('keyspensory-gui') || '{}'); design = saved.design ?? true; brightness = saved.brightness ?? 70; lightingEffect = saved.effect ?? 'Static'; color = saved.color ?? '#a78bfa'; sleepEnabled = saved.sleepEnabled ?? true; sleepMinutes = saved.sleepMinutes ?? 5; deepSleepEnabled = saved.deepSleepEnabled ?? true; deepSleepMinutes = saved.deepSleepMinutes ?? 30; if (Array.isArray(saved.indicators)) indicators = indicators.map(item => { const stored = saved.indicators.find((v: {id?: string}) => v.id === item.id); return stored ? { ...item, enabled: typeof stored.enabled === 'boolean' ? stored.enabled : item.enabled, linked: typeof stored.linked === 'boolean' ? stored.linked : item.linked, color: /^#[0-9a-f]{6}$/i.test(stored.color) ? stored.color : item.color, brightness: Number.isFinite(stored.brightness) ? Math.max(0, Math.min(100, stored.brightness)) : item.brightness } : item }) } catch {}
    try { const saved=JSON.parse(localStorage.getItem('keyspensory-gui') || '{}'); if(Array.isArray(saved.combos) && saved.combos.length) combos=saved.combos; if(Array.isArray(saved.macros) && saved.macros.length) macros=saved.macros } catch {}
    try { const saved=JSON.parse(localStorage.getItem('keyspensory-gui') || '{}'); if(saved.advancedPair) advancedPair=saved.advancedPair; if(Array.isArray(saved.dks) && saved.dks.length===4) dks=saved.dks } catch {}
    ready = true
  })
  $effect(() => { if (ready) localStorage.setItem('keyspensory-gui', JSON.stringify({design,brightness,effect:lightingEffect,color,sleepEnabled,sleepMinutes,deepSleepEnabled,deepSleepMinutes,indicators,combos,macros,advancedPair,dks})) })
  function keydown(e: KeyboardEvent) {
    if (['actuation','gamepad'].includes(tab) && actuationView==='calibration' && calibrationStep===2 && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault(); const usage=eventUsage(e.code); if(usage===undefined)return;
      const keys=calibrationLayout.displayKeys.filter(({key})=>testerKeymap.keymap.current?.[0]?.[key]===usage).map(({key})=>key);
      calibrationPressed=[...new Set([...calibrationPressed,...keys])]; calibrationHeld=[...new Set([...calibrationHeld,...keys])]; return;
    }
 if(tab !== 'tester' || testMatrix || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return; e.preventDefault(); const usage=eventUsage(e.code);  const key=e.code; tested=[...new Set([...tested,key])]; active=[...new Set([...active,key])] }
  function keyup(e: KeyboardEvent) { const usage=eventUsage(e.code); calibrationHeld=calibrationHeld.filter(key=>testerKeymap.keymap.current?.[0]?.[key]!==usage); active=active.filter(key=>key!==e.code) }
  async function importDefinition(event: Event) { const file=(event.target as HTMLInputElement).files?.[0]; if(!file)return; try { const text=await file.text(); const json=JSON.parse(text); if(!json.name || !json.vendorId || !json.productId || !json.layouts) throw Error('Expected name, vendorId, productId and layouts'); definition=JSON.stringify(json,null,2); definitionStatus=`${json.name} · valid preview definition` } catch(e) { definitionStatus=`Import failed: ${e instanceof Error ? e.message : String(e)}` } }
</script>

<svelte:head><title>Keyspensory · Design lab</title></svelte:head>
<svelte:window onkeydown={keydown} onkeyup={keyup} onblur={() => {active=[];calibrationHeld=[]}} />
{#if hmkKeyboard}
  <div class="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
    <span class="text-sm font-medium">{hmkKeyboard.metadata.name} · HMK{hmkKeyboard.demo ? ' · Sample' : ''}</span>
    {#if hmkKeyboard.demo}
      <Button size="sm" variant="outline" onclick={()=>{hmkKeyboard=null;sampleBoard=''}}>Back to board selector</Button>
    {:else}
      <Button size="sm" variant="outline" onclick={()=>hmkKeyboard?.disconnect()}>Disconnect and choose a board</Button>
    {/if}
  </div>
  {#key hmkKeyboard.id}<Configurator keyboard={hmkKeyboard}/>{/key}
{:else}
<Dialog.Root bind:open={connectDialog}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Connect a keyboard</Dialog.Title>
      <Dialog.Description>Choose the interface your keyboard uses for configuration.</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-2">
      <Button variant="outline" onclick={connectHid}>USB HID · VIA or HMK</Button>
      <Button variant="outline" disabled={!studioEditor || studioConnecting} onclick={()=>connectStudio('usb')}>USB serial · ZMK Studio</Button>
      <Button variant="outline" disabled={!studioEditor || studioConnecting} onclick={()=>connectStudio('bluetooth')}>Bluetooth · ZMK Studio</Button>
    </div>
  </Dialog.Content>
</Dialog.Root>
<Sidebar.Provider>
  <Sidebar.Root collapsible="icon">
    <Sidebar.Header>
      <div class="flex items-center gap-3 px-2 py-3"><KeyboardIcon class="size-8"/><div class="truncate"><strong>Keyspensory</strong><p class="text-xs text-muted-foreground">Keyboard configurator</p></div></div>
      <label class="px-2 text-xs text-muted-foreground" for="connected-board">Connected board</label>
      <select id="connected-board" class="control" value={sampleBoard || (studioSelected ? studioBoardId : selectedBoard)} onchange={e=>selectBoard(e.currentTarget.value)}>
        <option value="" disabled={(!selectedSample && !studioSelected) || !!selectedBoard}>Select a connected board</option>
        {#each connectedBoards as board}<option value={board.id}>{board.name}</option>{/each}
        {#if studioName}<option value={studioBoardId}>{studioName} · ZMK Studio</option>{/if}
        <optgroup label="Samples and simulations">{#each samples as board}<option value={board.id}>{board.name}</option>{/each}</optgroup>
      </select>
      <Button variant="outline" size="sm" onclick={()=>connectDialog=true}>Connect new device</Button>
    </Sidebar.Header>
    <Sidebar.Content><Sidebar.Group><Sidebar.GroupLabel>Configurator</Sidebar.GroupLabel><Sidebar.Menu>
      {#each navigation.filter(n=>n.id==='custom' ? (liveBoardSelected && viaCustom) || viaSampleSelected : studioSelected||sampleBoard==='sample-zmk'?false:viaSampleSelected?['keymap','settings'].includes(n.id)||(n.id==='design'&&design):liveBoardSelected?['keymap','settings'].includes(n.id)||(n.id==='lighting'&&viaLighting)||(n.id==='design'&&design):!demoPreview&&!testBoardSelected?['keymap','settings'].includes(n.id)||(n.id==='design'&&design):(n.id !== 'design' || design) && (n.id !== 'bluetooth' || current.bluetooth) && (n.id !== 'lighting' || current.lighting) && (!['actuation','gamepad'].includes(n.id) || ['hall-effect','ec'].includes(current.sensor))) as item}<Sidebar.MenuItem><Sidebar.MenuButton isActive={tab===item.id} onclick={()=>tab=item.id}><item.icon/><span>{item.label}</span></Sidebar.MenuButton></Sidebar.MenuItem>{/each}
      {#if testBoardSelected}
        <Sidebar.MenuItem><Sidebar.MenuButton isActive={tab==='connection'} onclick={()=>tab='connection'}><BluetoothIcon/><span>Connection</span></Sidebar.MenuButton></Sidebar.MenuItem>
      {/if}
      {#if studioSelected || sampleBoard === 'sample-zmk'}
        <Sidebar.MenuItem><Sidebar.MenuButton isActive={tab==='studio'} onclick={()=>tab='studio'}><KeyboardIcon/><span>ZMK Studio</span></Sidebar.MenuButton></Sidebar.MenuItem>
      {/if}
      {#if showBuildFirmware}
        <Sidebar.MenuItem><Sidebar.MenuButton isActive={tab==='build'} onclick={()=>tab='build'}><PackageIcon/><span>Build firmware</span></Sidebar.MenuButton></Sidebar.MenuItem>
      {/if}
    </Sidebar.Menu></Sidebar.Group></Sidebar.Content>
    <Sidebar.Footer><div class="px-2 py-3 text-xs text-muted-foreground">{selectedSample ? 'Sample board · simulation' : studioSelected ? studioName+' connected' : hardwareConnected ? hardwareName+' connected' : 'No board connected'}<br/>Built on HMKconf · GPL-3.0</div></Sidebar.Footer>
    <Sidebar.Rail/>
  </Sidebar.Root>
  <Sidebar.Inset>
    <header class="flex h-14 shrink-0 items-center gap-4 border-b px-4"><Sidebar.Trigger/><Sidebar.Separator orientation="vertical" class="h-4"/><span class="text-sm font-medium">{selectedSample ? selectedSample.name : studioSelected ? studioName : hardwareConnected ? hardwareName : 'No board connected'}</span><span class="rounded-md border px-2 py-1 text-xs text-muted-foreground">{selectedSample ? 'Simulation' : studioSelected ? 'ZMK Studio' : hardwareConnected ? 'VIA' : 'USB'}</span><div class="flex-1"></div><span class="text-xs text-muted-foreground">{studioSelected ? 'Connected · save changes in Studio' : liveBoardSelected ? 'Connected · edits save to hardware' : 'Preview · changes stay in this browser'}</span><LanguageSelect/><ThemeSwitcher/></header>
    <main class="flex min-h-0 flex-1 flex-col">
      <div hidden={!!selectedSample || tab === 'studio' || showKeymapInstructions} class:contents={!selectedSample && tab !== 'studio' && !showKeymapInstructions && !centerViaPanel} class:flex={centerViaPanel} class:flex-1={centerViaPanel}>
        <ViaDeviceProbe bind:this={deviceConnection} onDevices={(boards,selected)=>{connectedBoards=boards;selectedBoard=selected}} view={tab} onHmk={openHmk} onLighting={ready=>viaLighting=ready} onCustom={ready=>viaCustom=ready} onConnected={(value,name)=>{hardwareConnected=value;if(name)hardwareName=name;if(value){sampleBoard='';studioSelected=false;tab='keymap';section='Keymap'}}}/>
      </div>
      {#if viaSampleSelected}
        <ViaDeviceProbe sample view={tab}/>
      {/if}
      <div hidden={!showBuildFirmware || tab !== 'build'}>
        <FirmwareBuildPanel/>
      </div>
      {#if studioConnecting || studioStatus}
        <p class="border-b px-4 py-3 text-sm" role="status">{studioConnecting ? 'Checking the Studio connection…' : studioStatus}</p>
      {/if}
      {#if StudioPanel}
        <div hidden={!studioSelected || tab !== 'studio'}>
          <StudioPanel inlineLayout bind:this={studioEditor} onConnected={showStudio} onDisconnected={clearStudio}
            onConnectError={error=>studioStatus=error}
            canAutoConnect={()=>!hardwareConnected && !hmkKeyboard && !selectedSample && !connectDialog && !studioConnecting && tab !== 'build' && tab !== 'settings'}/>
        </div>
      {/if}
      {#if showKeymapInstructions}
        <section class="grid flex-1 place-items-center p-6 text-center">
          <p class="text-sm text-muted-foreground">Connect a keyboard using the board selector in the upper-left sidebar to view its keymap.</p>
        </section>
      {:else if tab === 'studio'}
        {#if sampleBoard === 'sample-zmk' && StudioPanel}<StudioPanel inlineLayout sample/>{/if}
      {:else if tab === 'settings' && (liveBoardSelected || viaSampleSelected || (!selectedSample && !studioSelected && !demoPreview))}
        <section class="panel" aria-labelledby="via-preferences-title">
          <h1 id="via-preferences-title">Settings</h1>
          <div class="card">
            <div class="setting"><label for="via-show-design">Show Design tab</label><Switch id="via-show-design" bind:checked={design}/></div>
          </div>
        </section>
      {:else if testBoardSelected && tab === 'connection'}
        <section class="panel" aria-labelledby="test-connection-title">
          <h1 id="test-connection-title">Connection</h1>
          <p class="muted">Preview output switching for the nRF54LM20A keyboard and receiver.</p>
          <div class="card">
            <label for="test-output-mode">Simulated output</label>
            <select id="test-output-mode" class="control" bind:value={testOutput}>
              {#each outputModes as mode}<option value={mode}>{mode}</option>{/each}
            </select>
            <p class="text-sm" role="status">Active in simulation · {testOutput}</p>
            <Button class="justify-self-start" variant="outline" onclick={()=>tab='build'}>Open build plan</Button>
          </div>
        </section>
      {:else if tab !== 'build' && (tab !== 'design' || !!selectedSample || demoPreview) && !studioSelected && !liveBoardSelected && !viaSampleSelected && (demoPreview || testBoardSelected)}

      {#if tab==='keymap'}
        <div class="flex gap-1 border-b px-4 py-2">{#each sections as name}<Button variant={section===name?'secondary':'ghost'} size="sm" onclick={()=>{section=name;editorIndex=0}}>{name}</Button>{/each}</div>
        {#if current.id==='ec23u'}<EC23UDefinitionPreview area={section}/>{:else if section==='Keymap'}<RemapTab bluetooth={current.bluetooth} customBindings={[...combos.map((c,i)=>({id:'combo-'+i,label:c.name,kind:'Combo'})),...macros.map((m,i)=>({id:'macro-'+i,label:m.name,kind:'Macro'}))]}/>
        {:else if section==='Advanced keys' && ['hall-effect','ec'].includes(current.sensor)}
          <div class="flex h-[300px] shrink-0 flex-col border-b"><RemapKeyboard/></div>
          <div class="panel"><h1>Advanced keys</h1><p class="muted">Analog behaviors for Hall effect and EC keyboards. Availability will follow the connected firmware’s capabilities.</p><div class="mt-5 flex gap-2">{#each ['Rappy Snappy','Snappy Tappy (SOCD)','Dynamic keystroke (DKS)'] as mode}<Button size="sm" variant={advancedMode===mode?'secondary':'outline'} onclick={()=>advancedMode=mode}>{mode}</Button>{/each}</div>
            <div class="card"><h2>{advancedMode}</h2>
              {#if advancedMode==='Dynamic keystroke (DKS)'}<p class="muted">Assign key-down and key-up actions at press and release stages.</p><div class="grid gap-5">{#each dks as stage,i}<div class="rounded-md border p-4"><h3 class="mb-3 text-sm font-medium">{stage.point}</h3><div class="grid grid-cols-3 gap-3"><label>Travel (mm)<input class="control" type="number" min="0" max="4" step="0.1" bind:value={stage.depth}/></label><label>Action<select class="control" bind:value={stage.action}><option>Key down</option><option>Key up</option><option>Tap</option><option>None</option></select></label><label>Keycode<input class="control" bind:value={stage.key} placeholder="W"/></label></div></div>{/each}</div>
              {:else}<div class="setting"><label for="advanced-enabled">Enable behavior</label><Switch id="advanced-enabled" bind:checked={advancedPair.enabled}/></div><p class="muted">{advancedMode==='Rappy Snappy'?'Compare two keys’ travel: the deeper key takes priority.':'Resolve opposing key inputs using the selected priority rule.'}</p><div class="grid grid-cols-2 gap-4"><label>First key<input class="control" bind:value={advancedPair.first}/></label><label>Second key<input class="control" bind:value={advancedPair.second}/></label></div>{#if advancedMode==='Snappy Tappy (SOCD)'}<label>Priority rule<select class="control" bind:value={advancedPair.resolution}><option>Last input wins</option><option>First input wins</option><option>Neutral (cancel both)</option><option>First key priority</option><option>Second key priority</option></select></label>{/if}{#if advancedPair.first===advancedPair.second}<p class="text-sm text-destructive">Choose two different keys.</p>{/if}
              {/if}
            </div><p class="muted">GUI preview · no advanced behavior is running on the keyboard. Travel ranges and supported actions will come from device capabilities.</p>
          </div>
        {:else if section==='Combos' || section==='Macros'}
          <div class="flex h-[300px] shrink-0 flex-col border-b"><RemapKeyboard/></div>
          <div class="panel"><div class="flex items-center justify-between"><div><h1>{section}</h1><p class="muted">{section==='Combos'?'Press multiple keys together to trigger an output.':'Create a sequence to assign from the Keymap keycode picker.'}</p></div><Button variant="outline" onclick={()=>{ if(section==='Combos'){ combos.push({name:`Combo ${combos.length+1}`,keys:'',output:'',timeout:50,enabled:true});editorIndex=combos.length-1 }else{macros.push({name:`Macro ${macros.length+1}`,text:'',delay:20});editorIndex=macros.length-1} }}>Add {section==='Combos'?'combo':'macro'}</Button></div>
            <div class="mt-5 flex flex-wrap gap-2">{#each section==='Combos'?combos:macros as item,i}<Button size="sm" variant={editorIndex===i?'secondary':'outline'} onclick={()=>editorIndex=i}>{item.name}</Button>{/each}</div>
            {#if section==='Combos' && combos[editorIndex]}<div class="card"><label>Name<input class="control" bind:value={combos[editorIndex].name}/></label><div class="setting"><label for="combo-enabled">Enable combo</label><Switch id="combo-enabled" bind:checked={combos[editorIndex].enabled}/></div><label>Trigger keys<input class="control" placeholder="Q + W" bind:value={combos[editorIndex].keys}/></label><label>Output keycode or macro<input class="control" placeholder="Escape or Macro 1" bind:value={combos[editorIndex].output}/></label><label>Detection window (ms)<input class="control" type="number" min="1" max="1000" bind:value={combos[editorIndex].timeout}/></label></div>
            {:else if macros[editorIndex]}<div class="card"><label>Name<input class="control" bind:value={macros[editorIndex].name}/></label><label>Text sequence<textarea class="control" rows="4" placeholder="Text to type when this macro is triggered" bind:value={macros[editorIndex].text}></textarea></label><label>Delay between keys (ms)<input class="control" type="number" min="0" max="10000" bind:value={macros[editorIndex].delay}/></label></div>{/if}
            <p class="muted">GUI preview only. Definitions are available in the Keymap picker; firmware support and device writes will be connected later.</p>
          </div>

        {:else}
        {#if section==='Layout'}<div class="flex h-[340px] shrink-0 flex-col border-b"><RemapKeyboard/></div>{/if}
        <div class="panel"><h1>{section}</h1><p class="muted">{section==='Layout'?'Physical layout options supplied by the keyboard definition.':'Lighting controls appear when supported by the connected keyboard.'}</p><div class="card">
          {#if section==='Layout'}
            {#each layoutLabels as label, i}
              {#if typeof label === 'string'}<div class="setting"><label for={'layout-option-'+i}>{label}</label><Switch id={'layout-option-'+i} bind:checked={() => layoutState.current.layoutOptions[i] === 1, (value) => layoutState.current.layoutOptions[i] = value ? 1 : 0}/></div>
              {:else}<label for={'layout-option-'+i}>{label[0]}<select id={'layout-option-'+i} class="control" bind:value={() => layoutState.current.layoutOptions[i], (value) => layoutState.current.layoutOptions[i] = Number(value)}>{#each label.slice(1) as option, j}<option value={j}>{option}</option>{/each}</select></label>{/if}
            {/each}
          {/if}
        </div>
        </div>{/if}
      {:else if current.id==='ec23u' && ['lighting','gamepad','settings'].includes(tab)}<EC23UDefinitionPreview area={tab==='lighting'?'Lighting':tab==='gamepad'?'Gamepad':'Settings'}/>
      {:else if tab==='lighting'}<div class="panel"><h1>Lighting</h1><p class="muted">Configure the main effect and individual indicators.</p><div class="card"><label>Effect<select class="control" bind:value={lightingEffect}><option>Static</option><option>Breathing</option><option>Rainbow</option><option>Off</option></select></label><label>Brightness · {brightness}%<input class="w-full" type="range" min="0" max="100" bind:value={brightness}/></label><label class="setting">Color<input type="color" bind:value={color}/></label>
        </div>

          <div class="card"><h2>Indicators</h2><p class="muted">Configure each indicator independently, or let it follow the main lighting effect.</p>
            {#each indicators as indicator (indicator.id)}
              <div class="indicator-controls">
                <div class="setting"><h3 class="text-sm font-medium">{indicator.name}</h3><div class="flex items-center gap-3"><label for={'indicator-enable-'+indicator.id}>Enable</label><Switch id={'indicator-enable-'+indicator.id} bind:checked={indicator.enabled}/></div></div>
                <fieldset disabled={!indicator.enabled} class="mt-5 grid gap-5 disabled:opacity-40">
                  <div class="setting"><label for={'indicator-link-'+indicator.id}>Link with main effect</label><Switch id={'indicator-link-'+indicator.id} bind:checked={indicator.linked}/></div>
                  {#if indicator.linked}<p class="muted">Follows the main effect, color, and brightness.</p>
                  {:else}<label class="setting" for={'indicator-color-'+indicator.id}><span>Color <span class="ml-2 font-mono text-xs text-muted-foreground">{indicator.color.toUpperCase()}</span></span><input id={'indicator-color-'+indicator.id} type="color" bind:value={indicator.color}/></label>
                    <label for={'indicator-brightness-'+indicator.id}>Brightness · {indicator.brightness}%<input id={'indicator-brightness-'+indicator.id} class="w-full" type="range" min="0" max="100" bind:value={indicator.brightness}/></label>
          
                  {/if}
                </fieldset>
              </div>
            {/each}
          </div><p class="muted">Indicator names are examples for this preview. Connected boards will supply the available indicators and controls.</p>
</div>
      {:else if tab==='gamepad'}
        <div class="border-b px-4 py-3"><h1 class="text-sm font-medium">Gamepad mode</h1><p class="muted">Map analog sticks, triggers, and controller buttons; adjust the analog response below. Preview only · controller output requires compatible firmware.</p></div>
        <div class="flex gap-1 border-b px-4 py-2"><Button size="sm" variant={gamepadView==='configure'?'secondary':'ghost'} onclick={()=>gamepadView='configure'}>Configure</Button><Button size="sm" variant={gamepadView==='tester'?'secondary':'ghost'} onclick={()=>gamepadView='tester'}>Tester</Button></div>
        {#if gamepadView==='tester'}<GamepadTester/>{:else}<GamepadTab/>{/if}
      {:else if tab==='actuation' && current.id==='ec23u'}<EC23UDefinitionPreview area="Actuation"/>
      {:else if tab==='actuation'}
        <div class="flex gap-1 border-b px-4 py-2"><Button size="sm" variant={actuationView==='settings'?'secondary':'ghost'} onclick={()=>{actuationView='settings';calibrationStep=0}}>Actuation</Button><Button size="sm" variant={actuationView==='calibration'?'secondary':'ghost'} onclick={()=>actuationView='calibration'}>Calibration</Button></div>
        {#if actuationView==='settings'}<PerformanceTab/>
        {:else}<div class="flex h-[300px] shrink-0 flex-col border-b">
          <KeyboardEditorKeyboard>{#snippet keyGenerator(key)}<div class="relative h-full w-full"><KeycodeButton keycode={testerKeymap.keymap.current?.[0]?.[key] ?? 0} tabindex={-1} class={calibrationHeld.includes(key)?'bg-primary text-primary-foreground':calibrationPressed.includes(key)?'bg-secondary ring-2 ring-primary':''}/>{#if calibrationStep>=2}<span class="pointer-events-none absolute bottom-0 left-0 right-0 text-center text-[8px] text-muted-foreground">ADC: —</span>{/if}</div>{/snippet}</KeyboardEditorKeyboard>
          </div>
          <div class="panel"><h1>Sensor calibration</h1><p class="muted">Establish each key’s resting noise floor and full-press endpoint.</p>
            <div class="mt-5 flex flex-wrap gap-3 text-sm">{#each ['Prepare','Resting baseline','Full press','Review'] as step,i}<span class="rounded-md border px-3 py-2" class:bg-secondary={calibrationStep===i}>{i+1}. {step}</span>{/each}</div>
            <div class="card">
              {#if calibrationStep===0}<h2>Prepare your keyboard</h2><p class="text-sm">Place the keyboard on a stable surface and release every key. Enter calibration mode to capture the resting sensor noise, then press each key fully to establish its bottom-out endpoint.</p><p class="muted">GUI walkthrough · no keyboard connected. No sensor readings or calibration values will be recorded.</p><Button onclick={()=>{calibrationPressed=[];calibrationHeld=[];calibrationStep=1}}>Enter calibration mode · preview</Button>
              {:else if calibrationStep===1}<h2>Capture resting noise floor</h2><p class="text-sm">Leave all keys untouched. The connected keyboard will sample the resting sensor values and noise range for each key.</p><dl><div><dt>Sensor stream</dt><dd>Not connected</dd></div><div><dt>Resting baseline</dt><dd>Awaiting readings</dd></div><div><dt>Noise range</dt><dd>Awaiting readings</dd></div></dl><Button onclick={()=>calibrationStep=2}>Preview full-press step</Button>
              {:else if calibrationStep===2}<h2>Capture full press</h2><p class="text-sm">Press every key firmly, then release. Solid highlights show keys held now; outlined highlights show keys already pressed. Browser events preview the highlights; a press does not confirm bottom-out.</p><div class="flex flex-wrap gap-4 text-xs"><span>● Held now: {calibrationHeld.length}</span><span>◉ Previously pressed: {calibrationPressed.length}</span><span>— ADC: awaiting sensor data</span></div><dl><div><dt>Keys pressed</dt><dd>{calibrationPressed.length} / {calibrationLayout.displayKeys.length}</dd></div><div><dt>Validated bottom-out captures</dt><dd>0 · hardware required</dd></div></dl><div class="max-h-52 overflow-auto"><table class="w-full text-left text-sm"><thead><tr><th class="py-2">Key position</th><th>Status</th><th>Bottom-out reading</th></tr></thead><tbody>{#each calibrationPressed as key}<tr class="border-t"><td class="py-2">Key {key}</td><td>{calibrationHeld.includes(key)?'Pressed now':'Previously pressed'}</td><td>Awaiting sensor data</td></tr>{/each}</tbody></table></div><Button variant="outline" onclick={()=>{calibrationPressed=[];calibrationHeld=[]}}>Reset press history</Button><Button onclick={()=>calibrationStep=3}>Preview review step</Button>
              {:else}<h2>Review calibration</h2><p class="text-sm">No calibration data has been captured in this preview. With supported hardware, this step will show per-key noise floors, full-press endpoints, and any keys that need another pass.</p><Button disabled>Finish calibration · sensor data required</Button>{/if}
              {#if calibrationStep>0}<div class="flex gap-2"><Button variant="outline" onclick={()=>calibrationStep=Math.max(0,calibrationStep-1)}>Back</Button><Button variant="ghost" onclick={()=>{calibrationStep=0;actuationView='settings'}}>Exit calibration</Button></div>{/if}
            </div>
          </div>
        {/if}
      {:else if tab==='tester'}<div class="panel"><div class="flex items-center justify-between"><div><h1>Matrix tester</h1><p class="muted">Press keys to see which keys are actuated.</p></div><Button variant="outline" onclick={()=>{tested=[];active=[]}}>Clear</Button></div><div class="setting mt-6 rounded-lg border p-4"><div><label for="test-matrix">Test matrix</label><p class="muted">{testMatrix ? 'Raw switch positions, independent of assigned keycodes.' : 'Test actuated keys using keyboard events.'}</p></div><Switch id="test-matrix" bind:checked={testMatrix} onCheckedChange={() => { tested=[]; active=[] }}/></div>
        {#if testMatrix}<p class="muted" role="status">Waiting for a hardware connection with matrix reporting. Browser key events are not used in matrix mode.</p>{/if}
        <div class="mt-10 flex h-[340px] flex-col rounded-lg border bg-muted/20">
          {#if testMatrix}<KeyboardEditorKeyboard>
            {#snippet keyGenerator(key)}
              {@const usage = testerKeymap.keymap.current?.[0]?.[key] ?? 0}
              <KeycodeButton keycode={usage} tabindex={-1} aria-label={'Test key '+key}
                class={active.includes(String(usage)) ? 'bg-primary text-primary-foreground' : tested.includes(String(usage)) ? 'bg-secondary ring-2 ring-primary' : ''}/>
            {/snippet}
          </KeyboardEditorKeyboard>
          {:else}<div class="full-tester" aria-label="108-key keyboard tester">{#each fullRows as row, rowIndex}<div class="full-row" class:home-row={rowIndex===3} class:shift-row={rowIndex===4} class:bottom-row={rowIndex===5}>{#each row as code}<div class="full-key" class:space-key={code==='Space'} class:active-key={active.includes(code)} class:tested-key={tested.includes(code)} aria-label={code}>{keyLabel(code)}</div>{/each}</div>{/each}</div>{/if}
        </div><p class="muted">{testMatrix ? 'Matrix mode · hardware reporting not connected' : `${tested.length} distinct keys detected · actuated-key mode`} · {testMatrix ? 'follows the layout selected in Keymap' : '108-key keyboard'}.</p></div>
      {:else if tab==='bluetooth'}<div class="panel"><h1>Bluetooth</h1><p class="muted">Wireless power and sleep preferences for {current.name}.</p>
        <div class="card"><h2>Power management</h2>
          <div class="setting"><div><label for="sleep-enabled">Sleep</label><p class="muted">Enter low-power mode after inactivity.</p></div><Switch id="sleep-enabled" bind:checked={sleepEnabled}/></div>
          {#if sleepEnabled}<label for="sleep-time">Sleep after<select id="sleep-time" class="control" bind:value={sleepMinutes}><option value={1}>1 minute</option><option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={15}>15 minutes</option><option value={30}>30 minutes</option></select></label>{/if}
          <div class="setting"><div><label for="deep-sleep-enabled">Deep sleep</label><p class="muted">Enter a deeper power-saving state after inactivity.</p></div><Switch id="deep-sleep-enabled" bind:checked={deepSleepEnabled}/></div>
          {#if deepSleepEnabled}<label for="deep-sleep-time">Deep sleep after<select id="deep-sleep-time" class="control" bind:value={deepSleepMinutes}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={120}>2 hours</option></select></label>{/if}
          {#if sleepEnabled && deepSleepEnabled && deepSleepMinutes <= sleepMinutes}<p class="text-sm text-destructive" role="status">Set deep sleep later than sleep.</p>{/if}
        </div><p class="muted">Preview preferences save automatically in this browser. Available controls and timing ranges will follow the board’s reported capabilities; hardware support is not connected yet.</p></div>
      {:else if tab==='design'}<div class="panel"><h1>Design</h1><p class="muted">Import a VIA JSON keyboard definition for inspection.</p><div class="card"><label>Keyboard definition<input type="file" accept=".json,application/json" onchange={importDefinition}/></label><p class="text-sm" role="status">{definitionStatus}</p>{#if definition}<pre class="overflow-auto rounded-md bg-muted p-4 text-xs">{definition}</pre>{/if}</div></div>
      {:else}<div class="flex gap-1 border-b px-4 py-2"><Button size="sm" variant={settingsView==='info'?'secondary':'ghost'} onclick={()=>settingsView='info'}>Information</Button><Button size="sm" variant={settingsView==='ota'?'secondary':'ghost'} onclick={()=>settingsView='ota'}>Firmware / OTA</Button></div>{#if settingsView==='ota'}<FirmwarePanel/>{:else}<div class="panel"><h1>Settings</h1><p class="muted">Device information and configurator preferences.</p><div class="card"><h2>Device information</h2><dl><div><dt>Keyboard</dt><dd>{current.name}</dd></div><div><dt>Protocol</dt><dd>{current.protocol}</dd></div><div><dt>Connection</dt><dd>Simulated · GUI preview</dd></div><div><dt>Firmware / USB identifiers</dt><dd>Available after connection</dd></div><div><dt>Saving</dt><dd>Automatic · hardware writes pending integration</dd></div></dl></div><div class="card"><h2>Preferences</h2><label class="setting"><span>Show Design tab<span class="muted block">Import VIA JSON definitions</span></span><input type="checkbox" bind:checked={design}/></label></div><p class="muted">Capability visibility is simulated for this preview. Real device detection will determine available features.</p></div>{/if}{/if}
      {/if}
    </main>
  </Sidebar.Inset>
</Sidebar.Provider>
{/if}
<style>
  .full-tester { padding:16px; margin:auto 0; overflow-x:auto } .full-row { display:flex; gap:4px; margin:5px 0; min-width:700px } .full-key { flex:1; min-width:0; height:38px; border:1px solid var(--border); border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:9px; background:var(--background) } .full-row.home-row .full-key:nth-child(13) { margin-right:14.5% } .full-row.shift-row .full-key:nth-child(12) { flex:2 } .full-row.bottom-row .space-key { flex:6 } .full-key.tested-key { background:var(--secondary); outline:1px solid var(--primary) } .full-key.active-key { background:var(--primary); color:var(--primary-foreground) }
  .indicator-controls { border-top:1px solid var(--border); padding-top:20px }
  .control { width:100%; border:1px solid var(--border); border-radius:6px; padding:8px 10px; background:var(--background); color:var(--foreground); font-size:14px }
  .panel {padding:32px;max-width:1200px;width:100%;margin:0 auto} h1 {font-size:24px;font-weight:600;letter-spacing:-.5px} h2 {font-size:15px;font-weight:600} .muted {font-size:13px;color:var(--muted-foreground);margin-top:8px} .card {border:1px solid var(--border);border-radius:8px;padding:24px;margin-top:24px;display:grid;gap:22px;max-width:760px} label {display:grid;gap:10px;font-size:14px}.setting {display:flex;align-items:center;justify-content:space-between} dl>div {display:flex;justify-content:space-between;gap:24px;padding:12px 0;border-bottom:1px solid var(--border);font-size:14px}dt{color:var(--muted-foreground)}
</style>
