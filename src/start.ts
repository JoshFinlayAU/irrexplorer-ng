import { createMiddleware, createStart } from '@tanstack/react-start'

const COMPRESSIBLE = /json|html|javascript|text\/(?!event-stream)|x-tss|xml|csv/

/**
 * Gzip text responses. ASN pages for large networks carry tens of megabytes of
 * JSON (in the SSR payload and server function responses), which shrinks about
 * tenfold. A reverse proxy that compresses on its own sees content-encoding set
 * and leaves it alone.
 */
const compress = createMiddleware().server(async ({ next, request }) => {
  const result = await next()
  const res = result.response
  const accepts = /\bgzip\b/.test(request.headers.get('accept-encoding') ?? '')
  const type = res.headers.get('content-type') ?? ''
  if (!accepts || !res.body || res.headers.has('content-encoding') || !COMPRESSIBLE.test(type)) {
    return result
  }
  const headers = new Headers(res.headers)
  headers.set('content-encoding', 'gzip')
  headers.delete('content-length')
  headers.append('vary', 'accept-encoding')
  // Node's gzip with a sync flush per write, so streamed HTML and framed
  // server-function responses still arrive chunk by chunk. Imported here so
  // it never reaches the client bundle.
  const zlib = await import('node:zlib')
  const { Readable } = await import('node:stream')
  const gzip = zlib.createGzip({ flush: zlib.constants.Z_SYNC_FLUSH })
  const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
  const body = Readable.toWeb(source.pipe(gzip)) as unknown as ReadableStream<Uint8Array>
  return new Response(body, { status: res.status, statusText: res.statusText, headers })
})

/** Conservative security headers that do not interfere with the inline theme script. */
const securityHeaders = createMiddleware().server(async ({ next }) => {
  const result = await next()
  const res = result.response
  const headers = new Headers(res.headers)
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  headers.set('x-frame-options', 'DENY')
  headers.set(
    'content-security-policy',
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  )
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
})

export const startInstance = createStart(() => ({
  // Outermost first: headers wrap the (possibly compressed) response.
  requestMiddleware: [securityHeaders, compress],
}))
