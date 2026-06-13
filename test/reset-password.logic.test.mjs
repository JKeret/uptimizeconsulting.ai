// test/reset-password.logic.test.mjs
import { describe, it, expect, vi } from 'vitest'
import { handleResetPassword } from '../netlify/functions/reset-password.logic.mjs'

function deps({ admin = true, updateError = null } = {}) {
  return {
    getCallerId: vi.fn().mockResolvedValue('caller-uid'),
    isCallerAdmin: vi.fn().mockResolvedValue(admin),
    updateUserPassword: vi.fn().mockResolvedValue({ error: updateError }),
    randomBytes: () => new Uint8Array(24).fill(1),
  }
}

describe('handleResetPassword', () => {
  it('rejects when no token', async () => {
    const res = await handleResetPassword({ token: '', body: { userId: 'u1' } }, deps())
    expect(res.status).toBe(401)
  })
  it('rejects a non-admin', async () => {
    const res = await handleResetPassword({ token: 't', body: { userId: 'u1' } }, deps({ admin: false }))
    expect(res.status).toBe(403)
  })
  it('rejects missing userId', async () => {
    const res = await handleResetPassword({ token: 't', body: {} }, deps())
    expect(res.status).toBe(400)
  })
  it('resets and returns a new password', async () => {
    const d = deps()
    const res = await handleResetPassword({ token: 't', body: { userId: 'u1' } }, d)
    expect(res.status).toBe(200)
    expect(res.body.password).toHaveLength(24)
    expect(d.updateUserPassword).toHaveBeenCalledWith('u1', expect.any(String))
  })
  it('returns 500 when the update fails', async () => {
    const d = deps({ updateError: { message: 'nope' } })
    const res = await handleResetPassword({ token: 't', body: { userId: 'u1' } }, d)
    expect(res.status).toBe(500)
  })
})
