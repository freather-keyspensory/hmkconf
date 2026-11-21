<script lang="ts">
  import { t } from '$lib/i18n'
 let {disabled=false,onSelect,search='',resolve}:{disabled?:boolean;onSelect:(code:number)=>void;search?:string;resolve:(hidUsage:number)=>number|undefined}=$props()
 type Key={label:string;code:number;x:number;y:number;w:number;h:number}
 const keys=$derived.by(()=>{
  const result:Key[]=[]
  function row(y:number,x:number,items:[string,number,number?,number?][]){for(const [label,code,w=1,h=1] of items){result.push({label,code,x,y,w,h});x+=w}}
  row(0,0,[['Esc',41]]);row(0,2,Array.from({length:12},(_,i)=>['F'+(i+1),58+i,1] as [string,number,number]));
  row(0,15,[['Print',70],['Scroll',71],['Pause',72]]);
  row(0,19,[['Mute',0xc00e2],['Vol −',0xc00ea],['Vol +',0xc00e9],['Play',0xc00cd]]);
  row(1.5,0,[['~ `',53],...Array.from({length:10},(_,i)=>[String((i+1)%10),i===9?39:30+i] as [string,number]),['− _',45],['= +',46],['Backspace',42,2]]);
  row(2.5,0,[['Tab',43,1.5],...Array.from('QWERTYUIOP',c=>[c,c.charCodeAt(0)-65+4] as [string,number]),['[ {',47],['] }',48],['\\ |',49,1.5]]);
  row(3.5,0,[['Caps',57,1.75],...Array.from('ASDFGHJKL',c=>[c,c.charCodeAt(0)-65+4] as [string,number]),['; :',51],["' \"",52],['Enter',40,2.25]]);
  row(4.5,0,[['Shift',225,2.25],...Array.from('ZXCVBNM',c=>[c,c.charCodeAt(0)-65+4] as [string,number]),[', <',54],['. >',55],['/ ?',56],['Shift',229,2.75]]);
  row(5.5,0,[['Ctrl',224,1.25],['Win',227,1.25],['Alt',226,1.25],['Space',44,6.25],['Alt',230,1.25],['Win',231,1.25],['Menu',101,1.25],['Ctrl',228,1.25]]);
  row(1.5,15,[['Insert',73],['Home',74],['PgUp',75]]);row(2.5,15,[['Delete',76],['End',77],['PgDn',78]]);row(4.5,16,[['↑',82]]);row(5.5,15,[['←',80],['↓',81],['→',79]]);
  row(1.5,19,[['Num',83],['/',84],['*',85],['−',86]]);row(2.5,19,[['7',95],['8',96],['9',97],['+',87,1,2]]);row(3.5,19,[['4',92],['5',93],['6',94]]);row(4.5,19,[['1',89],['2',90],['3',91],['Enter',88,1,2]]);row(5.5,19,[['0',98,2],['.',99]]);
  return result
 })
</script>
<div class="overflow-x-auto py-3"><div class="keyboard" role="group" aria-label={$t("108-key basic keycode picker")}>
 {#each keys as key}
 {@const code = resolve(key.code < 0x10000 ? 0x70000 + key.code : key.code)}
 <button type="button" disabled={disabled || code === undefined} aria-label={key.x>=19&&key.y>0 ? $t('{key} (numpad)', { key: key.label }) : key.label} title={key.label+' · 0x'+code?.toString(16)} class="key" class:dimmed={!!search&&!key.label.toLowerCase().includes(search.toLowerCase())} style:left={key.x/23*100+'%'} style:top={key.y/6.5*100+'%'} style:width={(key.w-.08)/23*100+'%'} style:height={(key.h-.08)/6.5*100+'%'} onclick={()=>code !== undefined && onSelect(code)}>{key.label}</button>{/each}
</div></div>
<style>.keyboard{position:relative;width:100%;min-width:690px;aspect-ratio:23/6.5}.key{position:absolute;border:1px solid var(--border);border-bottom-width:3px;border-radius:5px;background:var(--background);font-size:clamp(8px,.8vw,12px);display:flex;align-items:center;justify-content:center;white-space:nowrap;padding:1px}.key:hover:not(:disabled){background:var(--accent);color:var(--accent-foreground)}.key:disabled{opacity:.4}.key.dimmed{opacity:.2}.key:focus-visible{outline:2px solid var(--ring);outline-offset:2px}</style>
