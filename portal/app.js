// portal/app.js
import { supabase } from './supabaseClient.js'
import { wireLogin, wireLogout, wireChangePassword } from './auth.js'
import { renderFiles } from './files.js'
import { initAdmin } from './admin.js'

const views = {
  loading: document.getElementById('loading'),
  login: document.getElementById('login-view'),
  customer: document.getElementById('customer-view'),
  admin: document.getElementById('admin-view'),
}

function show(name) {
  views.loading.hidden = name !== 'loading'
  views.login.hidden = name !== 'login'
  views.customer.hidden = name !== 'customer'
  views.admin.hidden = name !== 'admin'
  document.getElementById('logout-btn').hidden = (name === 'login' || name === 'loading')
}

async function route() {
  show('loading')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { show('login'); return }

  const { data: profile, error } = await supabase
    .from('profiles').select('is_admin, email, display_name').eq('id', session.user.id).single()
  if (error || !profile) {
    document.getElementById('who').textContent = session.user.email
    show('customer')
    renderFiles('customer-files', session.user.id, { canDelete: true })
    return
  }

  document.getElementById('who').textContent = profile.display_name || profile.email || session.user.email
  if (profile.is_admin) { show('admin'); await initAdmin() }
  else { show('customer'); renderFiles('customer-files', session.user.id, { canDelete: true }) }
}

wireLogin(route)
wireLogout()
wireChangePassword('cust-change-pw')
route()
