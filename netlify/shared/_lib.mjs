// netlify/functions/_lib.mjs
// Shared handler helpers. Netlify ignores files starting with `_`,
// so this is never deployed as its own function.
import { createClient } from '@supabase/supabase-js'
import { randomBytes as nodeRandomBytes } from 'node:crypto'

// Builds the dependency pieces shared by every admin function handler.
// Each handler spreads these and adds its own action-specific deps.
export function sharedDeps(SUPABASE_URL, ANON, admin) {
  return {
    getCallerId: async (tok) => {
      const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${tok}` } } })
      const { data } = await userClient.auth.getUser(tok)
      return data?.user?.id || null
    },
    isCallerAdmin: async (id) => {
      const { data } = await admin.from('profiles').select('is_admin').eq('id', id).single()
      return !!data?.is_admin
    },
    randomBytes: (n) => new Uint8Array(nodeRandomBytes(n)),
  }
}

export function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}
