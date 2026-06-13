// netlify/functions/reset-password.mjs
import { createClient } from '@supabase/supabase-js'
import { handleResetPassword } from './reset-password.logic.mjs'
import { sharedDeps, json } from './_lib.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  let body = {}
  try { body = await req.json() } catch { body = {} }

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  const deps = {
    ...sharedDeps(SUPABASE_URL, ANON, admin),
    updateUserPassword: async (userId, password) => {
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      return { error }
    },
  }

  const res = await handleResetPassword({ token, body }, deps)
  return json(res.status, res.body)
}
