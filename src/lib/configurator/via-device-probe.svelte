<script lang="ts">
  import { language, t } from '$lib/i18n'
 import { Tabs } from 'bits-ui'
 import { getLightingDefinition, KeycodeType } from '@the-via/reader'
 import { FileJsonIcon, UploadIcon, XIcon } from '@lucide/svelte'
 import { onMount } from 'svelte'
 import { Button } from '$lib/components/ui/button'
 import { ViaAdapter, findDefinition, isViaInterface, lookupDefinition, validateDefinition, type ViaDefinition } from '$lib/via/adapter'
 import { hmkHidFilter, isHmkInterface } from '$lib/keyboard/hmk-keyboard.svelte'
 import { SampleViaDevice, sampleViaDefinition } from '$lib/via/sample-device'
 import { parseViaMenus, legacyLightingMenus, isLightingMenu } from '$lib/via/custom-menus'
 import type { MatrixSource } from '$lib/workspace/test-layout'
 import ViaCustomControls from './via-custom-controls.svelte'
 import { LiveLighting } from '$lib/via/live-lighting'
 import ColorPicker from '$lib/via/color-picker.svelte'
 import LightingPreview from '$lib/via/lighting-preview.svelte'
 import KeymapLayers from '$lib/workspace/keymap-layers.svelte'
 import { viaKeyValue } from '$lib/workspace/key-values'
 import BasicKeyboardPicker from '$lib/via/basic-keyboard-picker.svelte'
 import { pickerRows } from '$lib/via/keycode-picker'
 import LayoutOptions from '$lib/workspace/layout-options.svelte'
 import { parseViaGeometry, visibleViaLayout, validateLayoutLabels, unpackLayout, updateLayoutWord } from '$lib/via/layout'
 import KeyCanvas from '$lib/workspace/key-canvas.svelte'
 import catalog from '$lib/via/generated/keycodes.json'
 import { getByteForCode } from '$lib/via/generated/parser.js'
 import * as Accordion from '$lib/components/ui/accordion'
 import definition from '$lib/keyboard/m6b-via.json'
 let {onConnected=()=>{},onDevices,onHmk=async()=>{},onLighting=()=>{},onCustom=()=>{},onBusy=()=>{},onMatrix=()=>{},onMessage=()=>{},sample=false,view='keymap'}:{onConnected?:(connected:boolean,name?:string)=>void;onDevices?:(devices:{id:string;name:string}[],selected:string)=>void;onHmk?:(device:HIDDevice)=>Promise<void>;onLighting?:(ready:boolean)=>void;onCustom?:(ready:boolean)=>void;onBusy?:(busy:boolean)=>void;onMatrix?:(source?:MatrixSource)=>void;onMessage?:(message:string)=>void;sample?:boolean;view?:string}=$props()
 let available=$state(false),busy=$state(false),identity=$state(''),status=$state('Checking WebHID…')
 let writingControl=$state(false)
 $effect(()=>onBusy(busy || writingControl))
 $effect(()=>{
   onLighting(connected && customMenus.some(isLightingMenu))
   onCustom(connected && customMenus.some(menu=>!isLightingMenu(menu)))
 })
 let loadedDefinition=$state.raw<ViaDefinition>(definition)
 const definitionStorageKey = 'keyspensory-via-definition'
 const libraryStorageKey = 'keyspensory-via-library'
 type SavedDefinition = { id: string; filename: string; definition: ViaDefinition }
 let savedDefinitions = $state.raw<SavedDefinition[]>([])
 let selectedDefinitionId = $state('')
 const imported = $derived(savedDefinitions.find(entry => entry.id === selectedDefinitionId)?.definition)

 function saveLibrary(entries: SavedDefinition[], selectedId: string) {
   localStorage.setItem(libraryStorageKey, JSON.stringify({ entries, selectedId }))
   savedDefinitions = entries
   selectedDefinitionId = selectedId
 }

 function updateLibrary(entries: SavedDefinition[], selectedId: string) {
   try {
     saveLibrary(entries, selectedId)
     importStatus = ''
   } catch {
     importError = true
     importStatus = 'Could not update the saved definitions in this browser.'
   }
 }

 function deleteDefinition(id: string) {
   const index = savedDefinitions.findIndex(entry => entry.id === id)
   if (index < 0) return
   const entries = savedDefinitions.filter(entry => entry.id !== id)
   const nextId = id === selectedDefinitionId ? (entries[index] ?? entries[index - 1])?.id ?? '' : selectedDefinitionId
   updateLibrary(entries, nextId)
 }

 function matchingDefinition(device: HIDDevice) {
   const matches = (definition: ViaDefinition) =>
     Number(definition.vendorId) === device.vendorId && Number(definition.productId) === device.productId
   return imported && matches(imported)
     ? imported
     : savedDefinitions.slice().reverse().find(entry => matches(entry.definition))?.definition
 }
 let importStatus = $state('')
 let importError = $state(false)
 let definitionInput = $state<HTMLInputElement>()

 function parseLocalDefinition(json: string): ViaDefinition {
   let candidate: ViaDefinition | null
   try {
     candidate = JSON.parse(json)
   } catch (error) {
     throw Error(`JSON syntax: ${error instanceof Error ? error.message : String(error)}`)
   }
   if (!candidate || typeof candidate.name !== 'string' || !candidate.name.trim()) {
     throw Error('name: expected a non-empty keyboard name.')
   }

   for (const field of ['vendorId', 'productId'] as const) {
     const id = candidate[field]
     if (!['number', 'string'].includes(typeof id) || !String(id).trim() ||
         !Number.isInteger(Number(id)) || Number(id) < 0 || Number(id) > 65535) {
       throw Error(`${field}: expected a USB ID from 0 to 65535, such as "0x1234".`)
     }
   }

   const { rows, cols } = candidate.matrix ?? {}
   for (const field of ['rows', 'cols'] as const) {
     const size = candidate.matrix?.[field]
     if (!Number.isInteger(size) || size < 1) throw Error(`matrix.${field}: expected a positive integer.`)
   }
   if (rows * cols > 1024) throw Error('matrix: expected at most 1024 positions.')
   if (!Array.isArray(candidate.layouts?.keymap)) throw Error('layouts.keymap: expected an array of rows.')
   validateLayoutLabels(candidate.layouts.labels ?? [])
   for (const [rowIndex, row] of candidate.layouts.keymap.entries()) {
     const path = `layouts.keymap[${rowIndex}]`
     if (rowIndex === 0 && row && typeof row === 'object' && !Array.isArray(row)) continue
     if (!Array.isArray(row)) throw Error(`${path}: expected an array.`)
     for (const [index, item] of row.entries()) {
       const location = `${path}[${index}]`
       if (typeof item !== 'string') {
         if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error(`${location}: expected a key or layout property object.`)
         for (const [field, value] of Object.entries(item)) {
           if (['x', 'y', 'w', 'h'].includes(field) && (typeof value !== 'number' || !Number.isFinite(value) ||
               (['w', 'h'].includes(field) && value <= 0))) {
             throw Error(`${location}.${field}: invalid key geometry.`)
           }
         }
       }
     }
   }
   const parsed = parseViaGeometry(candidate)
   const positions = [...parsed.keys, ...Object.values(parsed.optionKeys).flatMap(group => Object.values(group).flat())]
     .filter(key => !key.d && !(key.ei !== undefined && key.row === -1 && key.col === -1))
   if (positions.some(key => !Number.isInteger(key.row) || key.row < 0 || key.row >= rows ||
       !Number.isInteger(key.col) || key.col < 0 || key.col >= cols)) {
     throw Error(`layouts.keymap: expected a row,column coordinate inside the ${rows} × ${cols} matrix.`)
   }
   if (!positions.length || !Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) throw Error('layouts.keymap: expected at least one key.')
   return candidate
 }

 async function uploadDefinition(event: Event) {
   const input = event.currentTarget as HTMLInputElement
   const file = input.files?.[0]
   if (!file) return
   input.value = ''

   try {
     const json = await file.text()
     const candidate = parseLocalDefinition(json)
     const entry = { id: crypto.randomUUID(), filename: file.name, definition: candidate }
     saveLibrary([...savedDefinitions, entry], entry.id)
     importError = false
     importStatus = 'Definition saved in this browser.'
     if (connected && !busy && hid && Number(candidate.vendorId) === hid.vendorId &&
         Number(candidate.productId) === hid.productId) {
       await connect(hid)
     }
   } catch (error) {
     importError = true
     importStatus = `${file.name} — ${error instanceof Error ? error.message : 'Could not save the VIA definition.'}`
   }
 }
 let liveLighting:LiveLighting|undefined
 function liveColor(id:number,color:{hue:number;saturation:number},index?:number){if(!connected||!rgbReady)return;liveLighting?.update(`${id}:${index??''}`,[7,id,...(index===undefined?[]:[index]),color.hue,color.saturation])}
 let adapter=$state.raw<ViaAdapter|undefined>()
 let selectedKey=$state<number|null>(null), search=$state('')
 let hid:HIDDevice|undefined
 let authorized:HIDDevice[]=[]
 const deviceIds=new WeakMap<HIDDevice,string>();let nextDeviceId=0
 function deviceId(device:HIDDevice){let id=deviceIds.get(device);if(!id){id=String(++nextDeviceId);deviceIds.set(device,id)}return id}
 async function refreshDevices(){if(!onDevices)return;authorized=(await navigator.hid.getDevices()).filter(device=>isViaInterface(device)||isHmkInterface(device));onDevices(authorized.map(d=>({id:deviceId(d),name:d.productName||`USB ${d.vendorId.toString(16)}:${d.productId.toString(16)}`})),connected&&hid?deviceId(hid):'')}
 export async function openDevice(device:HIDDevice) {
   if (!isHmkInterface(device)) {
     await connect(device)
     return
   }
   busy = true
   try {
     await onHmk(device)
   } catch (error) {
     status = String(error)
     onMessage(status)
   } finally {
     busy = false
   }
 }
 export async function connectNew() {
   if (busy) return
   try {
     const [device] = await navigator.hid.requestDevice({
       filters: [{ usagePage: 0xff60, usage: 0x61 }, hmkHidFilter],
     })
     if (device) await openDevice(device)
   } catch (error) {
     status = String(error)
     onMessage(status)
   }
 }
 export async function selectDevice(id:string) {
   if (busy) return
   const device = authorized.find(item=>deviceId(item)===id)
   if (device) await openDevice(device)
 }
 let connected=$state(false),protocol=$state(0),layerCount=$state(0),layer=$state(0),keys=$state<number[]>([])
 const customMenus=$derived(protocol>=11?parseViaMenus(loadedDefinition.menus):legacyLightingMenus(loadedDefinition.lighting))
 let brightness=$state(0),rgbEffect=$state(0),speed=$state(0),hue=$state(0),saturation=$state(0)
 let macroCount=$state(0), expression=$state('')
 const keycodeSet=$derived(catalog[String(protocol) as keyof typeof catalog] ?? catalog['8'])
 const supportedCategories = $derived.by(() => {
   const definition = loadedDefinition
   const legacy = definition.lighting && getLightingDefinition(definition.lighting)?.keycodes
   const modules = Array.isArray(definition.keycodes) ? definition.keycodes : []
   return keycodeSet.categories.filter(group => {
     if (group.id === 'wt_lighting') return modules.includes(group.id) || legacy === KeycodeType.WT
     if (group.id === 'qmk_lighting') return modules.includes(group.id) || legacy === KeycodeType.QMK
     return true
   })
 })
 const categories = $derived.by(() => {
   const customKeys = (loadedDefinition.customKeycodes ?? []).map((key, i) => ({
     name: key.shortName ?? key.name, title: key.title ?? key.name,
     code: `CUSTOM(${i})`, value: keycodeSet.dict._QK_KB + i,
   }))
   return supportedCategories.map(group => {
     const items = group.id === 'custom' ? customKeys : group.id === 'macro'
       ? group.keycodes.filter(key => !key.code.startsWith('MACRO(') || Number(key.code.match(/\d+/)?.[0]) < macroCount)
       : group.keycodes
     const label = group.id === 'wt_lighting' ? 'WT lighting' : group.id === 'qmk_lighting' ? 'QMK lighting' : group.label
     return { id: group.id, label, rows: group.id === 'basic' ? [] : pickerRows(group.id, items, search, $t) }
   }).filter(group => group.id === 'basic' || group.rows.length)
 })
 async function assignExpression(){try{const value=/^0x[0-9a-f]{1,4}$/i.test(expression)?parseInt(expression,16):getByteForCode(expression,keycodeSet.dict);if(!Number.isInteger(value))throw Error('Unknown keycode expression');await assign(value)}catch(e){status=String(e)}}
 let hue2=$state(0),saturation2=$state(0),ledSelection=$state<number|null>(null),ledColors=$state<{hue:number;saturation:number}[]>([])
 async function writeLED(index:number){busy=true;try{await liveLighting?.flush();const color=ledColors[index];await command([7,23,index,Number(color.hue),Number(color.saturation)]);await command([9]);const read=await command([8,23,index]);if(read[3]!==Number(color.hue)||read[4]!==Number(color.saturation))throw Error('LED color readback mismatch');status='Per-key color saved and verified.'}catch(e){status=String(e)}finally{busy=false}}
 let rgbReady=$state(false)
 const effects=['All Off','Solid Color 1','Custom Colors','Gradient Vertical Color 1/2','Raindrops Color 1/2','Cycle All','Cycle Horizontal','Cycle Vertical','Jellybean Raindrops','Radial All Hues','Radial Color 1']
 const legends = $derived.by(() => {
   const result = new Map<number, { name: string; description: string }>()
   for (const group of supportedCategories) {
     for (const key of group.keycodes) {
       if (result.has(key.value)) continue
       const name = key.name || key.code
       const full = (('title' in key && key.title) || name).replace(/\s+/g, ' ')
       result.set(key.value, { name, description: full === key.code ? key.code : full + ' · ' + key.code })
     }
   }
   for (const [index, key] of (loadedDefinition.customKeycodes ?? []).entries()) {
     const description = key.title && key.title !== key.name ? key.title + ' · ' + key.name : key.name
     result.set(keycodeSet.dict._QK_KB + index, { name: key.shortName || key.name, description })
   }
   return result
 })
 function keyHex(code: number) { return '0x' + code.toString(16).toUpperCase().padStart(4, '0') }
 function label(code: number) { return legends.get(code)?.name ?? keyHex(code) }
 function describe(code: number) { return legends.get(code)?.description ?? keyHex(code) }
 async function command(bytes:number[]){if(!adapter)throw Error('No device connected');return adapter.command(bytes)}
 async function readLayer(){if(!adapter)throw Error('No device connected');keys=await adapter.readLayer(layer)}
 async function assign(code:number){if(busy||selectedKey===null||!adapter||keys[selectedKey]===code)return;busy=true;try{status='Saving keymap…';await adapter.setKey(layer,Math.floor(selectedKey/loadedDefinition.matrix.cols),selectedKey%loadedDefinition.matrix.cols,code);await readLayer();status=sample?'Saved in sample session.':'Saved to keyboard.'}catch(e){status='Not confirmed · '+String(e);onMessage(status)}finally{busy=false}}
 let layoutWord = $state<number>()
 let layoutError = $state('')
 const layoutLabels = $derived(loadedDefinition.layouts.labels ?? [])
 const layoutChoices = $derived(layoutWord === undefined ? [] : unpackLayout(layoutWord, layoutLabels))
 const layoutKnown = $derived(!layoutLabels.length || layoutWord !== undefined)
 const presets = $derived(Object.entries(loadedDefinition.layouts.presets ?? {}).filter(([, values]) =>
   Array.isArray(values) && values.length === layoutLabels.length && values.every((value, i) => {
     const group = layoutLabels[i]
     return Number.isInteger(value) && value >= 0 && value < (typeof group === 'string' ? 2 : group.length - 1)
   })))
 const geometry = $derived(parseViaGeometry(loadedDefinition))
 const layout = $derived(visibleViaLayout(geometry, loadedDefinition.matrix.cols, layoutChoices))
 function layoutText(name: string) {
   const translated = loadedDefinition.translations?.[$language]?.[name]
   return typeof translated === 'string' ? translated : $t(name)
 }
 async function loadLayoutOptions(active: ViaAdapter) {
   layoutWord = undefined
   layoutError = ''
   if (!active.definition.layouts.labels?.length) return
   try { layoutWord = await active.readLayoutOptions() }
   catch (error) { layoutError = String(error) }
 }
 async function retryLayout() {
   if (busy || !adapter) return
   busy = true
   try { await loadLayoutOptions(adapter) } finally { busy = false }
 }
 async function changeLayout(changes: Map<number, number>) {
   if (busy || !adapter || layoutWord === undefined) return
   const active = adapter
   busy = true
   selectedKey = null
   layoutError = ''
   try {
     const current = await active.readLayoutOptions()
     const requested = updateLayoutWord(current, layoutLabels, changes)
     if (requested !== current) await active.writeLayoutOptions(requested)
     layoutWord = await active.readLayoutOptions()
     if (layoutWord !== requested) throw Error('Layout change not confirmed.')
     status = sample ? 'Saved in sample session.' : 'Saved to keyboard.'
   } catch (error) {
     try { layoutWord = await active.readLayoutOptions() } catch { layoutWord = undefined }
     layoutError = String(error)
     status = 'Layout change not confirmed.'
   } finally { busy = false }
 }
 $effect(() => {
   const active = adapter
   const version = protocol
   if (!connected || !layoutKnown || !active?.supportsMatrix(version)) { onMatrix(undefined); return }
   const columns = loadedDefinition.matrix.cols
   const sampleDevice = active.device instanceof SampleViaDevice ? active.device : undefined
   onMatrix({
     layout: { ...layout, keys: layout.keys.map(key => ({ ...key, code: String(key.index), label: Math.floor(key.index / columns) + ',' + key.index % columns })) },
     read: signal => active.readMatrix(version, signal),
     pulse: sampleDevice ? () => sampleDevice.pulseSwitch() : undefined,
   })
 })
 const importedLayout = $derived(imported ? visibleViaLayout(parseViaGeometry(imported), imported.matrix.cols) : undefined)
 const importedMenus = $derived(imported ? parseViaMenus(imported.menus) : [])

 async function connect(chosen?: HIDDevice) {
   if (!chosen) { await connectNew(); return }
   liveLighting?.dispose()
   busy = true
   connected = false
   onConnected(false)
   rgbReady = false
   selectedKey = null
   try {
     if (hid?.opened) await hid.close()
     hid = chosen
     adapter = new ViaAdapter(hid, definition)
     protocol = await adapter.open()
     loadedDefinition = matchingDefinition(hid) ?? await lookupDefinition(hid, protocol)
     validateDefinition(loadedDefinition, hid)
     adapter = new ViaAdapter(hid, loadedDefinition)
     identity = loadedDefinition.name + ' · ' + hid.vendorId.toString(16) + ':' + hid.productId.toString(16)
     layerCount = await adapter.layerCount()
     layer = 0
     macroCount = 0
     try { macroCount = (await command([0x0c]))[1] } catch {}
     await readLayer()
     await loadLayoutOptions(adapter)
     connected = true
     onConnected(true, loadedDefinition.name)
     status = 'Keyboard settings loaded.'
     const lighting = loadedDefinition.lighting
     if (hid.vendorId === 0x5241 && hid.productId === 0x006b && protocol === 8 &&
         typeof lighting === 'object' && lighting?.extends === 'wt_rgb_backlight' &&
         [9,10,11,12,13].every(id => lighting.supportedLightingValues?.includes(id))) {
       try {
         brightness = (await command([8,9]))[2]
         rgbEffect = (await command([8,10]))[2]
         speed = (await command([8,11]))[2]
         const first = await command([8,12]), second = await command([8,13])
         hue = first[2]; saturation = first[3]; hue2 = second[2]; saturation2 = second[3]
         ledColors = []
         rgbReady = true
         liveLighting = new LiveLighting(command, error => status = 'Live color update failed: ' + String(error))
       } catch (error) { status = 'RGB preview unavailable: ' + String(error) }
     }
   } catch (error) {
     status = String(error); onMessage(status); connected = false; onConnected(false)
     if (hid?.opened) await hid.close()
   } finally { busy = false; await refreshDevices() }
 }
 export function keymapLoad() {
   return { ready: connected, notice: sample && !connected && !busy ? status : '' }
 }
 async function changeLayer(index: number) {
   if (busy || !adapter || index === layer) return
   busy = true
   try {
     keys = await adapter.readLayer(index)
     layer = index
     status = 'Loaded layer {number}'
   } catch (error) {
     status = String(error)
   } finally {
     busy = false
   }
 }
 async function writeRGB(id:number,values:number[]){busy=true;try{await liveLighting?.flush();await command([7,id,...values]);await command([9]);const read=await command([8,id]);if(values.some((v,i)=>read[2+i]!==v))throw Error('RGB readback mismatch');status='RGB setting saved and read back successfully.'}catch(e){status=String(e)}finally{busy=false}}
 async function loadSample(sampleAdapter: ViaAdapter) {
   busy = true
   try {
     adapter = sampleAdapter
     protocol = await sampleAdapter.open()
     loadedDefinition = sampleAdapter.definition
     identity = loadedDefinition.name
     layerCount = await sampleAdapter.layerCount()
     await readLayer()
     await loadLayoutOptions(adapter)
     connected = true
     status = 'Sample board · edits are simulated.'
   } catch (error) {
     status = String(error)
   } finally {
     busy = false
   }
 }
 onMount(() => {
   if (sample) {
     const sampleAdapter = new ViaAdapter(new SampleViaDevice(), sampleViaDefinition)
     void loadSample(sampleAdapter)
     return () => { void sampleAdapter.close() }
   }
   try {
     const library = localStorage.getItem(libraryStorageKey)
     if (library) {
       const { entries, selectedId } = JSON.parse(library) as { entries: SavedDefinition[]; selectedId: string }
       savedDefinitions = entries.map(entry => ({ ...entry, definition: parseLocalDefinition(JSON.stringify(entry.definition)) }))
       selectedDefinitionId = savedDefinitions.some(entry => entry.id === selectedId) ? selectedId : savedDefinitions[0]?.id ?? ''
     } else {
       const saved = localStorage.getItem(definitionStorageKey)
       if (saved) {
         const id = crypto.randomUUID()
         saveLibrary([{ id, filename: '', definition: parseLocalDefinition(saved) }], id)
       }
     }
   } catch {
     importError = true
     importStatus = 'Could not load the saved VIA definition. Upload a replacement JSON file.'
   }
   available='hid' in navigator;status=available?'Connect a VIA or HMK keyboard to load its hardware settings.':'WebHID unavailable in this browser';const disconnect=(e:HIDConnectionEvent)=>{if(e.device===hid){liveLighting?.dispose();connected=false;rgbReady=false;onLighting(false);onCustom(false);status='Keyboard disconnected';onConnected(false);void refreshDevices()}};const connectedEvent=()=>void refreshDevices();if(available)void refreshDevices();navigator.hid?.addEventListener('connect',connectedEvent);navigator.hid?.addEventListener('disconnect',disconnect);return()=>{liveLighting?.dispose();navigator.hid?.removeEventListener('connect',connectedEvent);navigator.hid?.removeEventListener('disconnect',disconnect);if(hid?.opened)void hid.close()}})
