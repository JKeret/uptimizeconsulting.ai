// portal/supabaseClient.js
// supabase-js is loaded as a self-contained local UMD bundle via a <script> tag in
// index.html (portal/vendor/supabase.umd.js), exposing the global `supabase`. This
// avoids any runtime CDN dependency (some browsers/extensions block CDNs).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

const { createClient } = globalThis.supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
