// A bulk dataset that is downloaded on a schedule and held in memory. The app
// stays stateless: losing it on restart only means a fresh download.

import { createReadStream, createWriteStream, type WriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { env } from './env'
import { recordFailure, recordSuccess, type SourceName } from './health'

export interface DatasetStatus {
  name: string
  loadedAt: string | null
  loading: boolean
  lastError: string | null
  size: number | null
}

export interface DatasetOptions<T> {
  name: string
  source: SourceName
  refreshSeconds: number
  retrySeconds: number
  enabled: () => boolean
  load: () => Promise<T>
  size?: (data: T) => number
}

export class Dataset<T> {
  private data: T | null = null
  private loadedAt: string | null = null
  private lastError: string | null = null
  private loading: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private started = false
  private readonly options: DatasetOptions<T>

  constructor(options: DatasetOptions<T>) {
    this.options = options
  }

  /** Idempotent. Kicks off the first download and schedules refreshes. */
  start(): void {
    if (this.started || !this.options.enabled()) return
    this.started = true
    void this.refresh()
  }

  /** Current data, or null while the first download is pending or failing. */
  get(): T | null {
    this.start()
    return this.data
  }

  /** Wait up to timeoutMs for the first load. Returns whatever is available. */
  async ready(timeoutMs: number): Promise<T | null> {
    this.start()
    if (this.data !== null || !this.loading) return this.data
    await Promise.race([this.loading, new Promise((r) => setTimeout(r, timeoutMs).unref())])
    return this.data
  }

  status(): DatasetStatus {
    return {
      name: this.options.name,
      loadedAt: this.loadedAt,
      loading: this.loading !== null,
      lastError: this.lastError,
      size: this.data !== null && this.options.size ? this.options.size(this.data) : null,
    }
  }

  /** Tests: inject data directly and mark the dataset as loaded. */
  set(data: T | null): void {
    this.started = true
    this.data = data
    this.loadedAt = data === null ? null : new Date().toISOString()
  }

  private schedule(seconds: number): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.refresh(), seconds * 1000)
    this.timer.unref()
  }

  private refresh(): Promise<void> {
    if (this.loading) return this.loading
    const started = Date.now()
    this.loading = this.options
      .load()
      .then((data) => {
        this.data = data
        this.loadedAt = new Date().toISOString()
        this.lastError = null
        recordSuccess(this.options.source)
        const size = this.options.size ? ` (${this.options.size(data)} rows)` : ''
        console.info(`[dataset] ${this.options.name} loaded in ${Date.now() - started} ms${size}`)
        this.schedule(this.options.refreshSeconds)
      })
      .catch((err: unknown) => {
        this.lastError = err instanceof Error ? err.message : String(err)
        recordFailure(this.options.source, err)
        console.warn(`[dataset] ${this.options.name} failed: ${this.lastError}`)
        this.schedule(this.options.retrySeconds)
      })
      .finally(() => {
        this.loading = null
      })
    return this.loading
  }
}

export interface FetchLinesOptions {
  headers?: Record<string, string>
  timeoutMs: number
  /**
   * When BULK_CACHE_DIR is set, the raw download is kept on disk under this
   * name and reused while younger than maxAgeSeconds. This keeps restarts and
   * dev reloads from re-downloading (bgp.tools asks for 30 minutes between
   * fetches). Losing the directory is harmless.
   */
  cache?: { name: string; maxAgeSeconds: number }
}

function splitter(onLine: (line: string) => void) {
  let buffer = ''
  return {
    push(chunk: string) {
      const lines = (buffer + chunk).split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) onLine(line.endsWith('\r') ? line.slice(0, -1) : line)
    },
    end() {
      if (buffer.length > 0) onLine(buffer)
      buffer = ''
    },
  }
}

/** Stream a text download line by line without holding the whole body. */
export async function fetchLines(
  url: string,
  options: FetchLinesOptions,
  onLine: (line: string) => void,
): Promise<void> {
  const dir = env().BULK_CACHE_DIR
  const file = dir && options.cache ? path.join(dir, `${options.cache.name}.txt`) : null

  if (file && options.cache) {
    const info = await stat(file).catch(() => null)
    if (info && Date.now() - info.mtimeMs < options.cache.maxAgeSeconds * 1000) {
      const lines = splitter(onLine)
      for await (const chunk of createReadStream(file, { encoding: 'utf8' }))
        lines.push(chunk as string)
      lines.end()
      return
    }
  }

  const response = await fetch(url, {
    headers: options.headers,
    signal: AbortSignal.timeout(options.timeoutMs),
  })
  if (!response.ok || !response.body)
    throw new Error(`HTTP ${response.status} from ${new URL(url).host}`)

  // The cache is an optimisation: if it cannot be written, load without it.
  let out: WriteStream | null = null
  const tmp = file ? `${file}.${process.pid}.tmp` : null
  if (tmp && dir) {
    try {
      await mkdir(dir, { recursive: true })
      out = await openForWrite(tmp)
    } catch (err) {
      console.warn(`[dataset] cache ${dir} not writable, continuing without it: ${String(err)}`)
      out = null
    }
  }
  const lines = splitter(onLine)
  try {
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      out?.write(value)
      lines.push(value)
    }
    lines.end()
  } catch (err) {
    out?.destroy()
    if (tmp) await rm(tmp, { force: true })
    throw err
  }
  if (out && tmp && file) {
    const stream = out
    try {
      await new Promise<void>((resolve, reject) =>
        stream.end((err?: Error | null) => (err ? reject(err) : resolve())),
      )
      await rename(tmp, file)
    } catch (err) {
      console.warn(`[dataset] could not save ${file}: ${String(err)}`)
      await rm(tmp, { force: true }).catch(() => undefined)
    }
  }
}

/** Open a write stream and surface open errors (permissions) as a rejection. */
function openForWrite(file: string): Promise<WriteStream> {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(file, { encoding: 'utf8' })
    stream.once('open', () => resolve(stream))
    stream.once('error', reject)
  })
}

/**
 * Keep one Dataset per name for the life of the process. Vite's dev server
 * re-evaluates modules on change; without this every edit would trigger a
 * fresh bulk download.
 */
export function singletonDataset<T>(options: DatasetOptions<T>): Dataset<T> {
  const g = globalThis as { __irrxDatasets?: Map<string, Dataset<unknown>> }
  g.__irrxDatasets ??= new Map()
  const existing = g.__irrxDatasets.get(options.name)
  if (existing) return existing as Dataset<T>
  const created = new Dataset(options)
  g.__irrxDatasets.set(options.name, created as Dataset<unknown>)
  return created
}
