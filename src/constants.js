import { PublicKey } from '@solana/web3.js'

// ========== APP VERSION ==========
// Injected at build time from package.json (see vite.config.js `define`).
// The fallbacks keep things working if the app is run without the define.
export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev'
export const BUILD_TIME =
  typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : ''

// ========== NETWORK ==========
export const NETWORK = 'mainnet-beta'
// Solana's own public endpoint. Kept only so it can be recognised and refused:
// it sends no CORS headers a browser will accept and rate-limits hard, so from
// an installed PWA it simply does not work. Every code path below rejects it.
export const DEFAULT_RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com'

// Hosts that are Solana's free public nodes rather than somebody's endpoint.
const PUBLIC_RPC_HOSTS = [
  'api.mainnet-beta.solana.com',
  'api.devnet.solana.com',
  'api.testnet.solana.com',
  'solana-api.projectserum.com',
]

/** Is this one of the public nodes the app cannot actually use? */
export function isPublicRpc(rpcUrl) {
  try {
    const host = new URL(String(rpcUrl || '').trim()).hostname.toLowerCase()
    return PUBLIC_RPC_HOSTS.includes(host)
  } catch { return false }
}

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
  // Last line of defence: the public node must never end up in storage, no
  // matter which caller got there.
  if (isPublicRpc(rpcUrl)) return false
  try { localStorage.setItem(RPC_SETTINGS_KEY, JSON.stringify({ rpcUrl })); return true }
  catch { return false }
}

/**
 * A stored public endpoint counts as *not* configured, so an existing profile
 * carrying one is sent back through the setup gate instead of being left on a
 * node that cannot serve the app.
 */
export function isRpcConfigured() {
  try {
    const stored = localStorage.getItem(RPC_SETTINGS_KEY)
    if (stored) {
      const s = JSON.parse(stored)
      return !!(s.rpcUrl && s.rpcUrl.trim() && !isPublicRpc(s.rpcUrl))
    }
  } catch {}
  return false
}

/**
 * Cheap, offline sanity check on what the user typed. Runs before we ever hit
 * the network, so the setup gate can reject obvious nonsense ("helius.dev",
 * "my rpc") without waiting on a request that was never going to work.
 * The public nodes fail here too — they are well-formed but unusable.
 */
export function isRpcUrlShapeValid(rpcUrl) {
  const v = String(rpcUrl || '').trim()
  if (!v) return false
  if (isPublicRpc(v)) return false
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return !!u.hostname && u.hostname.includes('.')
  } catch { return false }
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

// Prefilled on a wallet that has never set an amount, so the burn button is
// usable straight away instead of starting on an empty, disabled form.
export const DEFAULT_DRAFT_AMOUNT = '0.00001'

export function getDraftAmount() {
  try {
    const v = localStorage.getItem(DRAFT_AMOUNT_KEY)
    // Only an *absent* key falls back to the default. An empty stored string
    // means the user deliberately cleared the field, and refilling it on every
    // reopen would fight them.
    return v === null ? DEFAULT_DRAFT_AMOUNT : v
  } catch { return DEFAULT_DRAFT_AMOUNT }
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
  // Thresholds default to "off". They are a broadcaster feature: a streamer
  // decides what a message has to be worth to reach their audience. A regular
  // user has no audience, so leaving these unset means every burn shows and
  // nothing is gated. 0 = unset.
  fxThreshold: 0,             // special effect for burns >= this many h173k (req 13)
  fxEnabled: false,
  fxDuration: 6.5,            // seconds the big-burn effect stays on screen
  fxNickSize: 28,             // px font size of the nickname inside the big-burn effect
  fxTextSize: 16,             // px font size of the message text inside the big-burn effect
  fxVerticalPos: 50,          // vertical position of the effect (0 = top, 100 = bottom)
  fxDim: 85,                  // how much to darken everything behind the effect (0-100 %)
  tickerSize: 13,             // px font size of the h173k ticker in the header
  watchOnly: false,           // watch-only mode: hide controls, show only the chat
                              // (toggled from the header eye button, not from Settings)
  fxReplayOnTap: true,        // tapping a big-burn message replays its effect
  // The notice only makes sense on a broadcaster's screen, and only once a
  // threshold actually exists. It stays hidden until one is set (see
  // ThresholdNotice, which also requires a non-zero threshold to render).
  thresholdNoticeEnabled: false,
  balanceRefreshSec: 20,      // how often balances are refreshed (0 = manual only)
  // --- Burn goals (community burn targets) ---
  // More than one goal can run at the same time: a long-term target and a
  // short "tonight only" one, or several keyword-gated pots side by side.
  // Every goal counts independently from the same stream of burns, so one
  // burn can move several bars at once.
  goalEnabled: false,         // master switch: show the goal bars + fire the effects
  goalTitleSize: 13,          // px font size of the heading on every bar
  goals: [],                  // see makeGoal() for the shape of one entry
  // --- Desktop / mobile notifications ---
  notifyEnabled: false,       // master switch (also needs OS/browser permission)
  notifyMinAmount: 0,         // only notify for burns >= this many h173k (0 = all)
  notifyOnlyWhenHidden: true, // stay quiet while the user is looking at the chat
}

