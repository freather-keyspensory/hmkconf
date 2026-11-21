<script lang="ts">
 import { hsvToHex,hexToHsv } from './color'
 type Color = { hue: number; saturation: number }
 let {label,hue,saturation,disabled=false,onInput,onCommit}:{label:string;hue:number;saturation:number;disabled?:boolean;onInput:(value:Color)=>void;onCommit:(value:Color)=>void}=$props()
 let draft = $state<Color>()
 const current = $derived(draft ?? { hue, saturation })
 function preview(color: Color) { draft = color; onInput(color) }
 function finish(color: Color) { draft = undefined; onCommit(color) }
</script>
<label class="flex items-center justify-between gap-3 text-sm">
  <span>{label}</span>
  <input {disabled} type="color" class="h-9 w-16 cursor-pointer rounded-md border bg-background p-1" value={hsvToHex(current.hue,current.saturation)}
    oninput={event=>preview(hexToHsv(event.currentTarget.value))} onchange={event=>finish(hexToHsv(event.currentTarget.value))}
    onblur={()=>{if(draft) finish(draft)}}/>
</label>
