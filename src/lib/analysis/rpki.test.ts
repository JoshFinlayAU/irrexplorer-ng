import { describe, expect, it } from 'vitest'
import { parsePrefix } from '../ip'
import { describeValidity, validateOrigin, validatorFrom } from './rpki'

describe('validateOrigin (RFC 6811)', () => {
  it('is not-found without covering VRPs', () => {
    expect(validateOrigin(24, 1, [])).toEqual({ state: 'not-found' })
  })
  it('is valid when ASN and length match', () => {
    expect(validateOrigin(24, 1, [{ asn: 1, maxLength: 24 }])).toEqual({ state: 'valid' })
    expect(
      validateOrigin(22, 1, [
        { asn: 2, maxLength: 24 },
        { asn: 1, maxLength: 22 },
      ]),
    ).toEqual({ state: 'valid' })
  })
  it('distinguishes invalid length from invalid ASN', () => {
    expect(validateOrigin(25, 1, [{ asn: 1, maxLength: 24 }])).toEqual({
      state: 'invalid',
      reason: 'length',
    })
    expect(validateOrigin(24, 1, [{ asn: 2, maxLength: 24 }])).toEqual({
      state: 'invalid',
      reason: 'as',
    })
  })
  it('never validates AS0', () => {
    expect(validateOrigin(24, 0, [{ asn: 0, maxLength: 24 }])).toEqual({
      state: 'invalid',
      reason: 'as',
    })
  })
  it('describes each state', () => {
    expect(describeValidity({ state: 'unknown' })).toMatch(/unavailable/)
    expect(describeValidity({ state: 'invalid', reason: 'length' })).toMatch(/max length/)
  })
})

describe('validatorFrom', () => {
  const P = (c: string) => parsePrefix(c)!
  const validate = validatorFrom([
    { prefix: '2606:4700::/44', asn: 13335, maxLength: 44 },
    { prefix: '192.0.2.0/24', asn: 64500, maxLength: 24 },
    { prefix: '192.0.0.0/16', asn: 64501, maxLength: 16 },
  ])
  it('uses every covering ROA and ignores more specific ones', () => {
    expect(validate(P('192.0.2.0/24'), 64500)).toEqual({ state: 'valid' })
    expect(validate(P('192.0.2.0/25'), 64500)).toEqual({ state: 'invalid', reason: 'length' })
    expect(validate(P('192.0.3.0/24'), 64500)).toEqual({ state: 'invalid', reason: 'as' })
    expect(validate(P('2606:4700::/32'), 13335)).toEqual({ state: 'not-found' })
    expect(validate(P('2606:4700::/44'), 13335)).toEqual({ state: 'valid' })
  })
})
