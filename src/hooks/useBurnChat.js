/**
 * h173k Burn Chat - on-chain listener
 *
 * Watches the burn address' h173k associated-token-account for incoming
 * SPL transfers of the h173k mint that carry a memo. Builds chat messages.
 *
 * Efficiency (req 18):
 *  - On load: ONE getSignaturesForAddress(limit) + per-signature getParsedTransaction
 *    fetched with capped concurrency (no JSON-RPC batch — free RPC tiers reject it).
 *  - While live: poll getSignaturesForAddress({ until: lastSig }) which returns
 *    ONLY signatures newer than the last one we saw -> no re-fetching, no API spam.
 *  - The limit only governs the INITIAL pull. Messages accumulated live stay in
 *    memory beyond the limit; hiding is done by filters, never by the limit.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { TOKEN_MINT, TOKEN_DECIMALS, MEMO_SEP, MAX_TEXT_CHARS } from '../constants'
import { sanitizeText } from '../utils'

const POLL_INTERVAL = 12000 // ms - gentle on the RPC
// Fetch transactions individually with limited concurrency. Many providers
// (e.g. Helius free tier) reject JSON-RPC *batch* requests with a 403, which
// is what getParsedTransactions(array) sends — so we never batch.
const PARSE_CONCURRENCY = 5

// Run async tasks with a fixed concurrency cap, preserving input order.
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  async function run() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
    }
  }
  const runners = []
  for (let k = 0; k < Math.min(limit, items.length); k++) runners.push(run())
  await Promise.all(runners)
  return results
}

// Clean the memo string returned in the lightweight signatures list,
// which some RPCs prefix with "[len] ".
function cleanSigMemo(memo) {
  if (!memo) return null
  return memo.replace(/^\[\d+\]\s?/, '')
}

// Extract the raw memo string from a parsed transaction (most reliable source).
function extractMemo(tx) {
  if (!tx) return null
  const msg = tx.transaction?.message
  const collect = (instrs) => {
    if (!instrs) return null
    for (const ins of instrs) {
      if (ins.program === 'spl-memo' && typeof ins.parsed === 'string') return ins.parsed
      // Some nodes put the memo string directly in parsed for the memo program
      if (ins.programId && ins.programId.toString && ins.programId.toString().startsWith('Memo')) {
        if (typeof ins.parsed === 'string') return ins.parsed
      }
    }
    return null
  }
  let memo = collect(msg?.instructions)
  if (memo == null && tx.meta?.innerInstructions) {
    for (const inner of tx.meta.innerInstructions) {
      memo = collect(inner.instructions)
      if (memo != null) break
    }
  }
  return memo
}

// Amount of h173k credited to the burn token account in this tx, and the sender.
function extractTransfer(tx, burnOwner) {
  const meta = tx?.meta
  if (!meta) return { amount: 0, sender: null }
  const mintStr = TOKEN_MINT.toString()
  const pre = meta.preTokenBalances || []
  const post = meta.postTokenBalances || []

  const uiOf = (entry) => {
    if (!entry) return 0
    const u = entry.uiTokenAmount
    if (u?.uiAmount != null) return u.uiAmount
    if (u?.amount != null) return Number(u.amount) / Math.pow(10, u.decimals ?? TOKEN_DECIMALS)
    return 0
  }

  // Burn account: mint matches and owner == burn address
  const postBurn = post.find(b => b.mint === mintStr && b.owner === burnOwner)
  const preBurn = pre.find(b => b.mint === mintStr && b.owner === burnOwner)
  let amount = uiOf(postBurn) - uiOf(preBurn)
  if (amount < 0) amount = 0

  // Sender: a h173k account NOT owned by burn address whose balance dropped
  let sender = null
  let biggestDrop = 0
  for (const pb of pre) {
    if (pb.mint !== mintStr || pb.owner === burnOwner) continue
    const matchPost = post.find(x => x.accountIndex === pb.accountIndex)
    const drop = uiOf(pb) - uiOf(matchPost)
    if (drop > biggestDrop) { biggestDrop = drop; sender = pb.owner }
  }
  // Fallback: fee payer (first account key)
  if (!sender) {
    const keys = tx.transaction?.message?.accountKeys
    if (keys && keys.length) {
      const k = keys[0]
      sender = (k.pubkey ? k.pubkey.toString() : k.toString())
    }
  }
  return { amount, sender }
}

function parseMemoToMessage(rawMemo) {
  // memo format: nickname \u001F message   (separator removed by sanitizeText)
  let nick = ''
  let text = rawMemo || ''
  const idx = rawMemo ? rawMemo.indexOf(MEMO_SEP) : -1
  if (idx >= 0) {
    nick = rawMemo.slice(0, idx)
    text = rawMemo.slice(idx + 1)
  }
  return {
    nick: sanitizeText(nick, 64).trim(),
    text: sanitizeText(text, MAX_TEXT_CHARS),
  }
}

export function useBurnChat(connection, burnAddress, fetchLimit, onNewLive) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('connecting') // connecting | live | error

  const ataRef = useRef(null)
  const lastSigRef = useRef(null)
  const seenRef = useRef(new Set())
  const pollRef = useRef(null)
  const mountedRef = useRef(true)
  const onNewLiveRef = useRef(onNewLive)
  onNewLiveRef.current = onNewLive

  // Build a message object from a signature + its parsed tx
  const buildMessage = useCallback((sig, tx, burnOwner) => {
    let rawMemo = extractMemo(tx)
    if (rawMemo == null) rawMemo = cleanSigMemo(sig.memo)
    if (rawMemo == null) return null // no memo -> ignore (req 1)
    const { amount, sender } = extractTransfer(tx, burnOwner)
    if (!(amount > 0)) return null // only real incoming h173k transfers (req 1)
    const { nick, text } = parseMemoToMessage(rawMemo)
    return {
      signature: sig.signature,
      blockTime: sig.blockTime || tx?.blockTime || Math.floor(Date.now() / 1000),
      amount,
      sender,
      nick,
      text,
    }
  }, [])

  const fetchParsed = useCallback(async (signatures) => {
    // Fetch each transaction with a SINGLE getParsedTransaction request (no
    // batch RPC), capped concurrency to stay gentle on free RPC tiers.
    const txs = await mapWithConcurrency(signatures, PARSE_CONCURRENCY, async (s) => {
      try {
        return await connection.getParsedTransaction(s.signature, {
          maxSupportedTransactionVersion: 0,
        })
      } catch (e) {
        console.warn('getParsedTransaction failed for', s.signature, e?.message || e)
        return null
      }
    })
    const out = []
    for (let i = 0; i < signatures.length; i++) out.push({ sig: signatures[i], tx: txs[i] })
    return out
  }, [connection])

  const loadInitial = useCallback(async () => {
    if (!connection || !burnAddress) return
    setLoading(true)
    setError(null)
    setStatus('connecting')
    seenRef.current = new Set()
    lastSigRef.current = null
    try {
      const burnPk = new PublicKey(burnAddress)
      const ata = await getAssociatedTokenAddress(TOKEN_MINT, burnPk, true)
      ataRef.current = ata

      const sigs = await connection.getSignaturesForAddress(ata, { limit: Math.max(1, fetchLimit) })
      // newest first comes from RPC; remember newest signature for polling cursor
      if (sigs.length) lastSigRef.current = sigs[0].signature

      // Only need parsed tx for ones that succeeded
      const ok = sigs.filter(s => !s.err)
      const parsed = await fetchParsed(ok)

      const built = []
      for (const { sig, tx } of parsed) {
        const m = buildMessage(sig, tx, burnAddress)
        if (m && !seenRef.current.has(m.signature)) {
          seenRef.current.add(m.signature)
          built.push(m)
        }
      }
      if (!mountedRef.current) return
      setMessages(built)
      setStatus('live')
    } catch (err) {
      console.error('Burn chat load error:', err)
      if (mountedRef.current) { setError(err.message || String(err)); setStatus('error') }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [connection, burnAddress, fetchLimit, fetchParsed, buildMessage])

  const poll = useCallback(async () => {
    if (!connection || !ataRef.current) return
    try {
      const opts = { limit: 50 }
      if (lastSigRef.current) opts.until = lastSigRef.current
      const sigs = await connection.getSignaturesForAddress(ataRef.current, opts)
      if (!sigs.length) { setStatus('live'); return }
      // Advance cursor to newest
      lastSigRef.current = sigs[0].signature
      const ok = sigs.filter(s => !s.err && !seenRef.current.has(s.signature))
      if (!ok.length) { setStatus('live'); return }
      const parsed = await fetchParsed(ok)
      const fresh = []
      for (const { sig, tx } of parsed) {
        const m = buildMessage(sig, tx, burnAddress)
        if (m && !seenRef.current.has(m.signature)) {
          seenRef.current.add(m.signature)
          fresh.push(m)
        }
      }
      if (fresh.length && mountedRef.current) {
        setMessages(prev => [...fresh, ...prev])
        if (onNewLiveRef.current) onNewLiveRef.current(fresh)
      }
      setStatus('live')
    } catch (err) {
      console.error('Burn chat poll error:', err)
      // keep status live-ish; transient errors shouldn't nuke the chat
    }
  }, [connection, burnAddress, fetchParsed, buildMessage])

  useEffect(() => {
    mountedRef.current = true
    loadInitial()
    return () => { mountedRef.current = false }
  }, [loadInitial])

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(poll, POLL_INTERVAL)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [poll])

  return { messages, loading, error, status, refresh: loadInitial }
}
