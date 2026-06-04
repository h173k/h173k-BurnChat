import { PublicKey } from '@solana/web3.js'

// ========== NETWORK ==========
export const NETWORK = 'mainnet-beta'
// Public default RPC. Strongly recommend setting your own in Settings (Helius/QuickNode/etc).
export const DEFAULT_RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com'

const RPC_SETTINGS_KEY = 'h173kbc_rpc_settings'

export function getRpcEndpoint() {
  try {
    const stored = localStorage.getItem(RPC_SETTINGS_KEY)
    if (stored) {
      const s = JSON.parse(stored)
      if (s.rpcUrl && s.rpcUrl.trim()) return s.rpcUrl.trim()
    }
  } catch (e) { console.error('RPC read error', e) }
  return DEFAULT_RPC_ENDPOINT
}

export function saveRpcEndpoint(rpcUrl) {
  try { localStorage.setItem(RPC_SETTINGS_KEY, JSON.stringify({ rpcUrl })); return true }
  catch { return false }
}

export function isRpcConfigured() {
  try {
    const stored = localStorage.getItem(RPC_SETTINGS_KEY)
    if (stored) { const s = JSON.parse(stored); return !!(s.rpcUrl && s.rpcUrl.trim()) }
  } catch {}
  return false
}

export async function validateRpcEndpoint(rpcUrl) {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' })
    })
    const data = await res.json()
    return data.result === 'ok' || !data.error
  } catch { return false }
}

// ========== TOKEN ==========
export const TOKEN_MINT = new PublicKey('173AvoJNQoWsaR1wdYTMNLUqZc1b7d4SzB2ZZRZVyz3')
export const TOKEN_DECIMALS = 9
export const TOKEN_TICKER = 'h173k'   // token NAME / unit label used after amounts
export const TOKEN_SYMBOL = 'H173k'   // TICKER symbol, shown with a $ prefix (e.g. $H173k)

// SPL Memo program
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

// ========== BURN / LISTEN ADDRESS ==========
export const DEFAULT_BURN_ADDRESS = 'h173kBurn1111111111111111111111111111111111'
const BURN_ADDRESS_KEY = 'h173kbc_burn_address'

export function getBurnAddress() {
  try {
    const v = localStorage.getItem(BURN_ADDRESS_KEY)
    if (v && v.trim()) return v.trim()
  } catch {}
  return DEFAULT_BURN_ADDRESS
}
export function saveBurnAddress(addr) {
  try { localStorage.setItem(BURN_ADDRESS_KEY, addr.trim()); return true } catch { return false }
}

// ========== COMPOSER DRAFT AMOUNT ==========
// Persist the "amount to burn" so it survives closing/reopening the app.
const DRAFT_AMOUNT_KEY = 'h173kbc_draft_amount'

export function getDraftAmount() {
  try { return localStorage.getItem(DRAFT_AMOUNT_KEY) || '' } catch { return '' }
}
export function saveDraftAmount(v) {
  try { localStorage.setItem(DRAFT_AMOUNT_KEY, v == null ? '' : String(v)); return true } catch { return false }
}

// ========== MESSAGE LIMITS ==========
export const MAX_MEMO_BYTES = 500    // hard cap on full on-chain memo (nick + sep + text)
export const MAX_TEXT_CHARS = 260    // visible message text limit
// Separator between nickname and message inside the memo (ASCII Unit Separator, 1 byte, never typed by users)
export const MEMO_SEP = '\u001F'

// ========== CHAT SETTINGS (persisted) ==========
const CHAT_SETTINGS_KEY = 'h173kbc_chat_settings'

export const SORT_NEWEST = 'newest'
export const SORT_LARGEST = 'largest'
export const UNIT_H173K = 'h173k'
export const UNIT_USDT = 'usdt'