// ========== BURN GOALS (multiple) ==========
export const MAX_GOALS = 8
export const DEFAULT_GOAL_TEXT = '🎉 Goal reached! We burned it all down. 🔥'
// Id of the goal that older single-goal configs are migrated into. Fixed so the
// stored progress of that goal can be matched up with it (see migrateGoalProgress).
export const LEGACY_GOAL_ID = 'legacy'

let goalIdSeq = 0
export function newGoalId() {
  goalIdSeq += 1
  return `g${Date.now().toString(36)}${goalIdSeq.toString(36)}`
}

/** One goal, with every field defaulted. */
export function makeGoal(patch = {}) {
  return {
    id: patch.id || newGoalId(),
    title: typeof patch.title === 'string' ? patch.title : '',
    target: Number(patch.target) > 0 ? Number(patch.target) : 0,
    keywords: typeof patch.keywords === 'string' ? patch.keywords : '',
    text: typeof patch.text === 'string' && patch.text ? patch.text : DEFAULT_GOAL_TEXT,
    paused: !!patch.paused,
  }
}

/** Drop junk, force unique ids, enforce the cap. */
export function normalizeGoals(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const g = makeGoal(raw)
    if (seen.has(g.id)) g.id = newGoalId()
    seen.add(g.id)
    out.push(g)
    if (out.length >= MAX_GOALS) break
  }
  return out
}

// The visibility floor must always sit strictly BELOW the effect threshold.
// Otherwise a burn could trigger the full-screen effect while being filtered
// out of the list, which looks like a bug. The gap is one whole token where
// the threshold is large enough for that to be meaningful, and one raw unit
// otherwise, so the clamped value stays a round, readable number.
export function thresholdGap(reference) {
  return reference >= 1 ? 1 : 1 / Math.pow(10, TOKEN_DECIMALS)
}

/** Highest visibility floor allowed for a given effect threshold. */
export function maxVisibilityFloor(fxThreshold, fxEnabled) {
  if (!fxEnabled || !(fxThreshold > 0)) return Infinity
  return Math.max(0, fxThreshold - thresholdGap(fxThreshold))
}

/** Lowest effect threshold allowed for a given visibility floor. */
export function minEffectThreshold(minBurnFilter) {
  const floor = Number(minBurnFilter) || 0
  if (floor <= 0) return 0
  return floor + thresholdGap(floor)
}

export const BALANCE_REFRESH_MIN = 0    // 0 = manual refresh only
export const BALANCE_REFRESH_MAX = 3600 // 1 hour

// Goal title shown on the progress bar in chat. It wraps inside the panel, so
// it no longer has to fit on a single line.
export const GOAL_TITLE_MAX = 80
export const GOAL_TITLE_SIZE_MIN = 11
export const GOAL_TITLE_SIZE_MAX = 32
export const GOAL_KEYWORDS_MAX = 240

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

// Bumped when a default changes in a way that stored settings must follow.
// v2: thresholds became a broadcaster opt-in. Earlier builds shipped an
// effect threshold of 1,000,000 h173k switched on for everyone, which — at a
// few hundred dollars a token — told ordinary users they needed a fortune to
// be seen. Anyone still carrying that untouched default is moved to "off".
// v3: the single burn goal became a list of goals. The old goalTarget /
// goalTitle / goalKeywords / goalText / goalPaused fields are folded into one
// entry with a fixed id, so its accumulated progress carries over untouched.
const SETTINGS_VERSION = 3
const LEGACY_FX_THRESHOLD = 1000000

