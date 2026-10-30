import { describe, expect, it } from 'vitest'
import { describeValidity, validateOrigin } from './rpki'

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
