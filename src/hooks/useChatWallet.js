/**
 * h173k Burn Chat - sender wallet hook
 * - tracks SOL + h173k balances (refresh interval is user-configurable)
 * - sends a burn: SPL h173k transfer to the burn address + memo (nick + text)
 * - if paying with SOL: swaps SOL -> h173k on the h173k-SOL pool first,
 *   then sends the received h173k with the memo (req 16)
 *
 * Fresh, SOL-only wallets are the tricky case: there is no h173k associated
 * token account yet, so every SOL cost has to be accounted for up front (WSOL
 * rent, h173k ATA rent, the burn-address ATA rent, fees) and the amount that
 * finally gets transferred has to be re-checked against the real on-chain
 * balance right before signing.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  PublicKey, Transaction, TransactionInstruction,
  LAMPORTS_PER_SOL, ComputeBudgetProgram,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress, getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction, TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  TOKEN_MINT, TOKEN_DECIMALS, MEMO_PROGRAM_ID,
  ATA_RENT, WSOL_ATA_RENT, BASE_TX_FEE,
  getReplenishSettings, getReplenishEnabled,
} from '../constants'
import { useSwap } from './useSwap'

const POW = Math.pow(10, TOKEN_DECIMALS)
// Small cushion on top of every computed SOL requirement.
const SOL_SAFETY_BUFFER = 0.0005

export function useChatWallet(connection, sessionWallet, refreshMs = 20000) {
  const [solBalance, setSolBalance] = useState(0)
  const [h173kBalance, setH173kBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const mounted = useRef(true)

  // wallet adapter for useSwap (stable across renders)
  const walletAdapter = useMemo(() => {
    if (!sessionWallet || !sessionWallet.publicKey) return null
    return {
      publicKey: sessionWallet.publicKey,
      signTransaction: (tx) => sessionWallet.signTransaction(tx),
    }
  }, [sessionWallet, sessionWallet?.publicKey])

  const swap = useSwap(connection, walletAdapter)

  const fetchBalances = useCallback(async () => {
    if (!connection || !sessionWallet?.publicKey) return
    try {
      const pk = sessionWallet.publicKey
      const lamports = await connection.getBalance(pk)
      if (mounted.current) { setSolBalance(lamports / LAMPORTS_PER_SOL); setError(null) }
      try {
        const ata = await getAssociatedTokenAddress(TOKEN_MINT, pk)
        const acc = await getAccount(connection, ata)
        if (mounted.current) setH173kBalance(Number(acc.amount) / POW)
      } catch {
        // no token account yet (SOL-only wallet) -> zero, not an error
        if (mounted.current) setH173kBalance(0)
      }
      if (mounted.current) setLastUpdated(Date.now())
    } catch (err) {
      if (mounted.current) setError(err.message)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [connection, sessionWallet])

  // Auto-refresh on the user-configured interval. 0 (or less) disables the
  // timer entirely, leaving only the manual refresh.
  useEffect(() => {
    mounted.current = true
    fetchBalances()
    const ms = Number(refreshMs)
    if (!(ms > 0)) return () => { mounted.current = false }
    const id = setInterval(fetchBalances, ms)
    return () => { mounted.current = false; clearInterval(id) }
  }, [fetchBalances, refreshMs])

  /* ---------- helpers ---------- */

  const userAtaOf = useCallback(
    () => getAssociatedTokenAddress(TOKEN_MINT, sessionWallet.publicKey),
    [sessionWallet]
  )

  const readH173kRaw = useCallback(async () => {
    try {
      const acc = await getAccount(connection, await userAtaOf())
      return acc.amount // BigInt
    } catch { return 0n }
  }, [connection, userAtaOf])

  const accountExists = useCallback(async (addr) => {
    try { await getAccount(connection, addr); return true } catch { return false }
  }, [connection])

  /**
   * What this burn will really cost in SOL, based on live chain state.
   *  - fee        : base signature fee + the configured priority fee
   *  - burnAtaRent: rent we pay if the burn address has no h173k account yet
   *  - userAtaRent: rent we pay if WE have no h173k account yet (created by the
   *                 SOL -> h173k swap, and never refunded)
   *  - swapReserve: everything a SOL -> h173k conversion needs on top of the
   *                 SOL actually being swapped (WSOL rent is refunded when the
   *                 wrapped account is closed, but must be covered meanwhile)
   */
  const estimateCosts = useCallback(async (burnAddress) => {
    const { swapFeeSol } = getReplenishSettings()
    const priority = Math.max(0, Number(swapFeeSol) || 0)
    const fee = BASE_TX_FEE + priority

    let burnAtaRent = 0
    try {
      const burnPk = new PublicKey(burnAddress)
      const burnAta = await getAssociatedTokenAddress(TOKEN_MINT, burnPk, true)
      if (!(await accountExists(burnAta))) burnAtaRent = ATA_RENT
    } catch { /* an invalid address is reported later by the transfer itself */ }

    const userAtaRent = (await accountExists(await userAtaOf())) ? 0 : ATA_RENT

    // SOL needed to *send* the burn transaction
    const burnTxCost = fee + burnAtaRent + SOL_SAFETY_BUFFER
    // SOL that must stay untouched when converting SOL -> h173k:
    // swap fee + WSOL rent (transient) + our new h173k ATA rent + the burn tx
    const swapReserve = fee + WSOL_ATA_RENT + userAtaRent + burnTxCost

    return { fee, burnAtaRent, userAtaRent, burnTxCost, swapReserve }
  }, [accountExists, userAtaOf])

  /**
   * Wait for the token balance to actually grow after a swap. Reading straight
   * away can still return the pre-swap value on a lagging RPC, which used to
   * surface as a bogus "Nothing to burn" right after the SOL was already spent.
   */
  const waitForH173kIncrease = useCallback(async (beforeRaw, tries = 8, delayMs = 900) => {
    let raw = beforeRaw
    for (let i = 0; i < tries; i++) {
      await new Promise(r => setTimeout(r, delayMs))
      raw = await readH173kRaw()
      if (raw > beforeRaw) return raw
    }
    return raw
  }, [readH173kRaw])

  /* ---------- burn transaction ---------- */

  // Build + send the burn transfer with memo.
  // `amountH173k` is a ceiling: the amount actually sent is clamped to the real
  // balance at signing time, so an auto-replenish swap that happened in between
  // (and sold part of the h173k) can never turn into an "insufficient funds"
  // transaction failure.
  const sendBurnTransfer = useCallback(async (amountH173k, memoString, burnAddress) => {
    const pk = sessionWallet.publicKey
    const burnPk = new PublicKey(burnAddress)
    const userAta = await getAssociatedTokenAddress(TOKEN_MINT, pk)
    const burnAta = await getAssociatedTokenAddress(TOKEN_MINT, burnPk, true)

    const balanceRaw = await readH173kRaw()
    if (balanceRaw <= 0n) {
      throw new Error('No h173k in the account to burn — deposit h173k or SOL first.')
    }
    let rawAmount = BigInt(Math.floor(amountH173k * POW))
    if (rawAmount > balanceRaw) rawAmount = balanceRaw
    if (rawAmount <= 0n) throw new Error('Amount too small')
    const sentAmount = Number(rawAmount) / POW

    const tx = new Transaction()

    // Compute budget. Memo cost scales with message length (~310 CU/byte), so a
    // 500-byte message needs ~155k CU; with the token transfer and a possible ATA
    // creation we reserve a safe headroom.
    const units = 300_000
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units }))

    // optional priority fee — the per-CU price is derived from the desired total,
    // so the fee stays ≈ swapFeeSol regardless of the unit limit (you only pay for
    // CUs actually consumed).
    const { swapFeeSol } = getReplenishSettings()
    if (swapFeeSol > 0) {
      const priorityLamports = Math.round(swapFeeSol * LAMPORTS_PER_SOL)
      const micro = Math.ceil((priorityLamports * 1_000_000) / units)
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: micro }))
    }

    // create burn ATA if missing (payer = user)
    if (!(await accountExists(burnAta))) {
      tx.add(createAssociatedTokenAccountInstruction(pk, burnAta, burnPk, TOKEN_MINT))
    }

    // transfer h173k
    tx.add(createTransferCheckedInstruction(
      userAta, TOKEN_MINT, burnAta, pk, rawAmount, TOKEN_DECIMALS, [], TOKEN_PROGRAM_ID
    ))

    // memo instruction (signer = user, for attribution)
    tx.add(new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: pk, isSigner: true, isWritable: false }],
      data: Buffer.from(memoString, 'utf8'),
    }))

    const { blockhash } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = pk

    const signed = sessionWallet.signTransaction(tx)
    const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 })
    await connection.confirmTransaction(sig, 'confirmed')
    return { signature: sig, sentAmount }
  }, [connection, sessionWallet, readH173kRaw, accountExists])

  /**
   * Run the burn transfer, only falling back to the h173k -> SOL auto-replenish
   * when the wallet genuinely cannot pay for the transaction. Replenishing when
   * SOL is already sufficient would sell part of the very h173k we are about to
   * burn (and right after a SOL -> h173k conversion the balance always sits
   * just under the replenish threshold).
   */
  const runBurnTransfer = useCallback(async (amount, memoString, burnAddress, onProgress) => {
    const op = () => sendBurnTransfer(amount, memoString, burnAddress)
    if (!getReplenishEnabled()) return await op()
    try {
      const { burnTxCost } = await estimateCosts(burnAddress)
      const sol = await connection.getBalance(sessionWallet.publicKey) / LAMPORTS_PER_SOL
      if (sol >= burnTxCost) return await op()
    } catch { /* fall through to the guarded path */ }
    onProgress?.('Topping up SOL…')
    return await swap.withAutoSOL(op)
  }, [connection, sessionWallet, sendBurnTransfer, estimateCosts, swap])

  /* ---------- public API ---------- */

  // PUBLIC: pay with existing h173k
  const sendWithH173K = useCallback(async (amountH173k, memoString, burnAddress, onProgress) => {
    setError(null)
    const res = await runBurnTransfer(amountH173k, memoString, burnAddress, onProgress)
    await fetchBalances()
    return { signature: res.signature, sentAmount: res.sentAmount }
  }, [runBurnTransfer, fetchBalances])

  // PUBLIC: pay with SOL -> convert to h173k -> send that h173k (req 16)
  const sendWithSOL = useCallback(async (solAmount, memoString, burnAddress, onSwap) => {
    setError(null)
    const beforeRaw = await readH173kRaw()

    if (onSwap) onSwap({ status: 'swapping' })
    const res = await swap.convertSOLtoH173K(solAmount)
    if (onSwap) onSwap({ status: 'swapped', h173kReceived: res.h173kReceived })

    const afterRaw = await waitForH173kIncrease(beforeRaw)
    let receivedRaw = afterRaw - beforeRaw
    if (receivedRaw <= 0n) {
      // fall back to the quoted output
      receivedRaw = BigInt(Math.floor((res.h173kReceived || 0) * POW))
    }
    const sendAmount = Number(receivedRaw) / POW
    if (!(sendAmount > 0)) throw new Error('Swap produced no h173k to send')

    const out = await runBurnTransfer(sendAmount, memoString, burnAddress)
    await fetchBalances()
    return { signature: out.signature, sentAmount: out.sentAmount, solSwapped: solAmount }
  }, [swap, readH173kRaw, waitForH173kIncrease, runBurnTransfer, fetchBalances])

  /**
   * Estimate the largest burn the wallet can currently fund: the h173k already
   * held plus whatever the spendable SOL would convert into. Used by the MAX
   * button so a SOL-only wallet doesn't just see 0.
   */
  const estimateMaxBurnable = useCallback(async (burnAddress) => {
    const haveRaw = await readH173kRaw()
    const have = Number(haveRaw) / POW
    let fromSol = 0
    try {
      const { swapReserve } = await estimateCosts(burnAddress)
      const sol = await connection.getBalance(sessionWallet.publicKey) / LAMPORTS_PER_SOL
      const spendable = sol - swapReserve
      if (spendable > 0) {
        const q = await swap.getSwapQuoteSOLtoH173K(spendable)
        // stay under the quote so slippage can't make the number unreachable
        fromSol = Math.max(0, (q.outputAmount || 0) * 0.97)
      }
    } catch { /* leave fromSol at 0 */ }
    return { total: have + fromSol, fromH173k: have, fromSol }
  }, [connection, sessionWallet, readH173kRaw, estimateCosts, swap])

  /**
   * PUBLIC unified entry (req 16): the user only specifies how much h173k to burn.
   * - if the wallet already holds enough h173k -> burn it directly
   * - otherwise, if there is SOL, automatically convert just enough SOL into
   *   h173k to cover the shortfall, then burn the requested amount
   * No "pay with" choice is exposed to the user.
   */
  const burn = useCallback(async (amountH173k, memoString, burnAddress, onProgress) => {
    setError(null)
    const pk = sessionWallet.publicKey

    const costs = await estimateCosts(burnAddress)
    let haveRaw = await readH173kRaw()
    let have = Number(haveRaw) / POW

    // Top up from SOL if h173k is insufficient
    if (have < amountH173k) {
      const shortfall = amountH173k - have
      const sol = await connection.getBalance(pk) / LAMPORTS_PER_SOL
      const spendable = sol - costs.swapReserve
      if (!(spendable > 0)) {
        throw new Error(
          `Not enough h173k, and not enough SOL to convert. ` +
          `You have ${sol.toFixed(6)} SOL — about ${costs.swapReserve.toFixed(4)} SOL is needed ` +
          `for account rent and fees before any of it can be swapped.`
        )
      }
      onProgress?.('Pricing SOL → h173k…')
      let solNeeded = await swap.quoteSOLForH173K(shortfall)
      // cap to what we can spend; we'll burn whatever h173k we end up with
      if (solNeeded > spendable) solNeeded = spendable
      if (!(solNeeded > 0)) throw new Error('Amount too small to convert from SOL')

      onProgress?.('Converting SOL → h173k…')
      await swap.convertSOLtoH173K(solNeeded)
      onProgress?.('Confirming conversion…')
      haveRaw = await waitForH173kIncrease(haveRaw)
      have = Number(haveRaw) / POW
      if (!(have > 0)) {
        throw new Error('The SOL → h173k conversion did not settle in time. Check your balance and try again.')
      }
    }

    // Decide the final burn amount: never more than we actually hold
    const amount = Math.min(amountH173k, have)
    if (!(amount > 0)) throw new Error('Nothing to burn — fund the wallet first')

    onProgress?.('Sending burn…')
    const res = await runBurnTransfer(amount, memoString, burnAddress, onProgress)
    await fetchBalances()
    return { signature: res.signature, sentAmount: res.sentAmount }
  }, [
    connection, sessionWallet, swap, readH173kRaw, waitForH173kIncrease,
    estimateCosts, runBurnTransfer, fetchBalances,
  ])

  return {
    solBalance, h173kBalance, loading, error, lastUpdated,
    refresh: fetchBalances,
    burn, sendWithH173K, sendWithSOL,
    estimateMaxBurnable, estimateCosts,
    swapLoading: swap.loading,
  }
}
