// netlify/functions/keepalive.mjs
// Scheduled ping so the free-tier Supabase project registers activity
// and doesn't get auto-paused after 7 idle days.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async () => {
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  const { count, error } = await admin.from('profiles').select('*', { count: 'exact', head: true })
  if (error) {
    console.error('keepalive failed:', error.message)
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
  }
  console.log(`keepalive ok — profiles count: ${count}`)
  return new Response(JSON.stringify({ ok: true, profiles: count }), { status: 200 })
}

export const config = {
  schedule: '23 6 * * *',
}
