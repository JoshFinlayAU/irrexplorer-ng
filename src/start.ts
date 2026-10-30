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
  return new Response(res.body.pipeThrough(new CompressionStream('gzip')), {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
})

export const startInstance = createStart(() => ({
  requestMiddleware: [compress],
}))
