import { describe, expect, it } from 'vitest'
import { classifyQuery, parseAsn, parseSetName, setType } from './parse'

describe('parseAsn', () => {
  it.each([
    ['AS123', 123],
    ['as123', 123],
    ['123', 123],
    ['AS 123', 123],
    ['AS4294967295', 4294967295],
    ['AS1.10', 65546],
  ])('%s -> %d', (input, expected) => {
    expect(parseAsn(input)).toBe(expected)
  })
  it.each(['AS4294967296', 'ASX', '', '1.10', 'AS-FOO'])('rejects %s', (input) => {
    expect(parseAsn(input)).toBeNull()
  })
})

describe('parseSetName', () => {
  it.each([
    ['as-example', 'AS-EXAMPLE'],
    ['AS3333:AS-TEST', 'AS3333:AS-TEST'],
    ['rs-foo', 'RS-FOO'],
    ['AS-FOO:AS-BAR', 'AS-FOO:AS-BAR'],
    ['as-ripencc', 'AS-RIPENCC'],
  ])('%s -> %s', (input, expected) => {
    expect(parseSetName(input)).toBe(expected)
  })
  it.each(['AS123', 'foo', 'AS-', 'AS-FOO BAR', 'AS123:AS456'])('rejects %s', (input) => {
    expect(parseSetName(input)).toBeNull()
  })
  it('types sets', () => {
    expect(setType('AS-FOO')).toBe('as-set')
    expect(setType('AS1:RS-FOO')).toBe('route-set')
  })
})

describe('classifyQuery', () => {
  it('detects prefixes, IPs, ASNs and sets', () => {
    expect(classifyQuery('192.0.2.5/24')).toMatchObject({
      kind: 'prefix',
      cidr: '192.0.2.0/24',
      isHost: false,
    })
    expect(classifyQuery('192.0.2.5')).toMatchObject({
      kind: 'prefix',
      cidr: '192.0.2.5/32',
      isHost: true,
    })
    expect(classifyQuery('2001:db8::1')).toMatchObject({
      kind: 'prefix',
      cidr: '2001:db8::1/128',
      isHost: true,
    })
    expect(classifyQuery('AS3333')).toEqual({ kind: 'asn', asn: 3333 })
    expect(classifyQuery('3333')).toEqual({ kind: 'asn', asn: 3333 })
    expect(classifyQuery('as-ripencc')).toEqual({ kind: 'set', name: 'AS-RIPENCC' })
    expect(classifyQuery('AS3333:AS-FOO')).toEqual({ kind: 'set', name: 'AS3333:AS-FOO' })
  })
  it('explains invalid input', () => {
    expect(classifyQuery('')).toMatchObject({ kind: 'invalid' })
    expect(classifyQuery('192.0.2.0/40')).toMatchObject({ kind: 'invalid' })
    expect(JSON.stringify(classifyQuery('192.0.2.0/40'))).toContain('prefix')
    expect(JSON.stringify(classifyQuery('AS99999999999'))).toContain('out of range')
    expect(classifyQuery('hello world')).toMatchObject({ kind: 'invalid' })
  })
})
