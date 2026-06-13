// portal/config.js — public values (anon key is safe in the browser; RLS is the boundary)
export const SUPABASE_URL = 'https://nqcwxluxaadfuucgginq.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xY3d4bHV4YWFkZnV1Y2dnaW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMTA3NzEsImV4cCI6MjA5Njg4Njc3MX0.NYRYxOCqqHsud9wI5_nSfklQ922BYJTEx2b_5W5FcAw'

if (SUPABASE_URL.includes('YOUR-PROJECT')) {
  document.body.textContent = 'Portal not yet configured.'
  throw new Error('config.js: replace placeholder Supabase URL + anon key before deploying')
}