</script>
<style>
  .picker-rows {
    container-type: inline-size;
  }
  .picker-row {
    display: grid;
    align-items: center;
    gap: .45rem 1rem;
    padding-block: .45rem;
  }
  .picker-row + .picker-row {
    border-top: 1px solid var(--border);
  }
  .picker-actions {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(5.5rem, 45%), 1fr));
    gap: .35rem;
  }
  @container (min-width: 27rem) {
    .picker-row {
      grid-template-columns: minmax(7rem, 26%) minmax(0, 1fr);
    }
  }
</style>
{#if !sample && view === 'design'}
  <section class="grid min-h-80 flex-1 place-items-center p-6 text-center">
    <div class="w-full rounded-xl border bg-card p-3 text-card-foreground shadow-sm {imported ? 'max-w-4xl' : 'max-w-md'}">
      <div class="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-muted/30 px-5 py-8">
        <div class="grid size-11 place-items-center rounded-lg border bg-background text-muted-foreground">
          <FileJsonIcon class="size-5" aria-hidden="true" />
        </div>
        <h1 class="text-lg font-semibold">{$t("VIA keyboard definition")}</h1>
        <p class="max-w-xs text-sm text-muted-foreground">{$t("Choose your keyboard’s JSON file to save its definition in this browser.")}</p>
        <input bind:this={definitionInput} class="hidden" type="file" aria-label={$t("VIA JSON file")}
          accept=".json,application/json" onchange={uploadDefinition} />
        <Button class="mt-1" onclick={() => definitionInput?.click()}>
          <UploadIcon aria-hidden="true" /> {$t("Upload VIA JSON")}
        </Button>

        {#if importStatus}<p class="break-words text-sm {importError ? 'text-destructive' : 'text-muted-foreground'}" role={importError ? 'alert' : 'status'}>{$t(importStatus)}</p>{/if}
      </div>
      {#if savedDefinitions.length}
        <nav class="flex flex-wrap gap-2 px-4 pt-4" aria-label={$t("Saved VIA definitions")}>
          {#each savedDefinitions as entry (entry.id)}
            <div class="flex max-w-full items-center rounded-md border {entry.id === selectedDefinitionId ? 'bg-secondary text-secondary-foreground' : 'bg-background'}">
              <Button variant="ghost" class="min-w-0" aria-pressed={entry.id === selectedDefinitionId}
                title={entry.filename || entry.definition.name} onclick={() => updateLibrary(savedDefinitions, entry.id)}>
                <span class="truncate">{entry.definition.name}{entry.filename ? ` · ${entry.filename}` : ''}</span>
              </Button>
              <Button variant="ghost" size="icon" class="shrink-0" aria-label={$t("Delete {name}", { name: entry.filename || entry.definition.name })}
                onclick={() => deleteDefinition(entry.id)}>
                <XIcon aria-hidden="true" />
              </Button>
            </div>
          {/each}
        </nav>
      {/if}
      {#if imported && importedLayout}
        <div class="grid gap-4 p-4 text-left">
          <h2 class="break-words text-lg font-semibold">{imported.name}</h2>
          <dl class="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt class="text-muted-foreground">{$t("USB vendor / product")}</dt><dd class="font-mono">{Number(imported.vendorId).toString(16).padStart(4, '0').toUpperCase()}:{Number(imported.productId).toString(16).padStart(4, '0').toUpperCase()}</dd></div>
            <div><dt class="text-muted-foreground">{$t("Matrix")}</dt><dd>{imported.matrix.rows} × {imported.matrix.cols}</dd></div>
            <div><dt class="text-muted-foreground">{$t("Custom menus")}</dt><dd>{importedMenus.map(menu => $t(menu.label || 'Custom')).join(', ') || $t('None declared')}</dd></div>
          </dl>
          <div class="rounded-lg border bg-muted/20 p-4">
            <h3 class="text-sm font-medium">{$t("Physical layout preview")}</h3>
            <p class="mt-1 text-xs text-muted-foreground">{$t("Keys show matrix coordinates. Connect the keyboard to read its assignments.")}</p>
            <div class="mt-4 overflow-x-auto">
              <div class="relative mx-auto" style:width={importedLayout.width * 48 + 'px'} style:height={importedLayout.height * 48 + 'px'}>
                {#each importedLayout.keys as key}
                  <div class="absolute grid place-items-center rounded-md border bg-background font-mono text-xs"
                    style:transform-origin={(key.originX ?? 0) * 48 + 'px ' + (key.originY ?? 0) * 48 + 'px'}
                    style:transform={'rotate(' + (key.angle ?? 0) + 'deg)'}
                    style:left={key.x * 48 + 'px'} style:top={key.y * 48 + 'px'}
                    style:width={Math.max(1, key.w * 48 - 4) + 'px'} style:height={Math.max(1, key.h * 48 - 4) + 'px'}>
                    {Math.floor(key.index / imported.matrix.cols)},{key.index % imported.matrix.cols}
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </section>
{:else if view !== 'build' && view !== 'studio'}
{#if connected || busy || status !== 'Connect a VIA or HMK keyboard to load its hardware settings.'}
  <div class="border-b bg-muted/20 p-4">
    <span class="text-xs" role="status">{$t(status, { number: layer + 1 })}</span>
  </div>
{/if}
{#if connected}<div class="w-full px-4 py-6" class:mx-auto={view !== 'custom'} class:max-w-3xl={view !== 'custom'}><h1 class="text-xl font-semibold">{identity}</h1><p class="mt-2 text-xs text-muted-foreground">{$t(sample?'Simulation':'Connected hardware')} · VIA {protocol} · {$t('{count} layers · {rows}×{cols} matrix', { count: layerCount, rows: loadedDefinition.matrix.rows, cols: loadedDefinition.matrix.cols })}</p>{#if view==='keymap'}
{#if !layoutKnown}
  <p class="mt-5 text-sm" role="status">{$t('Read the active layout in Layout to edit this keymap.')}</p>
{:else}
<div class="mt-5"><KeymapLayers count={layerCount} current={layer} disabled={busy} onSelect={changeLayer}/></div>
<KeyCanvas {...layout} scale={64} selected={selectedKey} disabled={busy} label={index=>label(keys[index]??0)} description={index=>describe(keys[index]??0)} onSelect={index=>selectedKey=index}/>
<div class="rounded-lg border p-5"><h2 class="font-medium">{selectedKey === null ? $t('Assign keycode · select a key above') : $t('Assign keycode · key {number}', { number: selectedKey + 1 })}</h2>
{#if selectedKey !== null}<p class="mt-1 wrap-anywhere text-sm text-muted-foreground">{describe(keys[selectedKey] ?? 0)}</p>{/if}
<input aria-label={$t("Search keycodes")} class="my-3 w-full rounded border bg-background p-2" placeholder={$t("Search keycodes")} bind:value={search}/><Accordion.Root type="multiple" value={search?categories.map(g=>g.id):['basic']}>
{#each categories as group}
  <Accordion.Item value={group.id}>
    <Accordion.Trigger>{$t(group.label)}</Accordion.Trigger>
    <Accordion.Content>
      {#if group.id === 'basic'}
        <BasicKeyboardPicker resolve={usage => viaKeyValue(usage, keycodeSet.dict)} disabled={busy || selectedKey === null} {search} onSelect={assign}/>
      {:else}
        <div class="picker-rows">
          {#each group.rows as row}
            <div class:picker-row={row.label} role="group" aria-label={row.label || $t(group.label)}>
              {#if row.label}<span class="text-sm text-muted-foreground">{row.label}</span>{/if}
              <div class="picker-actions">
                {#each row.actions as action}
                  <Button size="sm" variant="outline" class="h-auto min-h-8 min-w-0 whitespace-normal wrap-anywhere py-1"
                    style={action.column ? 'grid-column: ' + action.column : undefined}
                    aria-label={action.name} title={action.name + ' · ' + action.item.code + ' · 0x' + action.item.value.toString(16)}
                    disabled={busy || selectedKey === null} onclick={() => assign(action.item.value)}>{action.caption}</Button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </Accordion.Content>
  </Accordion.Item>
{/each}
</Accordion.Root>
<div class="mt-5 grid gap-2"><label for={sample ? 'via-sample-any' : 'via-any'}>{$t("Any · QMK expression or hexadecimal keycode")}</label><input id={sample ? 'via-sample-any' : 'via-any'} class="rounded border bg-background p-2" placeholder="LT(1,KC_ESC), LCTL(KC_C), or 0x0052" bind:value={expression}/><Button disabled={busy||selectedKey===null||!expression} onclick={assignExpression}>{$t("Assign expression")}</Button></div></div>

{/if}
{:else if view === 'layout'}
<section class="mt-6 grid gap-4">
  <h2 class="text-xl font-semibold">{$t('Layout')}</h2>
  {#if layoutLabels.length}
    <LayoutOptions labels={layoutLabels} values={layoutChoices} disabled={busy || layoutWord === undefined}
      localize={layoutText} onChange={(group, value) => changeLayout(new Map([[group, value]]))}/>
    {#if presets.length}
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label={$t('Presets')}>
        <span class="mr-2 text-sm">{$t('Presets')}</span>
        {#each presets as [name, values]}
          <Button size="sm" variant="outline" disabled={busy || layoutWord === undefined}
            aria-pressed={values.every((value, i) => value === layoutChoices[i])}
            onclick={() => changeLayout(new Map(values.map((value, i) => [i, value])))}>{layoutText(name)}</Button>
        {/each}
      </div>
    {/if}
    {#if layoutError}
      <div class="flex items-center gap-3 text-sm"><span role="alert">{$t(layoutError.replace(/^Error: /, ''))}</span>
        <Button size="sm" variant="outline" disabled={busy} onclick={retryLayout}>{$t('Read keyboard')}</Button></div>
    {/if}
  {:else}<p class="text-sm text-muted-foreground">{$t('Fixed physical layout')}</p>{/if}
  {#if !layoutLabels.length || layoutWord !== undefined}
    <KeyCanvas {...layout} scale={64} selected={null} disabled label={index => label(keys[index] ?? 0)} onSelect={() => {}}/>
    <span class="text-sm text-muted-foreground">{$t('{count} physical positions', { count: layout.keys.length })}</span>
  {/if}
</section>
{:else if (view==='custom' || (view==='lighting' && !rgbReady)) && adapter}{#key view}{#key adapter}<ViaCustomControls {adapter} {sample} menus={customMenus} legacy={protocol<11} lightingOnly={view==='lighting'} onWriting={value=>writingControl=value}/>{/key}{/key}
{:else if view==='design' && sample}
  <section class="mt-6" aria-label={$t("Sample VIA definition")}>
    <h2 class="font-medium">{$t("Sample VIA definition")}</h2>
    <pre class="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(loadedDefinition, null, 2)}</pre>
  </section>
{:else if view==='settings'}<dl class="mt-5 grid gap-3 text-sm"><dt>{$t("Definition")}</dt><dd>{loadedDefinition.name} · {$t(sample?'sample JSON':savedDefinitions.some(entry => entry.definition===loadedDefinition)?'imported JSON':'local VIA catalog')}</dd><dt>{$t("Capabilities")}</dt><dd>{$t(rgbReady?'Keymap, RGB lighting':'Keymap')}</dd></dl>
{:else if view==='lighting' && rgbReady}<div class="my-8 overflow-x-auto"><div class="relative mx-auto" style:width={layout.width*80+'px'} style:height={layout.height*80+'px'}>{#each layout.keys as physical}<div class="absolute flex items-center justify-center rounded-lg border bg-background text-sm" style:left={physical.x*80+'px'} style:top={physical.y*80+'px'} style:width={physical.w*80-6+'px'} style:height={physical.h*80-6+'px'}>{label(keys[physical.index]??0)}</div>{/each}</div></div>
<Tabs.Root value="rgb"><Tabs.List class="border-b"><Tabs.Trigger value="rgb" class="border-b-2 border-foreground px-4 py-3 text-sm font-medium">{$t("RGB status")}</Tabs.Trigger></Tabs.List><Tabs.Content value="rgb"><LightingPreview effect={rgbEffect} {brightness} {speed} {hue} {saturation} {hue2} {saturation2} colors={ledColors} onSelect={index=>ledSelection=index} selected={ledSelection}/><fieldset disabled={busy} class="grid gap-5 rounded-lg border p-6"><h2 class="font-medium">{$t("RGB lighting · hardware settings")}</h2><label class="grid gap-2 text-sm">{$t("Effect")}<select class="rounded border bg-background p-2" bind:value={rgbEffect} onchange={()=>writeRGB(10,[Number(rgbEffect)])}>{#each effects as name,i}<option value={i}>{$t(name)}</option>{/each}</select></label><label class="grid gap-2 text-sm">{$t('Effect Speed')} · {speed}<input type="range" min="0" max="3" bind:value={speed} oninput={e=>{speed=Number(e.currentTarget.value);liveLighting?.update('speed',[7,11,speed])}} onchange={()=>writeRGB(11,[Number(speed)])}/></label><ColorPicker label={$t("Color 1")} {hue} {saturation} onInput={color=>{hue=color.hue;saturation=color.saturation;liveColor(12,color)}} onCommit={color=>{hue=color.hue;saturation=color.saturation;void writeRGB(12,[color.hue,color.saturation])}}/>

{#if Number(rgbEffect)===3 || Number(rgbEffect)===4}<ColorPicker label={$t("Color 2")} hue={hue2} saturation={saturation2} onInput={color=>{hue2=color.hue;saturation2=color.saturation;liveColor(13,color)}} onCommit={color=>{hue2=color.hue;saturation2=color.saturation;void writeRGB(13,[color.hue,color.saturation])}}/>{/if}
{#if Number(rgbEffect)===2}<p class="text-xs text-muted-foreground">{$t("Custom Colors is active. Individual LED editing requires a verified firmware mapping.")}</p>{/if}
<label class="grid gap-2 text-sm">{$t('Brightness')} · {brightness}<input type="range" min="0" max="255" bind:value={brightness} oninput={e=>{brightness=Number(e.currentTarget.value);liveLighting?.update('brightness',[7,9,brightness])}} onchange={()=>writeRGB(9,[Number(brightness)])}/></label>
</fieldset></Tabs.Content></Tabs.Root>{/if}<p class="mt-4 text-xs text-muted-foreground">{$t(sample?'Changes are kept in this sample session.':'Connected hardware · keymap and lighting changes save automatically, with readback verification.')}</p></div>{/if}
{/if}