function migrateChatSettings(s) {
  if (s.settingsVersion >= SETTINGS_VERSION && Array.isArray(s.goals)) return s
  const next = { ...s, settingsVersion: SETTINGS_VERSION }
  // Only touch the value if it is exactly the old shipped default. A streamer
  // who deliberately chose a different number keeps it.
  if (next.fxEnabled === true && Number(next.fxThreshold) === LEGACY_FX_THRESHOLD) {
    next.fxEnabled = false
    next.fxThreshold = 0
    next.thresholdNoticeEnabled = false
  }
  // The merge with DEFAULT_CHAT_SETTINGS always supplies a goals array, so its
  // mere presence proves nothing — an *empty* one is what marks a config that
  // still has its goal in the old flat fields.
  if (!Array.isArray(next.goals) || next.goals.length === 0) {
    // A config that never had a goal configured migrates to an empty list
    // rather than to a blank placeholder goal.
    const hadGoal = Number(next.goalTarget) > 0
      || (typeof next.goalTitle === 'string' && next.goalTitle.trim())
      || (typeof next.goalKeywords === 'string' && next.goalKeywords.trim())
    next.goals = hadGoal ? [makeGoal({
      id: LEGACY_GOAL_ID,
      title: next.goalTitle,
      target: next.goalTarget,
      keywords: next.goalKeywords,
      text: next.goalText,
      paused: next.goalPaused,
    })] : []
  }
  delete next.goalTarget
  delete next.goalTitle
  delete next.goalKeywords
  delete next.goalText
  delete next.goalPaused
  return next
}

/**
 * Enforce "visibility floor < effect threshold" on a settings object.
 * Applied on both load and save, so the invariant holds no matter how the
 * value got there — a legacy config written before this rule existed, a
 * hand-edited localStorage entry, or a future code path that forgets to clamp.
 * The effect threshold is treated as the authority and the floor gives way,
 * because the floor is the cheaper thing to be wrong about.
 */
export function enforceThresholdOrder(s) {
  const fxOn = !!s.fxEnabled && Number(s.fxThreshold) > 0
  if (!fxOn) return s
  const cap = maxVisibilityFloor(s.fxThreshold, true)
  if (Number(s.minBurnFilter) > cap) return { ...s, minBurnFilter: cap }
  return s
}

export function getChatSettings() {
  try {
    const stored = localStorage.getItem(CHAT_SETTINGS_KEY)
    if (!stored) return { ...DEFAULT_CHAT_SETTINGS, goals: [], settingsVersion: SETTINGS_VERSION }
    const merged = migrateChatSettings({ ...DEFAULT_CHAT_SETTINGS, ...JSON.parse(stored) })
    merged.goals = normalizeGoals(merged.goals)
    return enforceThresholdOrder(merged)
  } catch { return { ...DEFAULT_CHAT_SETTINGS, goals: [], settingsVersion: SETTINGS_VERSION } }
}
export function saveChatSettings(s) {
  try {
    const next = enforceThresholdOrder({ ...s, goals: normalizeGoals(s.goals) })
    localStorage.setItem(CHAT_SETTINGS_KEY, JSON.stringify(next))
    return true
  } catch { return false }
}

// ========== BURN GOAL PROGRESS (req: cumulative across runs) ==========
// The goal accumulator must survive restarts: we persist the running total of
// burned h173k, whether the celebration already fired, the target it was last
// measured against, and the signatures already counted (so re-fetched messages
// are never double-counted). `counted` is capped FIFO — re-appearing signatures
// after a restart are always the most-recent ones, so they stay in the list.
const GOAL_PROGRESS_KEY = 'h173kbc_goal_progress'
const COUNTED_CAP = 5000

export const DEFAULT_GOAL_PROGRESS = {
  // Signatures already processed, shared by every goal. A burn is examined
  // once and offered to all goals in the same pass, so one list is enough and
  // adding a goal later can never back-fill it with the old backlog.
  seen: [],
  // Per-goal totals, keyed by goal id:
  //   { burned, reached, lastTarget, started }
  goals: {},
}

export function makeGoalState(target = 0) {
  return { burned: 0, reached: false, lastTarget: Number(target) || 0, started: false }
}

// Keep only the newest `cap` items of an array (drops the oldest).
export function capList(arr, cap = COUNTED_CAP) {
  if (!Array.isArray(arr)) return []
  return arr.length > cap ? arr.slice(arr.length - cap) : arr
}

