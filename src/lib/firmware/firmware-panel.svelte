<script lang="ts">
  import { Switch } from '$lib/components/ui/switch'
  import { Button } from '$lib/components/ui/button'
  import { onMount } from 'svelte'
  let autoCheck=$state(true)
  onMount(()=>{autoCheck=localStorage.getItem('keyspensory-firmware-auto-check')!=='false'})
  let status=$state('Connect a supported Keyspensory board to check for firmware releases.')
</script>
<div class="panel"><h1>Firmware / OTA</h1><p class="muted">Firmware updates for boards maintained by Keyspensory.</p>
<div class="card"><h2>Firmware status</h2><dl><div><dt>Board identity</dt><dd>Awaiting hardware verification</dd></div><div><dt>Installed version</dt><dd>Not connected</dd></div><div><dt>Available release</dt><dd>Not checked</dd></div><div><dt>Update method</dt><dd>Detected from board capabilities</dd></div></dl><p class="muted" role="status">{status}</p><Button variant="outline" onclick={()=>status='No hardware connected. Release checks require a verified Keyspensory board identity and installed version.'}>Check for updates</Button><Button disabled>Install firmware update</Button></div>
<div class="card"><h2>Automatic updates</h2><div class="setting"><label for="auto-firmware">Check automatically when connected</label><Switch id="auto-firmware" bind:checked={autoCheck} onCheckedChange={value=>localStorage.setItem('keyspensory-firmware-auto-check',String(value))}/></div><p class="muted">New compatible releases will appear here with release notes. Installation runs through the update method supported by your board.</p></div>
<div class="card"><h2>Supported update paths</h2><p class="muted">USB DFU / native DFU tool, UF2 bootloader drive, and Bluetooth OTA. Each path needs its board-specific transport. Automatic UF2 copying requires permission to access the bootloader drive; native tools require a desktop bridge.</p><p class="muted">Third-party VIA, ZMK, and HMKconf boards remain excluded unless explicitly registered as your maintained hardware.</p></div></div>
<style>.panel{padding:32px;max-width:1200px;width:100%;margin:auto}h1{font-size:24px;font-weight:600}h2{font-size:15px;font-weight:600}.muted{font-size:13px;color:var(--muted-foreground);margin-top:8px}.card{border:1px solid var(--border);border-radius:8px;padding:24px;margin-top:24px;display:grid;gap:20px;max-width:760px}.setting,dl>div{display:flex;justify-content:space-between;gap:24px}dl>div{padding:12px 0;border-bottom:1px solid var(--border);font-size:14px}dt{color:var(--muted-foreground)}</style>
