// Record/replay stand-in for every upstream, used by the Playwright suite so
// tests need no network. In replay mode (default) it serves recorded real
// responses from test/fixtures and fails loudly on anything unrecorded. In
// record mode (MOCK_RECORD=1) it forwards to the real upstreams and saves
// what it sees. Bulk dumps come from BULK_SOURCE_DIR in record mode so
// bgp.tools is never downloaded more often than its policy allows.
//
// Paths:  /irrd/graphql/      IRRd GraphQL (POST)
//         /ripestat/data/...  RIPEstat Data API
//         /bgptools/...       table.jsonl, asns.csv
//         /rpki/...           Routinator /csv and /api/v1/status
//         /rir/nro, /rir/registrobr
//         /fail/...           always 503, for partial-failure tests

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'

const PORT = Number(process.env.MOCK_PORT ?? 3199)
const RECORD = process.env.MOCK_RECORD === '1'
const ROOT = path.resolve(import.meta.dirname, '..', 'test', 'fixtures')
const BULK_SOURCE_DIR =
  process.env.BULK_SOURCE_DIR ?? path.resolve(import.meta.dirname, '..', '.cache')

const REAL = {
  irrd: process.env.REAL_IRRD_GRAPHQL_URL ?? 'https://rr.ntt.net/graphql/',
  ripestat: 'https://stat.ripe.net',
  rpki: process.env.REAL_RPKI_VALIDATOR_URL ?? 'http://localhost:8323',
}

const BULK: Record<string, { fixture: string; source: string }> = {
  '/bgptools/table.jsonl': { fixture: 'bgptools/table.jsonl', source: 'bgptools-table.txt' },
  '/bgptools/asns.csv': { fixture: 'bgptools/asns.csv', source: 'bgptools-asns.txt' },
  '/rir/nro': { fixture: 'rirstats/nro-delegated-stats.txt', source: 'nro-delegated.txt' },
  '/rir/registrobr': { fixture: 'rirstats/registrobr.txt', source: 'registrobr.txt' },
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

interface Recorded {
  request: { method: string; url: string; body?: unknown }
  response: { status: number; contentType: string; body: string }
}

function send(res: ServerResponse, status: number, contentType: string, body: string) {
  res.writeHead(status, { 'content-type': contentType })
  res.end(body)
}

/** Recorded exchange file for a request. RIPEstat's sourceapp is ignored. */
function exchangeFile(source: string, method: string, url: URL, body: string): string {
  url.searchParams.delete('sourceapp')
  url.searchParams.sort()
  const key = `${method} ${url.pathname}${url.search} ${body}`
  return path.join(ROOT, source, `${hash(key)}.json`)
}

async function replayOrRecord(
  res: ServerResponse,
  source: string,
  method: string,
  url: URL,
  body: string,
  realUrl: string,
) {
  const file = exchangeFile(source, method, new URL(url), body)
  if (!RECORD) {
    if (!existsSync(file)) {
      console.error(
        `[mock] UNRECORDED ${source} ${method} ${url.pathname}${url.search} ${body.slice(0, 200)}`,
      )
      return send(res, 599, 'text/plain', `unrecorded request to ${source}`)
    }
    const rec = JSON.parse(await readFile(file, 'utf8')) as Recorded
    return send(res, rec.response.status, rec.response.contentType, rec.response.body)
  }
  const upstream = await fetch(realUrl, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: method === 'POST' ? body : undefined,
  })
  const text = await upstream.text()
  const contentType = upstream.headers.get('content-type') ?? 'application/json'
  const rec: Recorded = {
    request: {
      method,
      url: `${url.pathname}${url.search}`,
      body: body ? (JSON.parse(body) as unknown) : undefined,
    },
    response: { status: upstream.status, contentType, body: text },
  }
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(rec, null, 2)}\n`)
  return send(res, upstream.status, contentType, text)
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const method = req.method ?? 'GET'
  const body = method === 'POST' ? await readBody(req) : ''
  const p = url.pathname

  if (p === '/__health') return send(res, 200, 'text/plain', 'ok')
  if (p.startsWith('/fail'))
    return send(res, 503, 'text/plain', 'upstream deliberately unavailable')

  const bulk = BULK[p]
  if (bulk) {
    const file = RECORD ? path.join(BULK_SOURCE_DIR, bulk.source) : path.join(ROOT, bulk.fixture)
    return send(res, 200, 'text/plain', await readFile(file, 'utf8'))
  }

  if (p.startsWith('/irrd/graphql')) {
    // Normalise whitespace-insensitive JSON so key order does not matter.
    const normal = body ? JSON.stringify(JSON.parse(body)) : ''
    return replayOrRecord(res, 'irrd', method, url, normal, REAL.irrd)
  }
  if (p.startsWith('/ripestat/')) {
    const real = new URL(p.replace(/^\/ripestat/, '') + url.search, REAL.ripestat)
    real.searchParams.set('sourceapp', 'irrexplorer-ng-fixtures')
    return replayOrRecord(res, 'ripestat', method, url, '', real.toString())
  }
  if (p === '/rpki/csv') {
    const file = path.join(ROOT, 'rpki/vrps.csv')
    if (RECORD) {
      const upstream = await fetch(`${REAL.rpki}/csv`)
      return send(res, upstream.status, 'text/csv', await upstream.text())
    }
    return send(res, 200, 'text/csv', await readFile(file, 'utf8'))
  }
  if (p === '/rpki/api/v1/status') {
    return replayOrRecord(res, 'rpki', method, url, '', `${REAL.rpki}/api/v1/status`)
  }
  return send(res, 404, 'text/plain', `mock has no route for ${p}`)
}

createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    console.error('[mock] error', err)
    send(res, 500, 'text/plain', String(err))
  })
}).listen(PORT, () => {
  console.log(`[mock] upstreams on :${PORT} (${RECORD ? 'RECORD' : 'replay'})`)
})
