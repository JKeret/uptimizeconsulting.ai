// test/create-customer.logic.test.mjs
import { describe, it, expect, vi } from 'vitest'
import { generatePassword, handleCreateCustomer } from '../netlify/functions/create-customer.logic.mjs'

describe('generatePassword', () => {
  it('produces a strong-length password from the byte source', () => {
    const bytes = new Uint8Array(24).fill(7)
    const pw = generatePassword(() => bytes)
    expect(pw).toHaveLength(24)
    expect(/^[A-Za-z0-9]+$/.test(pw)).toBe(true)
  })
})

function deps({ admin = true, createUserError = null, insertError = null } = {}) {
  const createdUser = { id: 'new-uid-1' }
  return {
    getCallerId: vi.fn().mockResolvedValue('caller-uid'),
    isCallerAdmin: vi.fn().mockResolvedValue(admin),
    adminCreateUser: vi.fn().mockResolvedValue(
      createUserError ? { data: null, error: createUserError } : { data: { user: createdUser }, error: null }
    ),
    insertProfile: vi.fn().mockResolvedValue({ error: insertError }),
    randomBytes: () => new Uint8Array(24).fill(1),
  }
}

describe('handleCreateCustomer', () => {
  it('rejects when no auth token', async () => {
    const res = await handleCreateCustomer({ token: '', body: {} }, deps())
    expect(res.status).toBe(401)
  })

  it('rejects a non-admin caller', async () => {
    const res = await handleCreateCustomer(
      { token: 't', body: { email: 'c@x.com', company: 'X' } }, deps({ admin: false }))
    expect(res.status).toBe(403)
  })

  it('rejects an invalid email', async () => {
    const res = await handleCreateCustomer({ token: 't', body: { email: 'bad' } }, deps())
    expect(res.status).toBe(400)
  })

  it('creates the user + profile and returns credentials', async () => {
    const d = deps()
    const res = await handleCreateCustomer(
      { token: 't', body: { email: 'c@x.com', company: 'Acme', displayName: 'Jane' } }, d)
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('c@x.com')
    expect(res.body.password).toHaveLength(24)
    expect(d.adminCreateUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'c@x.com', email_confirm: true,
    }))
    expect(d.insertProfile).toHaveBeenCalledWith(expect.objectContaining({
      id: 'new-uid-1', email: 'c@x.com', company: 'Acme', display_name: 'Jane', is_admin: false,
    }))
  })

  it('returns 409 when the user already exists', async () => {
    const d = deps({ createUserError: { message: 'already been registered' } })
    const res = await handleCreateCustomer({ token: 't', body: { email: 'c@x.com' } }, d)
    expect(res.status).toBe(409)
  })
})
