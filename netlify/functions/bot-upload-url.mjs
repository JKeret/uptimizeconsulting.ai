// netlify/functions/bot-upload-url.mjs
// Bot API: mint a signed upload URL for a customer's file.
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

  // upsert: a re-upload of the same path replaces the existing file (intentional)
  const { data, error } = await admin.storage
    .from('customer-files')
    .createSignedUploadUrl(path, { upsert: true })
  if (error) return json(500, { error: error.message })

  // signedUrl already carries its own auth; the bot PUTs bytes directly to it.
  // Supabase's `token` is unused by the client, so we don't return it.
  return json(200, { path, signedUrl: data.signedUrl })
}
