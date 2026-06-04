/**
 * h173k Burn Chat - utilities
 */
import { getH173KDecimals } from './constants'

export function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '0'
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals })
}

export function formatSmartNumber(num, minDecimals = 2, maxDecimals = 8) {
  if (num === null || num === undefined || isNaN(num)) return '0'
  if (num === 0) return '0'
  const absNum = Math.abs(num)
  if (absNum > 0 && absNum < 0.000001) return num.toExponential(2)
  let decimals = minDecimals
  if (absNum < 0.0001) decimals = Math.max(minDecimals, 8)
  else if (absNum < 0.001) decimals = Math.max(minDecimals, 7)
  else if (absNum < 0.01) decimals = Math.max(minDecimals, 6)
  else if (absNum < 0.1) decimals = Math.max(minDecimals, 4)
  else if (absNum < 1) decimals = Math.max(minDecimals, 3)
  decimals = Math.min(decimals, maxDecimals)
  const formatted = num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals })
  if (parseFloat(formatted.replace(/,/g, '')) === 0 && num !== 0) return num.toExponential(2)
  return formatted
}

export function formatH173K(num, decimalsOverride) {
  if (num === null || num === undefined || isNaN(num)) return '0'
  const decimals = decimalsOverride !== undefined ? decimalsOverride : getH173KDecimals()
  if (num === 0) return '0'
  if (decimals === 0) return num.toLocaleString('en-US', { maximumFractionDigits: 0 })
  const absNum = Math.abs(num)
  if (absNum > 0 && absNum < Math.pow(10, -decimals)) return formatSmartNumber(num, decimals, Math.max(decimals, 8))
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals })
}

export function formatUSD(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '$0.00'
  const abs = Math.abs(amount)
  // small values: show more precision
  if (abs > 0 && abs < 0.01) {
    return '$' + formatSmartNumber(amount, 2, 8)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(amount)
}

export function truncateAddress(addr, start = 4, end = 4) {
  if (!addr) return ''
  const s = String(addr)
  if (s.length <= start + end + 1) return s
  return `${s.slice(0, start)}…${s.slice(-end)}`
}

// UTF-8 byte length of a string (memo size is measured in bytes)
export function byteLength(str) {
  if (!str) return 0
  return new TextEncoder().encode(str).length
}

// Truncate a string so its UTF-8 byte length does not exceed maxBytes,
// without splitting multi-byte chars / surrogate pairs (keeps emoji intact).
export function truncateToBytes(str, maxBytes) {
  if (byteLength(str) <= maxBytes) return str
  // Iterate by code points to avoid breaking surrogate pairs (emoji)
  let out = ''
  for (const ch of str) {
    if (byteLength(out + ch) > maxBytes) break
    out += ch
  }
  return out
}

// Count characters by code point (so an emoji counts as 1, not 2).
export function charLength(str) {
  if (!str) return 0
  return Array.from(str).length
}

export function truncateToChars(str, maxChars) {
  const arr = Array.from(str || '')
  if (arr.length <= maxChars) return str
  return arr.slice(0, maxChars).join('')
}

/**
 * Sanitize text coming from the blockchain before it is shown in the UI.
 * React already escapes text nodes, so HTML/JS cannot execute. This is a
 * second layer of defence: strip control chars (except newline), zero-width
 * tricks, and clamp length. We NEVER use dangerouslySetInnerHTML anywhere.
 */
export function sanitizeText(input, maxChars = 1000) {
  if (input === null || input === undefined) return ''
  let s = String(input)
  // Normalize unicode
  try { s = s.normalize('NFC') } catch {}
  // Remove control characters except \n and \t. \u001F is our separator and is removed here too.
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  // Strip zero-width / direction-override characters often used for spoofing
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
  // Collapse excessive newlines
  s = s.replace(/\n{4,}/g, '\n\n\n')
  // Clamp
  s = truncateToChars(s, maxChars)
  return s
}

export function timeAgo(blockTime) {
  if (!blockTime) return ''
  const diff = Math.floor(Date.now() / 1000) - blockTime
  if (diff < 5) return 'now'
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}
