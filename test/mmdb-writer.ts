// A minimal MaxMind DB writer and tarball builder, for tests and the e2e mock.
// It writes an IPv6 tree (IPv4 under ::/96) with 24-bit records, which is all
// mmdb-lib needs to read it like a real GeoLite2 download.
// Format: https://maxmind.github.io/MaxMind-DB/

import { gzipSync } from 'node:zlib'

type Value = string | number | bigint | boolean | Value[] | { [key: string]: Value }

interface TreeNode {
  children: [TreeNode | number | null, TreeNode | number | null]
}

function control(type: number, size: number): number[] {
  const out: number[] = []
  let first = type <= 7 ? type << 5 : 0
  let extra: number[] = []
  if (size < 29) first |= size
  else if (size < 285) {
    first |= 29
    extra = [size - 29]
  } else if (size < 65821) {
    first |= 30
    const s = size - 285
    extra = [s >> 8, s & 255]
  } else {
    first |= 31
    const s = size - 65821
    extra = [(s >> 16) & 255, (s >> 8) & 255, s & 255]
  }
  out.push(first)
  if (type > 7) out.push(type - 7)
  return [...out, ...extra]
}

function uintBytes(value: bigint): number[] {
  const out: number[] = []
  while (value > 0n) {
    out.unshift(Number(value & 255n))
    value >>= 8n
  }
  return out
}

export function encode(value: Value): number[] {
  if (typeof value === 'string') {
    const bytes = [...Buffer.from(value, 'utf8')]
    return [...control(2, bytes.length), ...bytes]
  }
  if (typeof value === 'boolean') return control(14, value ? 1 : 0)
  if (typeof value === 'bigint') {
    const bytes = uintBytes(value)
    return [...control(9, bytes.length), ...bytes]
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 0 && value < 2 ** 32) {
      const bytes = uintBytes(BigInt(value))
      return [...control(value < 65536 ? 5 : 6, bytes.length), ...bytes]
    }
    const buf = Buffer.alloc(8)
    buf.writeDoubleBE(value)
    return [...control(3, 8), ...buf]
  }
  if (Array.isArray(value)) return [...control(11, value.length), ...value.flatMap(encode)]
  const entries = Object.entries(value)
  return [
    ...control(7, entries.length),
    ...entries.flatMap(([k, v]) => [...encode(k), ...encode(v)]),
  ]
}

function parseNetwork(cidr: string): { bits: bigint; length: number } {
  const [addr, len] = cidr.split('/') as [string, string | undefined]
  if (addr.includes(':')) {
    const [head, tail] = addr.split('::') as [string, string | undefined]
    const h = head ? head.split(':') : []
    const t = tail !== undefined && tail ? tail.split(':') : []
    const groups =
      tail === undefined ? h : [...h, ...Array<string>(8 - h.length - t.length).fill('0'), ...t]
    const bits = groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g || '0', 16)), 0n)
    return { bits, length: len === undefined ? 128 : Number(len) }
  }
  const bits = addr.split('.').reduce((acc, o) => (acc << 8n) | BigInt(Number(o)), 0n)
  return { bits, length: 96 + (len === undefined ? 32 : Number(len)) }
}

export interface MmdbEntry {
  network: string
  data: Value
}

/**
 * Build a database. Later entries win where networks overlap, so list less
 * specific networks first.
 */
