import { z } from 'zod'
import bundled from './official-catalog.json'
import type { StudioModule } from './module-protocol'

export const officialUrl = 'https://github.com/freather-keyspensory/zmk-module-catalog'
export const storageKey = 'keyspensory-studio-repositories-v1'

const https = z.string().url().refine(value => {
  const url = URL.canParse(value) ? new URL(value) : undefined
  return url?.protocol === 'https:' && !url.username && !url.password
})
const authorName = z.string().trim().min(1)
const authorProfile = z.object({ name: authorName, url: https.optional().catch(undefined) })
export type ModuleAuthor = z.infer<typeof authorProfile>
const entrySchema = z.object({
  author: z.union([authorProfile, authorName.transform((name): ModuleAuthor => ({ name }))]).optional().catch(undefined),
  summary: z.string().trim().optional(),
  id: z.string().min(1), name: z.string().trim().min(1), repository: https, editorUrl: https,
})
const manifestSchema = z.object({
  version: z.literal(1), name: z.string().trim().min(1), modules: z.array(entrySchema),
}).refine(catalog => new Set(catalog.modules.map(entry => entry.id)).size === catalog.modules.length)
const cachedEntry = entrySchema.extend({ id: entrySchema.shape.id.nullable() })
const sourceSchema = z.object({
  url: https, name: z.string().min(1), modules: z.array(cachedEntry), updated: z.number(),
})
export type CatalogEntry = z.infer<typeof cachedEntry>
export type CatalogSource = z.infer<typeof sourceSchema>
export const official: CatalogSource = { ...manifestSchema.parse(bundled), url: officialUrl, updated: 0 }

function locationOf(input: string) {
  const parsed = https.safeParse(input.trim())
  if (!parsed.success) throw Error('Enter a public GitHub repository or an HTTPS catalog JSON URL.')
  const url = new URL(parsed.data)
  const parts = url.pathname.split('/').filter(Boolean)
  const [owner, rawName, kind, ...tail] = parts
  if (['github.com', 'www.github.com', 'raw.githubusercontent.com'].includes(url.hostname)) {
    const repo = rawName?.replace(/\.git$/i, '')
    if (!/^[a-z\d-]+$/i.test(owner ?? '') || !repo || !/^[\w.-]+$/.test(repo)) throw Error('Invalid GitHub repository URL.')
    const slug = owner.toLowerCase() + '/' + repo.toLowerCase()
    const project = 'https://github.com/' + slug
    const api = 'https://api.github.com/repos/' + slug
    if (url.hostname !== 'raw.githubusercontent.com' && !kind) return { url: project, api, file: api + '/contents/catalog.json' }
    const raw = url.hostname === 'raw.githubusercontent.com'
    const segments = raw ? parts.slice(2) : tail
    if ((!raw && !['blob','raw'].includes(kind)) || segments.length < 2 || !segments.at(-1)?.endsWith('.json'))
      throw Error('Use the repository homepage or a link to its catalog JSON file.')
    // Raw URLs also accept fully qualified refs such as refs/heads/main.
    const refParts = segments[0] === 'refs' && ['heads','tags'].includes(segments[1]) ? segments.slice(2) : segments
    const [ref, ...path] = refParts
    if (!ref || !path.length) throw Error('Invalid GitHub repository URL.')
    return { url: project + '/blob/' + refParts.join('/'), file: api + '/contents/' + path.join('/') + '?ref=' + ref }
  }
  if (!url.pathname.endsWith('.json')) throw Error('Enter a public GitHub repository or an HTTPS catalog JSON URL.')
  url.hash = ''
  return { url: url.href, file: url.href }
}

export function canonicalSource(input: string) { return locationOf(input).url }

async function request(url: string, signal: AbortSignal, raw = false) {
  return fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache',
    headers: raw && url.startsWith('https://api.github.com/') ? { Accept: 'application/vnd.github.raw+json' } : {} })
}

export async function fetchCatalog(input: string, signal: AbortSignal): Promise<CatalogSource> {
  const source = locationOf(input)
  const response = await request(source.file, signal, true)
  if (response.ok) {
    const parsed = manifestSchema.safeParse(await response.json().catch(() => null))
    if (!parsed.success) throw Error('Invalid catalog. Check its version, module identifiers and HTTPS editor URLs.')
    return { url: source.url, name: parsed.data.name, modules: parsed.data.modules, updated: Date.now() }
  }
  if (response.status === 404 && source.api) {
    const metadata = await request(source.api, signal)
    if (metadata.ok) {
      const repo = await metadata.json()
      if (repo.has_pages && (await request(source.api + '/contents/zephyr/module.yml', signal)).ok) {
        const name = String(repo.name)
        const editorUrl = https.safeParse(repo.homepage || 'https://' + repo.owner.login + '.github.io/' + name + '/')
        if (editorUrl.success) return { url: source.url, name, updated: Date.now(),
          modules: [{ id: null, name, repository: source.url, editorUrl: editorUrl.data,
            summary: typeof repo.description === 'string' ? repo.description.trim() : undefined }] }
      }
      throw Error('This repository needs a catalog.json or a published ZMK module editor.')
    }
    if (metadata.status === 404) throw Error('Repository not found. Check that it is public.')
    throw Error('GitHub is unavailable or its request limit was reached. Try again later.')
  }
  if (response.status === 404) throw Error('Catalog file not found.')
  throw Error('Could not load the repository. Check the URL and try again later.')
}

export function savedSources(): CatalogSource[] {
  let data: unknown
  try { data = JSON.parse(localStorage.getItem(storageKey) ?? '[]') } catch { return [official] }
  const sources = new Map([[officialUrl, official]])
  if (Array.isArray(data)) for (const item of data) {
    const source = sourceSchema.safeParse(item)
    if (source.success && source.data.updated > 0) sources.set(source.data.url, source.data)
  }
  return [...sources.values()]
}

function editorAddress(value: string) {
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined
    url.protocol = 'https:'
    return url.href.replace(/\/$/, '')
  } catch { return undefined }
}

export function matchesModule(module: StudioModule, entry: CatalogEntry) {
  if (entry.id) return entry.id === module.identifier
  const address = editorAddress(entry.editorUrl)
  return !!address && module.uiUrls?.some(url => editorAddress(url) === address)
}
