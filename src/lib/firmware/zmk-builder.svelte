<script lang="ts">
  import { onMount, type Snippet } from 'svelte'
  import { ArrowUpRightIcon } from '@lucide/svelte'
  import { base } from '$app/paths'
  import { Button } from '$lib/components/ui/button'
  import { t } from '$lib/i18n'
  import type { CatalogEntry, ModuleAuthor } from '$lib/zmk/module-catalog'
  import FirmwareProgress from './firmware-progress.svelte'
  import { moduleSettings, numWord } from './module-settings'

  type Target = { board: string; shield?: string; snippet?: string; 'artifact-name'?: string }
  type Source = { id: string; sha: string; repository: string; targets: Target[]; projects: { name: string; url: string; revision: string }[] }
  type Job = { id: string; stage: string; file?: string; sha256?: string; bytes?: number; progress?: number; error?: string; detail?: string }
  type ModuleOption = Pick<CatalogEntry, 'name' | 'repository' | 'summary' | 'author'> & {
    id?: string | null; editorUrl?: string; sourceName?: string
  }
  let { catalog, connectedModules, authorCredit }: {
    catalog: ModuleOption[]; connectedModules: Snippet; authorCredit: Snippet<[ModuleAuthor?]>
  } = $props()
  const buildsAvailable = import.meta.env.VITE_FIRMWARE_BUILDS !== 'disabled'
  const api = base + '/api/firmware'
  let url = $state(''), revision = $state('')
  let source = $state<Source>(), target = $state(0), busy = $state(false), error = $state('')
  let selected = $state<string[]>([]), query = $state('')
  let custom = $state(''), customRef = $state(''), extra = $state(''), overlay = $state('')
  let job = $state<Job>(), polling = $state(false)
  const running = $derived(polling || (!!job && job.stage !== 'Ready' && job.stage !== 'Failed'))
  const locked = $derived(busy || running)
  const normalize = (url: string) => url.trim().toLowerCase().replace(/\/$/, '').replace(/\.git$/, '')
  const included = $derived(new Set(source?.projects.map(p => normalize(p.url))))
  const supportsNumWord = $derived(source?.projects.some(project => normalize(project.url) === 'https://github.com/zmkfirmware/zmk' && /^v0\.3(?:\.\d+)?$/.test(project.revision)))
  const options: ModuleOption[] = $derived(supportsNumWord ? [numWord, ...catalog.filter(entry => normalize(entry.repository) !== numWord.repository)] : catalog)
  const visibleOptions = $derived(options.filter(entry => [entry.name, entry.summary && $t(entry.summary), entry.id, entry.sourceName, entry.author?.name, entry.repository]
    .some(value => value?.toLowerCase().includes(query.trim().toLowerCase()))))
  const selectedRepos = $derived(selected.filter(repo => options.some(entry => normalize(entry.repository) === repo)))
  const flags = $derived(moduleSettings([...selectedRepos, normalize(custom)]))
  const buildRepos = $derived(new Set([...included, ...selectedRepos, normalize(custom)]))
  const missingCustomSettings = $derived(buildRepos.has('https://github.com/cormoran/zmk-feature-os-detection') && !buildRepos.has('https://github.com/cormoran/zmk-feature-custom-settings'))
  const sessionKey = 'keyspensory-zmk-build-v1'
  const lifetime = new AbortController()

  onMount(() => {
    if (!buildsAvailable) return
    try {
      const pending = JSON.parse(sessionStorage.getItem(sessionKey) || 'null')
      if (pending?.job?.id && typeof pending.url === 'string') {
        ;({ url, revision, source, target, selected, custom, customRef, extra, overlay, job } = pending)
        if (job) void poll(job.id)
      }
    } catch { /* An old browser session can always start again. */ }
    return () => lifetime.abort()
  })
  async function request(path: string, body?: unknown) {
    const res = await fetch(api + path, body === undefined ? { signal: lifetime.signal } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: lifetime.signal,
    })
    if (!res.headers.get('content-type')?.includes('application/json')) throw Error('The firmware build service is unavailable.')
    const result = await res.json()
    if (!res.ok) throw Error(result.error || 'The firmware build service is unavailable.')
    return result
  }
  function message(e: unknown) { return e instanceof Error ? e.message : String(e) }
  function invalidate() {
    source = undefined; selected = []; job = undefined; error = ''
    try { sessionStorage.removeItem(sessionKey) } catch { /* Storage is optional. */ }
  }
  async function inspect(event: SubmitEvent) {
    event.preventDefault()
    invalidate(); busy = true
    try { source = await request('/inspect', { url, revision }); target = 0 }
    catch (e) { error = message(e) }
    finally { busy = false }
  }
  async function poll(id: string) {
    if (polling) return
    polling = true
    try {
      for (;;) {
        job = await request('/jobs/' + id) as Job
        if (job.stage === 'Ready' || job.stage === 'Failed') break
        await new Promise(resolve => setTimeout(resolve, 850))
        if (lifetime.signal.aborted) return
      }
    } catch (e) { if (!lifetime.signal.aborted) error = message(e) }
    finally { polling = false }
  }
  function clearResult() {
    if (!locked && job) {
      job = undefined
      try { sessionStorage.removeItem(sessionKey) } catch { /* Storage is optional. */ }
    }
  }
  function toggleModule(repo: string) {
    if (!source || locked) return
    selected = selected.includes(repo) ? selected.filter(value => value !== repo) : [...selected, repo]
    clearResult()
  }
  async function build(event: SubmitEvent) {
    event.preventDefault()
    if (!source || locked) return
    error = ''; busy = true
    try {
      const modules = selectedRepos.filter(url => !included.has(url)).map(url => ({ url, revision: supportsNumWord && url === numWord.repository ? numWord.revision : '' }))
      if (custom.trim() && !selectedRepos.includes(normalize(custom)) && !included.has(normalize(custom))) modules.push({ url: custom.trim(), revision: customRef.trim() })
      const settings = new Map([...flags, ...extra.split('\n').map(v => v.trim()).filter(Boolean)].map(v => [v.split('=')[0], v]))
      const buildOverlay = [supportsNumWord && selectedRepos.includes(numWord.repository) ? numWord.overlay : '', overlay].filter(Boolean).join('\n')
      const response = await request('/jobs', { source: source.id, target, modules, settings: [...settings.values()], overlay: buildOverlay })
      job = { id: response.id, stage: 'Queued', progress: 1 }
      try { sessionStorage.setItem(sessionKey, JSON.stringify({ url, revision, source, target, selected, custom, customRef, extra, overlay, job })) } catch {}
      void poll(response.id)
    } catch (e) { error = message(e) }
    finally { busy = false }
  }