export function writeMmdb(
  entries: readonly MmdbEntry[],
  options: { databaseType?: string; buildEpoch?: number } = {},
): Buffer {
  const root: TreeNode = { children: [null, null] }
  const data: number[] = []
  const offsets = new Map<string, number>()

  for (const entry of entries) {
    const key = JSON.stringify(entry.data, (_k, v: unknown) =>
      typeof v === 'bigint' ? `${v}n` : v,
    )
    let offset = offsets.get(key)
    if (offset === undefined) {
      offset = data.length
      data.push(...encode(entry.data))
      offsets.set(key, offset)
    }
    const { bits, length } = parseNetwork(entry.network)
    let node = root
    for (let depth = 0; depth < length; depth++) {
      const bit = Number((bits >> BigInt(127 - depth)) & 1n)
      if (depth === length - 1) {
        node.children[bit] = -1 - offset
        break
      }
      const child = node.children[bit]
      if (child === null || typeof child === 'number') {
        // Split an existing leaf so the rest of it keeps its data.
        const next: TreeNode = { children: [child, child] }
        node.children[bit] = next
        node = next
      } else node = child as TreeNode
    }
  }

  // Number nodes breadth first, then write records.
  const order: TreeNode[] = []
  const ids = new Map<TreeNode, number>()
  const queue = [root]
  while (queue.length > 0) {
    const n = queue.shift()!
    ids.set(n, order.length)
    order.push(n)
    for (const c of n.children) if (c !== null && typeof c !== 'number') queue.push(c)
  }
  const nodeCount = order.length
  const record = (c: TreeNode | number | null): number =>
    c === null ? nodeCount : typeof c === 'number' ? nodeCount + 16 + (-1 - c) : ids.get(c)!
  const tree = Buffer.alloc(nodeCount * 6)
  order.forEach((n, i) => {
    tree.writeUIntBE(record(n.children[0]), i * 6, 3)
    tree.writeUIntBE(record(n.children[1]), i * 6 + 3, 3)
  })

  const metadata = encode({
    node_count: nodeCount,
    record_size: 24,
    ip_version: 6,
    database_type: options.databaseType ?? 'GeoLite2-City',
    languages: ['en'],
    binary_format_major_version: 2,
    binary_format_minor_version: 0,
    build_epoch: BigInt(options.buildEpoch ?? 1793232000),
    description: { en: 'Test database' },
  })
  return Buffer.concat([
    tree,
    Buffer.alloc(16),
    Buffer.from(data),
    Buffer.from([0xab, 0xcd, 0xef]),
    Buffer.from('MaxMind.com', 'ascii'),
    Buffer.from(metadata),
  ])
}

function tarHeader(name: string, size: number): Buffer {
  const h = Buffer.alloc(512)
  h.write(name, 0, 100, 'utf8')
  h.write('0000644\0', 100, 'ascii')
  h.write('0000000\0', 108, 'ascii')
  h.write('0000000\0', 116, 'ascii')
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 'ascii')
  h.write(
    `${Math.floor(Date.now() / 1000)
      .toString(8)
      .padStart(11, '0')}\0`,
    136,
    'ascii',
  )
  h.write('        ', 148, 'ascii')
  h.write('0', 156, 'ascii')
  h.write('ustar\0', 257, 'ascii')
  h.write('00', 263, 'ascii')
  const sum = h.reduce((a, b) => a + b, 0)
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii')
  return h
}

/** A .tar.gz laid out like MaxMind's: EDITION_YYYYMMDD/{COPYRIGHT.txt,EDITION.mmdb}. */
export function maxmindTarball(edition: string, mmdb: Buffer, date = '20261030'): Buffer {
  const dir = `${edition}_${date}`
  const files: [string, Buffer][] = [
    [`${dir}/COPYRIGHT.txt`, Buffer.from('Test data\n')],
    [`${dir}/${edition}.mmdb`, mmdb],
  ]
  const parts: Buffer[] = []
  for (const [name, body] of files) {
    parts.push(tarHeader(name, body.length), body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  parts.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(parts))
}

/** City-shaped record, the subset of GeoLite2-City the app reads. */
export function cityRecord(o: {
  country: string
  countryName: string
  city?: string
  region?: string
  registered?: string
  lat?: number
  lon?: number
  radius?: number
}): Value {
  const rec: Record<string, Value> = {
    country: { iso_code: o.country, names: { en: o.countryName } },
    registered_country: { iso_code: o.registered ?? o.country, names: { en: o.countryName } },
  }
  if (o.city) rec.city = { names: { en: o.city } }
  if (o.region)
    rec.subdivisions = [{ iso_code: o.region.slice(0, 3).toUpperCase(), names: { en: o.region } }]
  if (o.lat !== undefined && o.lon !== undefined)
    rec.location = { latitude: o.lat, longitude: o.lon, accuracy_radius: o.radius ?? 100 }
  return rec
}
