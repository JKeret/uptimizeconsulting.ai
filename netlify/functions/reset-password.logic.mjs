// netlify/functions/reset-password.logic.mjs
import { generatePassword } from './create-customer.logic.mjs'

// args: { token, body: { userId } }
// deps: { getCallerId, isCallerAdmin, updateUserPassword, randomBytes }
export async function handleResetPassword({ token, body }, deps) {
  if (!token) return { status: 401, body: { error: 'Not authenticated' } }
  const userId = String(body?.userId || '').trim()
  if (!userId) return { status: 400, body: { error: 'userId required' } }

  const callerId = await deps.getCallerId(token)
  if (!callerId) return { status: 401, body: { error: 'Invalid session' } }
  if (!(await deps.isCallerAdmin(callerId))) return { status: 403, body: { error: 'Admins only' } }

  const password = generatePassword(deps.randomBytes)
  const { error } = await deps.updateUserPassword(userId, password)
  if (error) return { status: 500, body: { error: error.message || 'Reset failed' } }
  return { status: 200, body: { password } }
}