</script>

<div class="grid min-w-0 gap-4">
  {#if buildsAvailable}
  <form class="grid gap-3 rounded-lg border p-4" onsubmit={inspect}>
    <label for="module-config-url" class="text-sm font-semibold">{$t('ZMK keyboard config URL')}</label>
    <div class="flex flex-col gap-2 sm:flex-row">
      <input id="module-config-url" class="field flex-1" type="url" placeholder="https://github.com/owner/zmk-config" required disabled={locked} bind:value={url} oninput={invalidate}/>
      <Button variant="outline" type="submit" disabled={locked || !url.trim()}>{$t(busy && !source ? 'Reading…' : 'Read configuration')}</Button>
    </div>
    <details class="text-sm text-muted-foreground" open={!!revision}>
      <summary class="cursor-pointer">{$t('Branch, tag or commit (optional)')}</summary>
      <input class="field mt-2 text-foreground" aria-label={$t('Branch, tag or commit (optional)')} disabled={locked} bind:value={revision} oninput={invalidate}/>
    </details>
  </form>
  {:else}
    <p class="rounded-lg border p-4 text-sm">{$t('Firmware compilation is available in the local configurator.')}</p>
  {/if}
  {@render connectedModules()}
  {#if source}
    <fieldset class="grid min-w-0 gap-3 rounded-lg border p-4" disabled={locked} oninput={clearResult}>
      <h2 class="font-semibold">{$t('Build target')}</h2>
      <p class="text-sm text-muted-foreground">{source.repository.split('/').slice(-2).join('/')} · <a class="underline" href={source.repository + '/tree/' + source.sha} target="_blank" rel="noreferrer">{source.sha.slice(0, 10)}</a></p>
      {#each source.projects.filter(p => p.name === 'zmk') as zmk}<p class="text-sm break-all">{zmk.url} · {zmk.revision}</p>{/each}
      {#if source.projects.some(p => p.name !== 'zmk')}
        <details class="text-sm"><summary class="cursor-pointer">{$t('In source configuration')}</summary>
          <ul class="mt-2 grid gap-1 text-muted-foreground">{#each source.projects.filter(p => p.name !== 'zmk') as project}<li class="break-all">{project.name} · {project.revision}</li>{/each}</ul>
        </details>
      {/if}
      <select aria-label={$t('Build target')} class="field" bind:value={target}>
        {#each source.targets as row, i}<option value={i}>{[row.board, row.shield, row.snippet, row['artifact-name']].filter(Boolean).join(' · ')}</option>{/each}
      </select>
    </fieldset>
  {/if}

  <section class="grid min-w-0 gap-3 rounded-lg border p-4" aria-label={$t('Available modules')}>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="font-semibold">{$t('Available modules')} <span class="text-muted-foreground">({options.length})</span></h2>
      <input class="min-w-0 rounded-md border bg-background px-3 py-1.5 text-sm" type="search" aria-label={$t('Search modules')} placeholder={$t('Search modules')} bind:value={query}/>
    </div>
    {#if buildsAvailable}<p class="text-sm text-muted-foreground">{$t(source ? 'Choose modules compatible with this ZMK version and keyboard hardware.' : 'Read the keyboard config to select modules for the build.')}</p>{/if}
    <ul class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {#each visibleOptions as entry ((entry.editorUrl ?? '') + '|' + entry.repository)}
        {@const repo = normalize(entry.repository)}
        <li class="flex min-w-0 flex-col gap-2 rounded-md border bg-card p-3 has-checked:border-ring">
          <div class="flex items-start justify-between gap-2">
            <label class="flex min-w-0 flex-1 items-start gap-2 text-sm font-semibold">
              <input class="mt-0.5" type="checkbox" disabled={!source || locked} checked={selected.includes(repo)} onchange={() => toggleModule(repo)}/>
              <span class="wrap-anywhere">{entry.name}</span>
            </label>
            <a href={entry.repository} target="_blank" rel="noopener noreferrer" aria-label={entry.name} title={entry.repository} class="rounded-sm text-muted-foreground hover:text-foreground">
              <ArrowUpRightIcon class="size-4" aria-hidden="true"/>
            </a>
          </div>
          {#if entry.summary}<p class="text-xs leading-relaxed text-muted-foreground wrap-anywhere">{$t(entry.summary)}</p>{/if}
          <div class="mt-auto flex flex-wrap items-center justify-between gap-2">
            {@render authorCredit(entry.author)}
            {#if included.has(repo)}<small class="text-muted-foreground">{$t('In source configuration')}</small>{/if}
          </div>
        </li>
      {:else}<li class="col-span-full py-2 text-sm text-muted-foreground">{$t('No matching modules.')}</li>{/each}
    </ul>
    {#if missingCustomSettings}<p class="text-sm">{$t('Host operating system requires the Custom settings module.')}</p>{/if}
    {#if flags.length}<p class="text-sm text-muted-foreground">{$t('These editors require a ZMK version with custom Studio RPC support.')}</p>{/if}
  </section>

  {#if source}
    <form class="grid gap-4" onsubmit={build} oninput={clearResult}>
      <fieldset class="min-w-0 rounded-lg border p-4" disabled={locked}>
        <details><summary class="cursor-pointer text-sm font-medium">{$t('Additional module and build settings')}</summary>
          <div class="mt-3 grid gap-3">
            <label class="grid gap-1 text-sm">{$t('Module repository URL')}<input class="field" type="url" bind:value={custom} placeholder="https://github.com/owner/zmk-module"/></label>
            <label class="grid gap-1 text-sm">{$t('Module revision (optional)')}<input class="field" bind:value={customRef}/></label>
            {#if flags.length}<pre class="overflow-x-auto text-xs">{flags.join('\n')}</pre>{/if}
            <label class="grid gap-1 text-sm">{$t('Additional firmware settings')}<textarea class="field font-mono" rows="3" bind:value={extra} placeholder="CONFIG_EXAMPLE=y"></textarea></label>
            <label class="grid gap-1 text-sm">{$t('Devicetree overlay (optional)')}<textarea class="field font-mono" rows="3" bind:value={overlay} placeholder="#include &lt;behaviors/num_word.dtsi&gt;"></textarea></label>
          </div>
        </details>
      </fieldset>
      <Button type="submit" class="justify-self-start" disabled={locked}>{$t('Build firmware')}</Button>
    </form>
  {/if}
  {#if error}<p role="alert" class="text-sm text-destructive">{$t(error)}</p>{/if}
  {#if job}
    <div class="grid gap-2 rounded-lg border p-4">
      {#key job.id}
        {#if job.progress !== undefined || job.stage === 'Ready'}
          <FirmwareProgress stage={job.stage} value={job.progress ?? 100}/>
        {:else}
          <strong role="status">{$t(job.stage)}</strong>
        {/if}
      {/key}
      {#if job.error}<p class="text-sm">{$t(job.error)}</p>{/if}
      {#if job.detail}<code class="text-sm wrap-anywhere">{job.detail}</code>{/if}
      {#if job.file && job.stage === 'Ready'}
        <Button class="justify-self-start" href={api + '/jobs/' + job.id + '/' + job.file} download={job.file}>{$t('Download firmware')}</Button>
        <span class="text-xs break-all">{job.file} · {Math.ceil((job.bytes ?? 0) / 1024)} KiB</span>
        <code class="text-xs break-all">SHA-256 {job.sha256}</code>
      {/if}
      {#if !polling && running}<Button variant="outline" class="justify-self-start" onclick={() => poll(job!.id)}>{$t('Refresh')}</Button>{/if}
      {#if ['Compiling firmware', 'Fetching dependencies', 'Verifying firmware', 'Failed', 'Ready'].includes(job.stage)}
        <a class="text-sm underline" target="_blank" rel="noreferrer" href={api + '/jobs/' + job.id + '/build.log'}>{$t('Build log')}</a>
      {/if}
    </div>
  {/if}
</div>

<style>
.field {min-width:0;width:100%;border:1px solid var(--border);border-radius:.375rem;background:var(--background);padding:.55rem .75rem;}
</style>
