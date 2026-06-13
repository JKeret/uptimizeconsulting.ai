// netlify/functions/bot-list.mjs
// Bot API: list a customer's files, or (no customerId) list all customers.
import { createClient } from '@supabase/supabase-js'
import { json } from '../shared/_lib.mjs'
import { authorizeBot, validateCustomerId } from '../shared/bot.logic.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const BOT_KEY = process.env.BOT_API_KEY

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const provided = req.headers.get('x-bot-key')
  if (!authorizeBot(provided, BOT_KEY)) return json(401, { error: 'Unauthorized' })

  let body = {}
  try { body = await req.json() } catch { body = {} }

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

  if (body?.customerId) {
    const customerId = validateCustomerId(body.customerId)
    if (!customerId) return json(400, { error: 'Invalid customerId' })

    const { data, error } = await admin.storage
      .from('customer-files')
      .list(customerId, { limit: 200, sortBy: { column: 'name', order: 'asc' } })
    if (error) return json(500, { error: error.message })

    const files = (data || [])
      .filter((f) => f.id !== null)
      .map((f) => ({ name: f.name, size: f.metadata?.size || 0, updatedAt: f.updated_at || null }))
    return json(200, { files })
  }

  const { data, error } = await admin
    .from('profiles')
    .select('id,email,company,display_name')
    .eq('is_admin', false)
    .order('company')
  if (error) return json(500, { error: error.message })

  return json(200, { customers: data || [] })
}
