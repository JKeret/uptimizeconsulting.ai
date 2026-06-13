// netlify/shared/bot.logic.mjs
// Pure auth + validation helpers for the key-gated bot API.
import { timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { sanitizeFilename } from '../../portal/lib.js'

// Constant-time compare of the provided key against the expected key.
// Guards against length mismatch and empty/undefined inputs.
export function authorizeBot(provided, expected) {
  if (!provided || !expected) return false
  const a = Buffer.from(String(provided))
  const b = Buffer.from(String(expected))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// Returns the trimmed customerId, or null if empty or containing path separators.
export function validateCustomerId(id) {
  const trimmed = String(id || '').trim()
  if (!trimmed) return null
  if (trimmed.includes('/') || trimmed.includes('\\')) return null
  return trimmed
}

// Builds `${customerId}/${sanitizeFilename(filename)}`.
// Returns null when customerId is invalid. sanitizeFilename strips any path
// segments (e.g. "../../etc/passwd" -> "passwd"), so the result can never
// escape the customer folder.
export function buildObjectPath(customerId, filename) {
  const cid = validateCustomerId(customerId)
  if (!cid) return null
  if (filename === undefined || filename === null || String(filename).trim() === '') return null
  return `${cid}/${sanitizeFilename(filename)}`
}
