<script lang="ts">
  import { onMount } from 'svelte'
  import { SettingsIcon } from '@lucide/svelte'
  import { Button, buttonVariants } from '$lib/components/ui/button'
  import * as Dialog from '$lib/components/ui/dialog'
  import ZmkBuilder from '$lib/firmware/zmk-builder.svelte'
  import type StudioPanel from './studio-panel.svelte'
  import { t } from '$lib/i18n'
  import { canonicalSource, fetchCatalog, matchesModule, official, officialUrl, savedSources, storageKey, type CatalogSource, type ModuleAuthor } from './module-catalog'
  import { moduleEditors } from './module-protocol'

  type StudioSessionPanel = ReturnType<typeof StudioPanel>
  let { keyboard }: { keyboard?: ReturnType<StudioSessionPanel['moduleTools']> } = $props()

  let sources = $state.raw<CatalogSource[]>([official])
  let pending = $state<string[]>([])
  let issues = $state<Record<string, string>>({})
  let sourceInput = $state('')
  let adding = $state(false)
  let formError = $state('')
  const lifetime = new AbortController()
  const entries = $derived(sources.flatMap(source => source.modules.map(entry => {
    // Fill in metadata missing from older catalogs only for the same upstream module.
    const upstream = official.modules.find(item => item.repository === entry.repository &&
      (entry.id ? item.id === entry.id : item.editorUrl === entry.editorUrl))
    const author = entry.author ?? upstream?.author
    const summary = entry.summary || upstream?.summary
    const description = summary ? $t(summary) : entry.id ? $t('Works with firmware that reports {id}.', { id: entry.id }) : $t('Matches by editor URL')
    return { entry, source, description, author }
  })))
  const catalog = $derived.by(() => {
    const seen = new Set<string>()
    return entries.flatMap(({ entry, source, description, author }) => {
      const key = entry.repository + '|' + entry.editorUrl.replace(/\/$/, '')
      if (seen.has(key)) return []
      seen.add(key)
      return [{ ...entry, summary: description, author, sourceName: source.name }]
    })
  })

  function remember(next: CatalogSource[]) {
    localStorage.setItem(storageKey, JSON.stringify(next.filter(source => source.updated > 0)))
    sources = next
  }

  async function load(input: string, add = false) {
    let url: string
    try { url = canonicalSource(input) } catch (error) { formError = message(error); return }
    if (add && sources.some(source => source.url === url)) {
      formError = 'This repository is already in your catalog.'
      return
    }
    if (pending.includes(url)) return
    if (add) { adding = true; formError = '' }
    pending = [...pending, url]
    issues[url] = ''
    try {
      const result = await fetchCatalog(url, AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000)]))
      if (lifetime.signal.aborted) return
      const latest = savedSources()
      const exists = latest.some(source => source.url === url)
      if (add || exists) {
        remember(exists ? latest.map(source => source.url === url ? result : source) : [...latest, result])
        if (add) sourceInput = ''
      }
    } catch (error) {
      if (lifetime.signal.aborted) return
      if (add) formError = message(error)
      else issues[url] = message(error)
    } finally {
      pending = pending.filter(value => value !== url)
      if (add) adding = false
    }
  }

  function message(error: unknown) {
    if (error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError'))
      return 'Could not load the repository. Check the URL and try again later.'
    if (error instanceof DOMException) return 'This browser could not save the repository.'
    return error instanceof Error ? error.message : String(error)
  }

  function remove(url: string) {
    if (url === officialUrl) return
    try { remember(savedSources().filter(source => source.url !== url)) }
    catch (error) { issues[url] = message(error) }
  }

  onMount(() => {
    sources = savedSources()
    for (const source of sources) {
      if (Date.now() - source.updated > 86400000) void load(source.url)
    }
    const sync = (event: StorageEvent) => {
      if (!event.key || event.key === storageKey) sources = savedSources()
    }
    window.addEventListener('storage', sync)
    return () => { lifetime.abort(); window.removeEventListener('storage', sync) }
  })
</script>

{#snippet authorCredit(author?: ModuleAuthor)}
  {#if author?.url}
    <a href={author.url} target="_blank" rel="noopener noreferrer author"
      class="relative z-10 self-start text-xs text-muted-foreground underline-offset-2 wrap-anywhere hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">
      {$t('By {name}', { name: author.name })}
    </a>
  {:else}
    <span class="text-xs text-muted-foreground wrap-anywhere">{author ? $t('By {name}', { name: author.name }) : $t('Author not listed')}</span>
  {/if}
{/snippet}

{#snippet connectedModules()}
  {#if keyboard}
    <details class="min-w-0 rounded-lg border p-4">
      <summary class="cursor-pointer font-semibold">{$t('On this keyboard')} · {keyboard.name}</summary>
      <section class="mt-3 grid gap-3" aria-label={$t('On this keyboard')}>
        <div class="flex flex-wrap items-center gap-2">
          <span class="mr-auto text-sm text-muted-foreground">{$t(keyboard.unlocked ? 'Unlocked' : 'Locked')}</span>
          <Button size="sm" variant="outline" disabled={!keyboard.unlocked || keyboard.occupied} onclick={keyboard.scan}>{$t('Scan modules')}</Button>
          <Button size="sm" variant="outline" disabled={keyboard.occupied} onclick={keyboard.read}>{$t('Read keyboard')}</Button>
          <Button size="sm" variant="outline" disabled={keyboard.occupied} onclick={keyboard.close}>{$t(keyboard.sample ? 'Close sample session' : 'Disconnect Studio')}</Button>
        </div>
        {#if keyboard.status}<p class="text-sm" role="status">{$t(keyboard.status)}</p>{/if}
        <p class="text-sm text-muted-foreground" role="status">{$t(keyboard.unlocked ? keyboard.moduleStatus : 'Unlock the keyboard to scan its modules.')}</p>
        {#if keyboard.unlocked}
          <ul class="editor-grid">
            {#each keyboard.modules as item}
              {@const match = entries.find(({ entry }) => matchesModule(item, entry))}
              {@const native = moduleEditors.get(item.identifier)}
              <li class="flex min-w-0 flex-col items-start gap-2 rounded-lg border bg-card p-3.5 text-card-foreground">
                <h3 class="text-sm font-semibold leading-snug wrap-anywhere">{match?.entry.name ?? native?.title ?? $t('Unrecognized module')}</h3>
                {#if match}
                  <p class="text-xs leading-relaxed text-muted-foreground wrap-anywhere">{match.description}</p>
                {:else}
                  <code class="text-xs wrap-anywhere">{item.identifier}</code>
                  <p class="text-xs leading-relaxed text-muted-foreground wrap-anywhere">{$t('Add its URL in repository settings to find an editor.')}</p>
                {/if}
                {@render authorCredit(match?.author)}
                {#if native}<p class="text-sm">{$t(keyboard.moduleValues[item.index] ?? 'Reading…')}</p>{/if}
                {#if match}
                  <Button size="sm" class="mt-auto h-auto min-h-8 max-w-full whitespace-normal" variant="outline" disabled={keyboard.occupied} href={match.entry.editorUrl} target="_blank" rel="noopener noreferrer"
                    onclick={event => {
                      if (!keyboard || keyboard.occupied) event.preventDefault()
                      else if (!keyboard.sample) keyboard.close()
                    }}>{$t(keyboard.sample ? 'Open editor' : 'Disconnect and open editor')} ↗</Button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </details>
  {/if}
{/snippet}

<section class="mx-auto grid w-full max-w-5xl gap-4 p-5 sm:p-6">
  <header class="flex items-center justify-between gap-3">
    <h1 class="text-2xl font-semibold">{$t('Studio modules')}</h1>
    <Dialog.Root>
      <Dialog.Trigger class={buttonVariants({ variant: 'outline', size: 'icon-sm', class: 'shrink-0' })}
        aria-label={$t('Repository settings')} title={$t('Repository settings')}>
        <SettingsIcon aria-hidden="true"/>
      </Dialog.Trigger>
      <Dialog.Content class="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <Dialog.Header>
          <Dialog.Title>{$t('Repository settings')}</Dialog.Title>
          <Dialog.Description>{$t('Manage the repositories used to find module editors.')}</Dialog.Description>
        </Dialog.Header>
        <ul class="divide-y">
          {#each sources as source (source.url)}
            <li class="py-2">
              <div class="flex flex-wrap items-center gap-2">
                <div class="min-w-0 basis-full sm:mr-auto sm:flex-1">
                  <div class="text-sm font-medium wrap-anywhere">{source.name}</div>
                  <a class="block text-xs text-muted-foreground underline underline-offset-2 wrap-anywhere hover:text-foreground" target="_blank" rel="noopener noreferrer" href={source.url}>{source.url}</a>
                  <div class="text-xs text-muted-foreground">{source.url === officialUrl ? $t('Official catalog') : $t('Community repository')} · {$t('{count} editors', { count: source.modules.length })}</div>
                </div>
                <Button size="sm" variant="outline" disabled={pending.includes(source.url)} onclick={() => load(source.url)}>{$t('Refresh')}</Button>
                {#if source.url !== officialUrl}
                  <Button size="sm" variant="ghost" disabled={pending.includes(source.url)} onclick={() => remove(source.url)}>{$t('Remove')}</Button>
                {/if}
              </div>
              {#if issues[source.url]}<p role="status" class="mt-1 text-sm text-muted-foreground">{$t(issues[source.url])} {$t('Showing the saved catalog.')}</p>{/if}
            </li>
          {/each}
        </ul>
        <form class="grid gap-2" onsubmit={event => { event.preventDefault(); void load(sourceInput, true) }}>
          <label class="text-sm font-medium" for="studio-repository">{$t('Repository URL')}</label>
          <div class="flex flex-wrap gap-2">
            <input id="studio-repository" type="url" required bind:value={sourceInput} disabled={adding}
              placeholder="https://github.com/owner/repository" class="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"/>
            <Button type="submit" disabled={adding || !sourceInput.trim()}>{$t(adding ? 'Adding…' : 'Add repository')}</Button>
          </div>
          {#if formError}<p class="text-sm text-destructive" role="alert">{$t(formError)}</p>{/if}
        </form>
      </Dialog.Content>
    </Dialog.Root>
  </header>
  <ZmkBuilder {catalog} {connectedModules} {authorCredit}/>
</section>

<style>
  .editor-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
    gap: 0.625rem;
  }
</style>