export const DEFAULT_CHAT_SETTINGS = {
  nickname: '',
  sort: SORT_NEWEST,          // newest | largest
  fetchLimit: 50,             // how many recent messages to pull from API on load (req 11/18)
  minBurnFilter: 0,           // only show messages >= this burn (in h173k) (req 8)
  displayUnit: UNIT_H173K,    // h173k | usdt (req 14)
  fxThreshold: 1000000,       // special effect for burns >= this many h173k (req 13)
  fxEnabled: true,
  fxDuration: 6.5,            // seconds the big-burn effect stays on screen
  fxNickSize: 28,             // px font size of the nickname inside the big-burn effect
  fxTextSize: 16,             // px font size of the message text inside the big-burn effect
  fxVerticalPos: 50,          // vertical position of the effect (0 = top, 100 = bottom)
  fxDim: 85,                  // how much to darken everything behind the effect (0-100 %)
  tickerSize: 13,             // px font size of the h173k ticker in the header
  watchOnly: false,           // watch-only mode: hide controls, show only the chat
}

export const TICKER_SIZE_MIN = 10
export const TICKER_SIZE_MAX = 32

export const FX_NICK_SIZE_MIN = 14
export const FX_NICK_SIZE_MAX = 64
export const FX_TEXT_SIZE_MIN = 10
export const FX_TEXT_SIZE_MAX = 48
export const FX_DURATION_MIN = 1
export const FX_DURATION_MAX = 30
export const FX_VPOS_MIN = 0
export const FX_VPOS_MAX = 100
export const FX_DIM_MIN = 0
export const FX_DIM_MAX = 100

export function getChatSettings() {
  try {
    const stored = localStorage.getItem(CHAT_SETTINGS_KEY)
    if (!stored) return { ...DEFAULT_CHAT_SETTINGS }
    return { ...DEFAULT_CHAT_SETTINGS, ...JSON.parse(stored) }
  } catch { return { ...DEFAULT_CHAT_SETTINGS } }
}
export function saveChatSettings(s) {
  try { localStorage.setItem(CHAT_SETTINGS_KEY, JSON.stringify(s)); return true } catch { return false }
}

// ========== REPLENISH SOL SETTINGS (used by useSwap) ==========
const REPLENISH_SETTINGS_KEY = 'h173kbc_replenish_settings'
export const WSOL_ATA_RENT = 0.00204
export const MIN_SWAP_PRIORITY_FEE = 0.0001
export const MIN_TRIGGER_THRESHOLD = 2 * WSOL_ATA_RENT
export const MIN_REPLENISH_TO = 3 * WSOL_ATA_RENT
export const MIN_SOL_BALANCE = 0.01
export const PRICE_UPDATE_INTERVAL = 30000

const REPLENISH_ENABLED_KEY = 'h173kbc_replenish_enabled'
export function getReplenishEnabled() {
  try { const v = localStorage.getItem(REPLENISH_ENABLED_KEY); return v === null ? true : v === 'true' }
  catch { return true }
}
export function saveReplenishEnabled(v) {
  try { localStorage.setItem(REPLENISH_ENABLED_KEY, v ? 'true' : 'false') } catch {}
}

export const DEFAULT_REPLENISH_SETTINGS = {
  threshold: MIN_TRIGGER_THRESHOLD,
  replenishTo: MIN_REPLENISH_TO,
  swapFeeSol: MIN_SWAP_PRIORITY_FEE,
  convertThreshold: MIN_TRIGGER_THRESHOLD,
}

export function getReplenishSettings() {
  try {
    const stored = localStorage.getItem(REPLENISH_SETTINGS_KEY)
    if (!stored) return { ...DEFAULT_REPLENISH_SETTINGS }
    return { ...DEFAULT_REPLENISH_SETTINGS, ...JSON.parse(stored) }
  } catch { return { ...DEFAULT_REPLENISH_SETTINGS } }
}
export function saveReplenishSettings(s) {
  try { localStorage.setItem(REPLENISH_SETTINGS_KEY, JSON.stringify(s)); return true } catch { return false }
}

// ========== H173K DISPLAY DECIMALS ==========
const H173K_DECIMALS_KEY = 'h173kbc_display_decimals'
export const DEFAULT_H173K_DECIMALS = 4
export function getH173KDecimals() {
  try {
    const stored = localStorage.getItem(H173K_DECIMALS_KEY)
    if (stored !== null) { const v = parseInt(stored, 10); if (!isNaN(v) && v >= 0 && v <= 9) return v }
  } catch {}
  return DEFAULT_H173K_DECIMALS
}
export function saveH173KDecimals(d) {
  try { localStorage.setItem(H173K_DECIMALS_KEY, String(d)); return true } catch { return false }
}
