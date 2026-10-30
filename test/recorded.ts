// MSW handlers that serve the recorded upstream exchanges in test/fixtures,
// keyed exactly like e2e/mock-upstreams.ts so unit and e2e tests share data.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { http, HttpResponse } from 'msw'

export const MOCK_BASE = 'http://upstream.test'
const ROOT = path.resolve(import.meta.dirname, 'fixtures')

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

function recorded(source: string, method: string, url: URL, body: string) {
  url.searchParams.delete('sourceapp')
  url.searchParams.sort()
  const file = path.join(
    ROOT,
    source,
    `${hash(`${method} ${url.pathname}${url.search} ${body}`)}.json`,
  )
  if (!existsSync(file)) return new HttpResponse(`unrecorded ${source} request`, { status: 599 })
  const rec = JSON.parse(readFileSync(file, 'utf8')) as {
    response: { status: number; contentType: string; body: string }
  }
  return new HttpResponse(rec.response.body, {
    status: rec.response.status,
    headers: { 'content-type': rec.response.contentType },
  })
}

export const recordedHandlers = [
  http.post(`${MOCK_BASE}/irrd/graphql/`, async ({ request }) => {
    const body = JSON.stringify(JSON.parse(await request.text()))
    return recorded('irrd', 'POST', new URL(request.url), body)
  }),
  http.get(`${MOCK_BASE}/ripestat/*`, ({ request }) =>
    recorded('ripestat', 'GET', new URL(request.url), ''),
  ),
]

export function fixtureText(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8')
}

/** Point every upstream at the recorded mock. Call before importing server modules' env(). */
export function useRecordedEnv() {
  process.env.IRRD_GRAPHQL_URL = `${MOCK_BASE}/irrd/graphql/`
  process.env.RIPESTAT_URL = `${MOCK_BASE}/ripestat`
  process.env.BGPTOOLS_URL = `${MOCK_BASE}/bgptools`
  process.env.BULK_DATASETS_ENABLED = 'false'
  process.env.CACHE_TTL_SECONDS = '0'
  process.env.UPSTREAM_TIMEOUT_MS = '1000'
}
