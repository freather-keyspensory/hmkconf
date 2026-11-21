<script lang="ts">
 import definition from '$lib/keyboard/ec23u-via.json'
 import ViaMenuNode from './via-menu-node.svelte'
 import { Switch } from '$lib/components/ui/switch'
 let {area='Actuation'}:{area?:string}=$props()
 let version=$state(6)
 let values=$state<Record<string,number|string>>({id_firmware_version:6,id_actuation_mode:0,id_apc_actuation_threshold:550,id_apc_release_threshold:500})
 let options=$state([false,false,false])
 let status=$state('Preview only · values are not read from hardware')
 const menus=$derived(definition.menus.filter((m):m is Exclude<typeof m,string>=>typeof m!=='string').filter(m=>area==='Actuation'?m.label==='Switch Configuration':area==='Lighting'?m.label==='Indicators':area==='Gamepad'?m.label==='Controller':area==='Advanced keys'?['SOCD','DKS','Tap Dance'].includes(m.label):area==='Combos'?m.label==='Combos':area==='Settings'?['QMK Settings','System'].includes(m.label):false))
 function change(id:string,value:number|string){values[id]=value;status=`Preview change · ${id}: ${value}`; if(id==='id_apc_actuation_threshold')values.id_apc_release_threshold=Math.max(1,Math.min(Number(values.id_apc_release_threshold??1),Number(value)-50));if(id==='id_apc_release_threshold')values.id_apc_actuation_threshold=Math.min(1023,Math.max(Number(values.id_apc_actuation_threshold??1023),Number(value)+50))}
 const keys=$derived.by(()=>{
  let y=0;const result:{id:string;x:number;y:number;w:number;h:number;group?:number;option?:number}[]=[]
  for(const row of definition.layouts.keymap){let x=0,w=1,h=1;for(const item of row){if(typeof item!=='string'){const o=item as {x?:number;y?:number;w?:number;h?:number};x+=o.x??0;y+=o.y??0;w=o.w??w;h=o.h??h;continue}const [id,,,option]=item.split('\n');const pair=option?.split(',').map(Number);result.push({id,x,y,w,h,group:pair?.[0],option:pair?.[1]});x+=w;w=1;h=1}y++}
  const anchors=new Map<number,[number,number]>()
  for(const key of result)if(key.group!==undefined&&key.option===0)anchors.set(key.group,[key.x,key.y])
  const alternatives=new Map<number,[number,number]>()
  for(const key of result)if(key.group!==undefined&&key.option===1&&!alternatives.has(key.group))alternatives.set(key.group,[key.x,key.y])
  return result.filter(k=>k.group===undefined||k.option===Number(options[k.group])).map(k=>{if(k.group!==undefined&&k.option===1){const a=anchors.get(k.group)!,b=alternatives.get(k.group)!;return {...k,x:k.x+a[0]-b[0],y:k.y+a[1]-b[1]}}return k})
 })
</script>
<div class="mx-auto w-full max-w-4xl p-6"><div class="flex items-center justify-between"><h1 class="text-xl font-semibold">EC 23U · {area}</h1><label class="text-xs">Preview firmware revision <select class="ml-2 rounded border bg-background p-2" bind:value={()=>version,v=>{version=Number(v);values.id_firmware_version=version}}>{#each [1,2,3,4,5,6] as v}<option value={v}>{v}</option>{/each}</select></label></div><p class="mt-2 text-xs text-muted-foreground">VIA definition · 6369:6B95 · native units · simulated firmware revision</p>
<div class="relative mx-auto my-8" style="width:240px;height:400px">{#each keys as key}<div class="absolute flex items-center justify-center rounded-md border bg-muted text-xs" style:left={key.x*60+'px'} style:top={key.y*60+'px'} style:width={key.w*60-4+'px'} style:height={key.h*60-4+'px'} title={'Matrix '+key.id}>{key.id}</div>{/each}</div>
{#if area==='Layout'}<div class="grid gap-5 rounded-lg border p-5">{#each definition.layouts.labels as label,i}<div class="flex justify-between"><label for={'ec-layout-'+i}>{label}</label><Switch id={'ec-layout-'+i} bind:checked={options[i]}/></div>{/each}</div>
{:else if area==='Keymap'}<p class="text-sm text-muted-foreground">Physical layout from the VIA JSON. Matrix coordinates are shown; default key assignments are not supplied by this definition.</p>
{:else}{#if area==='Lighting'}<p class="mb-4 text-sm text-muted-foreground">QMK RGB lighting is declared in this definition. Indicator controls below require firmware revision 6.</p>{/if}{#each menus as menu}<div class="mb-5 rounded-lg border p-5"><ViaMenuNode node={menu} {values} onChange={change}/></div>{/each}{/if}<p class="mt-5 text-xs text-muted-foreground" role="status">{status}</p></div>
