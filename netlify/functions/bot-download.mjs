// netlify/functions/bot-download.mjs
// Bot API: mint a short-lived signed download URL for a customer's file.
import { createClient } from '@supabase/supabase-js'
import { json } from '../shared/_lib.mjs'
import { authorizeBot, buildObjectPath } from '../shared/bot.logic.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const BOT_KEY = process.env.BOT_API_KEY

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const provided = req.headers.get('x-bot-key')
  if (!authorizeBot(provided, BOT_KEY)) return json(401, { error: 'Unauthorized' })

  let body = {}
  try { body = await req.json() } catch { body = {} }

  const path = buildObjectPath(body?.customerId, body?.filename)
  if (!path) return json(400, { error: 'Invalid customerId or filename' })

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data, error } = await admin.storage
    .from('customer-files')
    .createSignedUrl(path, 300, { download: true })
  if (error || !data?.signedUrl) return json(404, { error: 'File not found' })

  return json(200, { signedUrl: data.signedUrl })
}
