<script lang="ts">
 import { Switch } from '$lib/components/ui/switch'
 import { Button } from '$lib/components/ui/button'
 import ViaMenuNode from './via-menu-node.svelte'
 let {node,values,onChange}:{node:any;values:Record<string,number|string>;onChange:(id:string,value:number|string)=>void}=$props()
 function visible(expression?:string){if(!expression)return true;const match=expression.match(/^\{([^}]+)\}\s*(>=|<=|==|!=|>|<)\s*(-?\d+)$/);if(!match)return false;const a=Number(values[match[1]]),b=Number(match[3]);return match[2]==='>='?a>=b:match[2]==='<='?a<=b:match[2]==='=='?a===b:match[2]==='!='?a!==b:match[2]==='>'?a>b:a<b}
 const id=$derived(node.type?node.content?.[0]:undefined)
</script>
{#if typeof node!=='string' && visible(node.showIf)}
 {#if node.type}<div class="grid gap-2 text-sm">
  {#if node.type==='toggle'}<div class="flex items-center justify-between gap-4"><label for={id}>{node.label}</label><Switch {id} bind:checked={()=>Number(values[id])===1,v=>onChange(id,v?1:0)}/></div>
  {:else if node.type==='dropdown'}<label for={id}>{node.label}</label><select {id} class="rounded-md border bg-background p-2" value={values[id]??0} onchange={e=>onChange(id,Number(e.currentTarget.value))}>{#each node.options as option:any,i}<option value={Array.isArray(option)?option[1]:i}>{Array.isArray(option)?option[0]:option}</option>{/each}</select>
  {:else if node.type==='range'}<label for={id}>{node.label} · {values[id]??node.options[0]}</label><input {id} type="range" min={node.options[0]} max={node.options[1]} value={values[id]??node.options[0]} oninput={e=>onChange(id,Number(e.currentTarget.value))}/>
  {:else if node.type==='button'}<Button variant="outline" onclick={()=>onChange(id,node.options?.[0]??0)}>{node.label}</Button>
  {:else if node.type==='keycode'}<label for={id}>{node.label}</label><input {id} class="rounded-md border bg-background p-2" placeholder="Keycode · preview" value={values[id]??''} onchange={e=>onChange(id,e.currentTarget.value)}/>
  {:else}<p>{node.label}: {values[id]??'Not connected'}</p>{/if}
 </div>
 {:else}<div class="grid gap-5">{#if node.label}<h3 class="mt-3 font-medium">{node.label}</h3>{/if}{#each node.content??[] as child}<ViaMenuNode node={child} {values} {onChange}/>{/each}</div>{/if}
{/if}
