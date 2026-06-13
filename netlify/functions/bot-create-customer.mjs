// netlify/functions/bot-create-customer.mjs
// Bot API: create a customer (auth user + profile). Key-gated, no admin session.
import { createClient } from '@supabase/supabase-js'
import { createCustomerCore } from '../shared/create-customer.logic.mjs'
import { sharedDeps, json } from '../shared/_lib.mjs'
import { authorizeBot } from '../shared/bot.logic.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const BOT_KEY = process.env.BOT_API_KEY

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const provided = req.headers.get('x-bot-key')
  if (!authorizeBot(provided, BOT_KEY)) return json(401, { error: 'Unauthorized' })

  let body = {}
  try { body = await req.json() } catch { body = {} }

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

  const deps = {
    ...sharedDeps(SUPABASE_URL, ANON, admin),
    adminCreateUser: (a) => admin.auth.admin.createUser(a),
    insertProfile: (r) => admin.from('profiles').insert(r),
    deleteAuthUser: (id) => admin.auth.admin.deleteUser(id),
  }

  const res = await createCustomerCore(
    { email: body?.email, company: body?.company, displayName: body?.displayName },
    deps,
  )
  return json(res.status, res.body)
}
