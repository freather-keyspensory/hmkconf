<script lang="ts">
  import { onMount } from 'svelte'
  let controllers = $state<{index:number;name:string;mapping:string;axes:number[];buttons:{value:number;pressed:boolean}[]}[]>([])
  let selected = $state(0)
  const current = $derived(controllers.find(c=>c.index===selected) ?? controllers[0])
  const names=['A / Cross','B / Circle','X / Square','Y / Triangle','LB / L1','RB / R1','LT / L2','RT / R2','Back / Share','Start / Options','Left stick','Right stick','D-pad up','D-pad down','D-pad left','D-pad right','Guide']
  onMount(()=>{
    let frame=0
    function update(){ controllers=Array.from(navigator.getGamepads?.() ?? []).filter((pad):pad is Gamepad=>pad!==null).map(pad=>({index:pad.index,name:pad.id,mapping:pad.mapping,axes:Array.from(pad.axes),buttons:pad.buttons.map(b=>({value:b.value,pressed:b.pressed}))}));frame=requestAnimationFrame(update) }
    update();return()=>cancelAnimationFrame(frame)
  })
</script>
<div class="mx-auto w-full max-w-5xl p-8">
  <h2 class="text-xl font-semibold">Gamepad tester</h2><p class="mt-2 text-sm text-muted-foreground">Connect a controller or a keyboard exposing gamepad output, then press a controller button to make it visible to the browser.</p>
  {#if !current}<div class="mt-6 rounded-lg border p-8 text-center"><h3 class="font-medium">No gamepad detected</h3><p class="mt-2 text-sm text-muted-foreground">The GUI preview does not generate controller output. This tester displays real devices reported by your browser.</p></div>
  {:else}<label class="mt-6 block text-sm">Controller<select class="mt-2 w-full rounded-md border bg-background p-2" bind:value={selected}>{#each controllers as pad}<option value={pad.index}>{pad.index+1}. {pad.name}</option>{/each}</select></label><p class="mt-2 text-xs text-muted-foreground">Mapping: {current.mapping || 'Device-specific'} · {current.buttons.length} buttons · {current.axes.length} axes</p>
    <div class="mt-6 grid gap-5 sm:grid-cols-2">{#each [0,1] as stick}<div class="rounded-lg border p-5"><h3 class="font-medium">{stick===0?'Left stick':'Right stick'}</h3><div class="stick"><div class="cross horizontal"></div><div class="cross vertical"></div><div class="dot" style:left={(1+(current.axes[stick*2] ?? 0))*50+'%'} style:top={(1+(current.axes[stick*2+1] ?? 0))*50+'%'}></div></div><p class="text-center font-mono text-xs">X {(current.axes[stick*2] ?? 0).toFixed(3)} · Y {(current.axes[stick*2+1] ?? 0).toFixed(3)}</p></div>{/each}</div>
    {#if current.mapping==='standard'}<div class="mt-5 grid gap-5 sm:grid-cols-2">{#each [6,7] as index}<div class="rounded-lg border p-4"><label for={'trigger-'+index} class="text-sm">{index===6?'Left trigger':'Right trigger'} · {Math.round((current.buttons[index]?.value ?? 0)*100)}%</label><progress id={'trigger-'+index} class="mt-3 w-full" max="1" value={current.buttons[index]?.value ?? 0}></progress></div>{/each}</div>{/if}
    <h3 class="mt-6 font-medium">Buttons</h3><div class="mt-3 flex flex-wrap gap-2">{#each current.buttons as button,i}<div class="rounded-md border px-3 py-2 text-xs" class:bg-primary={button.pressed} class:text-primary-foreground={button.pressed}>{current.mapping==='standard'?(names[i] ?? `Button ${i}`):`Button ${i}`}<span class="ml-2 font-mono">{button.value.toFixed(2)}</span></div>{/each}</div>
    <h3 class="mt-6 font-medium">Raw axes</h3><div class="mt-3 grid gap-3 sm:grid-cols-2">{#each current.axes as axis,i}<div class="rounded-md border p-3 text-xs">Axis {i}: <span class="font-mono">{axis.toFixed(3)}</span><meter class="mt-2 w-full" min="-1" max="1" value={axis}></meter></div>{/each}</div>
  {/if}
</div>
<style>.stick{position:relative;width:160px;height:160px;border:1px solid var(--border);border-radius:50%;margin:24px auto;background:var(--muted)}.cross{position:absolute;background:var(--border)}.horizontal{top:50%;height:1px;width:100%}.vertical{left:50%;width:1px;height:100%}.dot{position:absolute;width:12px;height:12px;border-radius:50%;background:var(--primary);transform:translate(-50%,-50%)}</style>
