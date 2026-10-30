// Special-use address space flagged on every overlapping prefix. Same table,
// same order and same names as the original IRR Explorer.

import { covers, parsePrefix, type Prefix } from '../ip'

const TABLE: readonly [string, string][] = [
  ['RFC1122', '0.0.0.0/8'],
  ['RFC1918', '10.0.0.0/8'],
  ['RFC6598', '100.64.0.0/10'],
  ['LOOPBACK', '127.0.0.0/8'],
  ['RFC1918', '172.16.0.0/12'],
  ['RFC5736', '192.0.0.0/24'],
  ['RFC1918', '192.168.0.0/16'],
  ['RFC3927', '169.254.0.0/16'],
  ['RFC5737', '192.0.2.0/24'],
  ['RFC2544', '198.18.0.0/15'],
  ['RFC5737', '198.51.100.0/24'],
  ['RFC5737', '203.0.113.0/24'],
  ['CLASS-E', '240.0.0.0/4'],
  ['IPv4-mapped', '::ffff:0:0/96'],
  ['IPv4-compatible', '::/96'],
  ['IPv6-ULA', 'fc00::/7'],
]

export const SPECIAL_USE: readonly { name: string; prefix: Prefix }[] = TABLE.map(
  ([name, cidr]) => {
    const prefix = parsePrefix(cidr)
    if (!prefix) throw new Error(`bad special-use prefix ${cidr}`)
    return { name, prefix }
  },
)

export function specialUseOverlaps(p: Prefix): { name: string; prefix: Prefix }[] {
  return SPECIAL_USE.filter((s) => covers(s.prefix, p) || covers(p, s.prefix))
}