/**
 * Bring a stored progress blob up to the multi-goal shape. A pre-1.20 entry
 * has its running total kept and re-filed under LEGACY_GOAL_ID — the same id
 * the settings migration gives the goal it came from — so an in-flight goal
 * does not lose its progress when the app updates.
 */
function migrateGoalProgress(raw) {
  if (!raw || typeof raw !== 'object') return { seen: [], goals: {} }
  if (raw.goals && typeof raw.goals === 'object' && !Array.isArray(raw.goals)) {
    return {
      seen: Array.isArray(raw.seen) ? raw.seen : [],
      goals: raw.goals,
    }
  }
  return {
    seen: Array.isArray(raw.counted) ? raw.counted : [],
    goals: raw.started ? {
      [LEGACY_GOAL_ID]: {
        burned: Number(raw.burned) > 0 ? Number(raw.burned) : 0,
        reached: !!raw.reached,
        lastTarget: Number(raw.lastTarget) || 0,
        started: true,
      },
    } : {},
  }
}

export function getGoalProgress() {
  try {
    const stored = localStorage.getItem(GOAL_PROGRESS_KEY)
    if (!stored) return { seen: [], goals: {} }
    const p = migrateGoalProgress(JSON.parse(stored))
    const goals = {}
    for (const [id, st] of Object.entries(p.goals || {})) {
      if (!st || typeof st !== 'object') continue
      goals[id] = {
        burned: Number(st.burned) > 0 ? Number(st.burned) : 0,
        reached: !!st.reached,
        lastTarget: Number(st.lastTarget) || 0,
        started: !!st.started,
      }
    }
    return { seen: Array.isArray(p.seen) ? p.seen : [], goals }
  } catch { return { seen: [], goals: {} } }
}

/** Total burned toward one goal, 0 when it hasn't started counting. */
export function goalBurnedFor(progress, goalId) {
  const st = progress?.goals?.[goalId]
  return st && st.burned > 0 ? st.burned : 0
}
export function saveGoalProgress(p) {
  try { localStorage.setItem(GOAL_PROGRESS_KEY, JSON.stringify(p)); return true } catch { return false }
}
export function resetGoalProgress() {
  try { localStorage.removeItem(GOAL_PROGRESS_KEY); return true } catch { return false }
}

// ========== BIG-BURN EFFECT STATE (req: big burns keep their effect across runs) ==========
// Which big burns already triggered their celebration, persisted so the effect
// is not replayed on every restart, while still letting big burns that happened
// while the app was closed fire their effect once when we come back online.
const FX_STATE_KEY = 'h173kbc_fx_celebrated'

export const DEFAULT_FX_STATE = {
  baseline: false, // has the historical backlog been seeded (avoids a popup storm on first ever run)
  sigs: [],        // signatures already celebrated
}

export function getFxState() {
  try {
    const stored = localStorage.getItem(FX_STATE_KEY)
    if (!stored) return { ...DEFAULT_FX_STATE }
    const s = { ...DEFAULT_FX_STATE, ...JSON.parse(stored) }
    if (!Array.isArray(s.sigs)) s.sigs = []
    return s
  } catch { return { ...DEFAULT_FX_STATE } }
}
export function saveFxState(s) {
  try { localStorage.setItem(FX_STATE_KEY, JSON.stringify(s)); return true } catch { return false }
}

// ========== REPLENISH SOL SETTINGS (used by useSwap) ==========
const REPLENISH_SETTINGS_KEY = 'h173kbc_replenish_settings'
export const WSOL_ATA_RENT = 0.00204
// Rent for one SPL associated-token-account (same size as the WSOL one).
export const ATA_RENT = 0.00204
// Solana base signature fee.
export const BASE_TX_FEE = 0.000005
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
// ========== MODERATION (local) ==========
// Important limitation: burns are on-chain transfers with memos. Nothing here
// deletes anything from Solana — the transaction stays public and visible in
// any explorer, and other people's copies of the app are unaffected. This is a
// local display filter for the broadcaster's own screen, which is the one going
// out on stream. Treated as moderation of the *broadcast*, not of the chain.
const MODERATION_KEY = 'h173kbc_moderation'
const MODERATION_CAP = 2000

