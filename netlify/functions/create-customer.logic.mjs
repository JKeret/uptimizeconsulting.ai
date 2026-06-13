// netlify/functions/create-customer.logic.mjs
import { isProbablyEmail } from '../../portal/lib.js'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function generatePassword(randomBytes, length = 24) {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

// args:  { token, body: { email, company, displayName } }
// deps:  { getCallerId, isCallerAdmin, adminCreateUser, insertProfile, randomBytes }
export async function handleCreateCustomer({ token, body }, deps) {
  if (!token) return { status: 401, body: { error: 'Not authenticated' } }

  const email = String(body?.email || '').trim().toLowerCase()
  const company = String(body?.company || '').trim()
  const displayName = String(body?.displayName || '').trim()
  if (!isProbablyEmail(email)) return { status: 400, body: { error: 'Valid email required' } }

  const callerId = await deps.getCallerId(token)
  if (!callerId) return { status: 401, body: { error: 'Invalid session' } }
  if (!(await deps.isCallerAdmin(callerId))) return { status: 403, body: { error: 'Admins only' } }

  const password = generatePassword(deps.randomBytes)
  const { data, error } = await deps.adminCreateUser({ email, password, email_confirm: true })
  if (error) {
    const exists = /registered|already/i.test(error.message || '')
    return { status: exists ? 409 : 500, body: { error: error.message || 'Create failed' } }
  }

  const { error: pErr } = await deps.insertProfile({
    id: data.user.id, email, company, display_name: displayName, is_admin: false,
  })
  if (pErr) return { status: 500, body: { error: 'Profile insert failed: ' + pErr.message } }

  return { status: 200, body: { email, password } }
}
