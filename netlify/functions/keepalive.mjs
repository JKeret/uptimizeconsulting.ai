// netlify/functions/keepalive.mjs
// Scheduled WRITE-ping. Read-only pings do NOT reset Supabase's free-tier
// idle timer (that's why the project kept getting pause warnings), so we now
// perform a real database write: upsert a single storage object. storage.objects
// is a Postgres table, so this registers genuine activity with no DDL needed.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async () => {
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await admin.storage
    .from('customer-files')
    .upload('_keepalive/ping.txt', Buffer.from(`keepalive ${new Date().toISOString()}\n`), {
      upsert: true,
      contentType: 'text/plain',
    })
  if (error) {
    console.error('keepalive write failed:', error.message)
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
  }
  console.log('keepalive ok — wrote _keepalive/ping.txt')
  return new Response(JSON.stringify({ ok: true, wrote: '_keepalive/ping.txt' }), { status: 200 })
}

export const config = {
  schedule: '23 6 * * *',
}
