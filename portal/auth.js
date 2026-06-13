// portal/auth.js
import { supabase } from './supabaseClient.js'

export function wireLogin(onSuccess) {
  const form = document.getElementById('login-form')
  const errEl = document.getElementById('login-error')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errEl.textContent = ''
    const email = document.getElementById('login-email').value.trim()
    const password = document.getElementById('login-password').value
    const btn = form.querySelector('button')
    btn.disabled = true
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    btn.disabled = false
    if (error) { errEl.textContent = 'Incorrect email or password.'; return }
    onSuccess()
  })
}

export function wireLogout() {
  const btn = document.getElementById('logout-btn')
  btn.addEventListener('click', async () => {
    await supabase.auth.signOut()
    location.reload()
  })
}

export function wireChangePassword(buttonId) {
  const btn = document.getElementById(buttonId)
  if (!btn) return
  btn.addEventListener('click', async () => {
    const pw = prompt('Enter a new password (min 8 characters):')
    if (!pw) return
    if (pw.length < 8) { alert('Password must be at least 8 characters.'); return }
    const { error } = await supabase.auth.updateUser({ password: pw })
    alert(error ? 'Could not update password: ' + error.message : 'Password updated.')
  })
}
