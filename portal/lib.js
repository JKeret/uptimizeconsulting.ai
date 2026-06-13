// portal/lib.js
export function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++ }
  return `${value.toFixed(1)} ${units[i]}`
}

export function sanitizeFilename(name) {
  const base = String(name).split(/[/\\]/).pop() || ''
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\x00-\x1f]/g, '').trim()
  return cleaned.length ? cleaned : 'file'
}

export function storagePathFor(userId, filename) {
  return `${userId}/${sanitizeFilename(filename)}`
}

export function isProbablyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''))
}

// 56 chars, no ambiguous glyphs; mild modular bias (~25%) is fine at this entropy (~139 bits over 24 chars)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function generatePassword(randomBytes, length = 24) {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}
