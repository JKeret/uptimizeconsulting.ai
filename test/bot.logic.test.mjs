// test/bot.logic.test.mjs
import { describe, it, expect } from 'vitest'
import { authorizeBot, validateCustomerId, buildObjectPath } from '../netlify/shared/bot.logic.mjs'

describe('authorizeBot', () => {
  it('returns true for an exact match', () => {
    expect(authorizeBot('secret-key-123', 'secret-key-123')).toBe(true)
  })

  it('returns false for a mismatch of equal length', () => {
    expect(authorizeBot('secret-key-123', 'secret-key-XYZ')).toBe(false)
  })

  it('returns false for a length difference', () => {
    expect(authorizeBot('short', 'a-much-longer-key')).toBe(false)
  })

  it('returns false when provided is empty', () => {
    expect(authorizeBot('', 'expected')).toBe(false)
  })

  it('returns false when expected is empty', () => {
    expect(authorizeBot('provided', '')).toBe(false)
  })

  it('returns false when both undefined', () => {
    expect(authorizeBot(undefined, undefined)).toBe(false)
  })
})

describe('validateCustomerId', () => {
  it('returns the trimmed id for a valid value', () => {
    expect(validateCustomerId('  abc-123  ')).toBe('abc-123')
  })

  it('returns null for empty / whitespace', () => {
    expect(validateCustomerId('')).toBe(null)
    expect(validateCustomerId('   ')).toBe(null)
    expect(validateCustomerId(undefined)).toBe(null)
  })

  it('returns null when it contains a forward slash', () => {
    expect(validateCustomerId('a/b')).toBe(null)
  })

  it('returns null when it contains a backslash', () => {
    expect(validateCustomerId('a\\b')).toBe(null)
  })
})

describe('buildObjectPath', () => {
  it('builds customerId/filename for valid inputs', () => {
    expect(buildObjectPath('cust-1', 'report.pdf')).toBe('cust-1/report.pdf')
  })

  it('returns null for an invalid customerId', () => {
    expect(buildObjectPath('a/b', 'report.pdf')).toBe(null)
    expect(buildObjectPath('', 'report.pdf')).toBe(null)
  })

  it('strips traversal in the filename, never escaping the customer folder', () => {
    const path = buildObjectPath('cust-1', '../../etc/passwd')
    expect(path).toBe('cust-1/passwd')
    expect(path.startsWith('cust-1/')).toBe(true)
    expect(path).not.toContain('..')
  })
})
