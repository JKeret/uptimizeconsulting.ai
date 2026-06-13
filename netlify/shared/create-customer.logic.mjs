// netlify/functions/create-customer.logic.mjs
import { isProbablyEmail, generatePassword } from '../../portal/lib.js'

// Pure "create user + insert profile + cleanup on failure" core, reusable by
// both the admin-gated handler and the bot API. No auth checks here.
// args:  { email, company, displayName }
// deps:  { adminCreateUser, insertProfile, deleteAuthUser, randomBytes }
export async function createCustomerCore({ email, company, displayName }, deps) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  const cleanCompany = String(company || '').trim()
  const cleanDisplayName = String(displayName || '').trim()
  if (!isProbablyEmail(cleanEmail)) return { status: 400, body: { error: 'Valid email required' } }

  const password = generatePassword(deps.randomBytes)
  const { data, error } = await deps.adminCreateUser({ email: cleanEmail, password, email_confirm: true })
  if (error) {
    const exists = /registered|already/i.test(error.message || '') || error.code === 'user_already_exists'
    return { status: exists ? 409 : 500, body: { error: error.message || 'Create failed' } }
  }

  const { error: pErr } = await deps.insertProfile({
    id: data.user.id, email: cleanEmail, company: cleanCompany, display_name: cleanDisplayName, is_admin: false,
  })
  if (pErr) {
    await deps.deleteAuthUser(data.user.id).catch(() => {})
    return { status: 500, body: { error: 'Profile insert failed: ' + pErr.message } }
  }

  return { status: 200, body: { email: cleanEmail, password } }
}

// args:  { token, body: { email, company, displayName } }
// deps:  { getCallerId, isCallerAdmin, adminCreateUser, insertProfile, deleteAuthUser, randomBytes }
export async function handleCreateCustomer({ token, body }, deps) {
  if (!token) return { status: 401, body: { error: 'Not authenticated' } }

  const email = String(body?.email || '').trim().toLowerCase()
  if (!isProbablyEmail(email)) return { status: 400, body: { error: 'Valid email required' } }

  const callerId = await deps.getCallerId(token)
  if (!callerId) return { status: 401, body: { error: 'Invalid session' } }
  if (!(await deps.isCallerAdmin(callerId))) return { status: 403, body: { error: 'Admins only' } }

  return createCustomerCore(body, deps)
}
