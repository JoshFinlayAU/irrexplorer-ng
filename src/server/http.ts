// Shared fetch wrapper for upstream calls: timeout, JSON parsing, Zod
// validation at the boundary, and health bookkeeping.

import type { z } from 'zod'
import { env } from './env'
import { recordFailure, recordSuccess, type SourceName } from './health'

export class UpstreamError extends Error {
  readonly source: SourceName
  readonly status: number | undefined
  readonly timedOut: boolean

  constructor(
    source: SourceName,
    message: string,
    options: { status?: number; timedOut?: boolean } = {},
  ) {
    super(message)
    this.name = 'UpstreamError'
    this.source = source
    this.status = options.status
    this.timedOut = options.timedOut ?? false
  }
}

/** Record a semantic failure (HTTP fine, content not) and return the error to throw. */
export function failed(source: SourceName, message: string): UpstreamError {
  const err = new UpstreamError(source, message)
  recordFailure(source, err)
  return err
}

export interface FetchJsonOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export async function fetchJson<S extends z.ZodType>(
  source: SourceName,
  url: string,
  schema: S,
  options: FetchJsonOptions = {},
): Promise<z.infer<S>> {
  const timeoutMs = options.timeoutMs ?? env().UPSTREAM_TIMEOUT_MS
  try {
    let response: Response
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: { accept: 'application/json', ...options.headers },
        body: options.body,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new UpstreamError(source, `timed out after ${timeoutMs / 1000}s`, { timedOut: true })
      }
      throw new UpstreamError(
        source,
        `unreachable (${err instanceof Error ? err.message : String(err)})`,
      )
    }
    if (!response.ok) {
      throw new UpstreamError(source, `HTTP ${response.status}`, { status: response.status })
    }
    let json: unknown
    try {
      json = await response.json()
    } catch {
      throw new UpstreamError(source, 'returned a response that is not JSON')
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      throw new UpstreamError(
        source,
        `returned an unexpected response (${parsed.error.issues[0]?.message ?? 'invalid'})`,
      )
    }
    recordSuccess(source)
    return parsed.data
  } catch (err) {
    recordFailure(source, err)
    throw err
  }
}
