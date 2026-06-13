// integrations/claudeclaw-portal.mjs
//
// Dependency-free client for the Uptimize customer-portal bot API.
// Uses only global `fetch` (no @supabase/supabase-js). Drop into ClaudeClaw.
//
// Usage:
//   import { createPortalClient } from './claudeclaw-portal.mjs'
//
//   const portal = createPortalClient({
//     baseUrl: 'https://uptimizeconsulting.ai',
//     botKey: process.env.BOT_API_KEY,           // set from env, never hardcode
//   })
//
//   const customers = await portal.listCustomers()
//   const files = await portal.listFiles(customerId)
//   const { email, password } = await portal.addCustomer({ email, company, displayName })
//   await portal.uploadFile(customerId, 'report.pdf', bytes)   // bytes: Buffer|Uint8Array|Blob
//   const buf = await portal.downloadFile(customerId, 'report.pdf') // ArrayBuffer
//
// NOTE: there is intentionally no delete capability.

export function createPortalClient({ baseUrl, botKey }) {
  if (!baseUrl) throw new Error('createPortalClient: baseUrl is required')
  if (!botKey) throw new Error('createPortalClient: botKey is required')

  const root = String(baseUrl).replace(/\/+$/, '')

  async function callBot(name, body) {
    const res = await fetch(`${root}/.netlify/functions/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bot-key': botKey },
      body: JSON.stringify(body || {}),
    })
    let data = {}
    try { data = await res.json() } catch { data = {} }
    if (!res.ok) {
      throw new Error(data?.error || `${name} failed with status ${res.status}`)
    }
    return data
  }

  async function listCustomers() {
    const data = await callBot('bot-list', {})
    return data.customers
  }

  async function listFiles(customerId) {
    const data = await callBot('bot-list', { customerId })
    return data.files
  }

  async function addCustomer({ email, company, displayName }) {
    const data = await callBot('bot-create-customer', { email, company, displayName })
    return { email: data.email, password: data.password }
  }

  async function uploadFile(customerId, filename, bytes) {
    const { path, signedUrl } = await callBot('bot-upload-url', { customerId, filename })
    const put = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes,
    })
    if (!put.ok) {
      throw new Error(`uploadFile: PUT failed with status ${put.status}`)
    }
    return { path }
  }

  async function downloadFile(customerId, filename) {
    const { signedUrl } = await callBot('bot-download', { customerId, filename })
    const r = await fetch(signedUrl)
    if (!r.ok) {
      throw new Error(`downloadFile: GET failed with status ${r.status}`)
    }
    return r.arrayBuffer()
  }

  return { listCustomers, listFiles, addCustomer, uploadFile, downloadFile }
}
