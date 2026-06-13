// portal/admin.js
import { supabase } from './supabaseClient.js'
import { renderFiles } from './files.js'
import { isProbablyEmail } from './lib.js'

export async function initAdmin() {
  const select = document.getElementById('admin-customer-select')
  await loadCustomers(select)
  select.addEventListener('change', () => showSelected(select))
  document.getElementById('admin-add-customer').addEventListener('click', () => addCustomer(select))
  document.getElementById('admin-reset-pw').addEventListener('click', () => resetPassword(select))
  showSelected(select)
}

async function resetPassword(select) {
  const userId = select.value
  if (!userId) { alert('Select a customer first.'); return }
  const label = select.options[select.selectedIndex].textContent
  if (!confirm(`Reset the password for ${label}?`)) return

  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch('/.netlify/functions/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ userId }),
  })
  const result = await resp.json()
  if (!resp.ok) { alert('Could not reset password: ' + (result.error || resp.status)); return }
  showCredentials(select.options[select.selectedIndex].dataset.email || label, result.password)
}

async function loadCustomers(select) {
  const { data, error } = await supabase
    .from('profiles').select('id, email, company, display_name')
    .eq('is_admin', false).order('company', { ascending: true })
  select.innerHTML = ''
  if (error) { alert('Could not load customers: ' + error.message); return }
  if (!data?.length) { select.innerHTML = '<option value="">No customers yet</option>'; return }
  for (const c of data) {
    const o = document.createElement('option')
    o.value = c.id
    o.dataset.email = c.email || ''
    o.textContent = c.company ? `${c.company} — ${c.email}` : c.email
    select.appendChild(o)
  }
}

function showSelected(select) {
  const id = select.value
  if (!id) { document.getElementById('admin-files').innerHTML = '<p class="empty">Add a customer to begin.</p>'; return }
  renderFiles('admin-files', id, { canDelete: true })
}

async function addCustomer(select) {
  const email = prompt('Customer email:')
  if (!email) return
  if (!isProbablyEmail(email)) { alert('Please enter a valid email.'); return }
  const company = prompt('Company name (optional):') || ''
  const displayName = prompt('Contact name (optional):') || ''

  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch('/.netlify/functions/create-customer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ email, company, displayName }),
  })
  const result = await resp.json()
  if (!resp.ok) { alert('Could not create customer: ' + (result.error || resp.status)); return }

  showCredentials(result.email, result.password)
  await loadCustomers(select)
}

function showCredentials(email, password) {
  const box = document.createElement('div')
  box.className = 'cred-box'
  box.innerHTML = `<strong>Send these to the customer:</strong><br>Email: ${email}<br>Password: ${password}`
  const view = document.getElementById('admin-view')
  view.insertBefore(box, view.querySelector('.picker'))
}
