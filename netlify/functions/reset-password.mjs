// netlify/functions/reset-password.mjs
import { createClient } from '@supabase/supabase-js'
import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { handleResetPassword } from './reset-password.logic.mjs'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  let body = {}
  try { body = await req.json() } catch { body = {} }

  const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  const deps = {
    getCallerId: async (tok) => {
      const userClient = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${tok}` } } })
      const { data } = await userClient.auth.getUser(tok)
      return data?.user?.id || null
    },
    isCallerAdmin: async (id) => {
      const { data } = await admin.from('profiles').select('is_admin').eq('id', id).single()
      return !!data?.is_admin
    },
    updateUserPassword: async (userId, password) => {
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      return { error }
    },
    randomBytes: (n) => new Uint8Array(nodeRandomBytes(n)),
  }

  const res = await handleResetPassword({ token, body }, deps)
  return json(res.status, res.body)
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}
