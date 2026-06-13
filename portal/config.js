// portal/config.js
// TODO(Jonathan): replace with real Supabase Project URL + anon public key from Task 0
export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co'
export const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY'

if (SUPABASE_URL.includes('YOUR-PROJECT')) {
  document.body.textContent = 'Portal not yet configured.'
  throw new Error('config.js: replace placeholder Supabase URL + anon key before deploying')
}