// `hidden` is what Settings lists and offers to restore. `hiddenArchived` holds
// signatures the user cleared off that list without un-hiding them: still
// filtered out of the chat, just no longer cluttering the review screen. A busy
// broadcaster hides dozens of messages a stream, and the list is only useful
// while it is short enough to read.
export function getModeration() {
  try {
    const stored = localStorage.getItem(MODERATION_KEY)
    if (!stored) return { banned: [], hidden: [], hiddenArchived: [] }
    const m = JSON.parse(stored)
    return {
      banned: Array.isArray(m.banned) ? m.banned : [],
      hidden: Array.isArray(m.hidden) ? m.hidden : [],
      hiddenArchived: Array.isArray(m.hiddenArchived) ? m.hiddenArchived : [],
    }
  } catch { return { banned: [], hidden: [], hiddenArchived: [] } }
}

export function saveModeration(m) {
  try {
    localStorage.setItem(MODERATION_KEY, JSON.stringify({
      banned: (m.banned || []).slice(-MODERATION_CAP),
      hidden: (m.hidden || []).slice(-MODERATION_CAP),
      hiddenArchived: (m.hiddenArchived || []).slice(-MODERATION_CAP),
    }))
    return true
  } catch { return false }
}

/**
 * Every signature the chat must filter out — the listed ones and the ones
 * dismissed from the list. Both stay invisible; only their presence in the
 * Settings list differs.
 */
export function allHiddenSignatures(m) {
  return new Set([...(m?.hidden || []), ...(m?.hiddenArchived || [])])
}

/** Ban a sender address. Returns the updated moderation state. */
export function banSender(address) {
  const m = getModeration()
  if (!address || m.banned.includes(address)) return m
  const next = { ...m, banned: [...m.banned, address] }
  saveModeration(next)
  return next
}

export function unbanSender(address) {
  const m = getModeration()
  const next = { ...m, banned: m.banned.filter(a => a !== address) }
  saveModeration(next)
  return next
}

/** Hide a single message by transaction signature. */
export function hideMessage(signature) {
  const m = getModeration()
  if (!signature) return m
  if (m.hidden.includes(signature) || m.hiddenArchived.includes(signature)) return m
  const next = { ...m, hidden: [...m.hidden, signature] }
  saveModeration(next)
  return next
}

/** Make a message visible again — clears it from both hidden lists. */
export function unhideMessage(signature) {
  const m = getModeration()
  const next = {
    ...m,
    hidden: m.hidden.filter(s => s !== signature),
    hiddenArchived: m.hiddenArchived.filter(s => s !== signature),
  }
  saveModeration(next)
  return next
}

/**
 * Take one entry off the Settings list while leaving the message hidden in
 * chat. Deliberately not the same as restoring: the moderation decision
 * stands, only the reminder of it goes away.
 */
export function archiveHiddenMessage(signature) {
  const m = getModeration()
  if (!signature || !m.hidden.includes(signature)) return m
  const next = {
    ...m,
    hidden: m.hidden.filter(s => s !== signature),
    hiddenArchived: m.hiddenArchived.includes(signature)
      ? m.hiddenArchived
      : [...m.hiddenArchived, signature],
  }
  saveModeration(next)
  return next
}

/** Same, for the whole list at once. */
export function archiveAllHiddenMessages() {
  const m = getModeration()
  if (!m.hidden.length) return m
  const merged = [...m.hiddenArchived]
  for (const s of m.hidden) if (!merged.includes(s)) merged.push(s)
  const next = { ...m, hidden: [], hiddenArchived: merged }
  saveModeration(next)
  return next
}

/** Bring every dismissed entry back onto the list (still hidden in chat). */
export function unarchiveHiddenMessages() {
  const m = getModeration()
  if (!m.hiddenArchived.length) return m
  const merged = [...m.hidden]
  for (const s of m.hiddenArchived) if (!merged.includes(s)) merged.push(s)
  const next = { ...m, hidden: merged, hiddenArchived: [] }
  saveModeration(next)
  return next
}

/** Un-hide everything that was dismissed from the list. */
export function unhideArchivedMessages() {
  const m = getModeration()
  const next = { ...m, hiddenArchived: [] }
  saveModeration(next)
  return next
}

export function clearModeration() {
  const empty = { banned: [], hidden: [], hiddenArchived: [] }
  saveModeration(empty)
  return empty
}

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
