/**
 * h173k Burn Chat - sender wallet hook
 * - tracks SOL + h173k balances
 * - sends a burn: SPL h173k transfer to the burn address + memo (nick + text)
 * - if paying with SOL: swaps SOL -> h173k on the h173k-SOL pool first,
 *   then sends the received h173k with the memo (req 16)
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
  getReplenishSettings, getReplenishEnabled,
} from '../constants'
import { useSwap } from './useSwap'

export function useChatWallet(connection, sessionWallet) {
  const [solBalance, setSolBalance] = useState(0)
  const [h173kBalance, setH173kBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
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
      if (mounted.current) setSolBalance(lamports / LAMPORTS_PER_SOL)
      try {
        const ata = await getAssociatedTokenAddress(TOKEN_MINT, pk)
        const acc = await getAccount(connection, ata)
        if (mounted.current) setH173kBalance(Number(acc.amount) / Math.pow(10, TOKEN_DECIMALS))
      } catch {
        if (mounted.current) setH173kBalance(0)
      }
    } catch (err) {
      if (mounted.current) setError(err.message)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [connection, sessionWallet])

  useEffect(() => {
    mounted.current = true
    fetchBalances()
    const id = setInterval(fetchBalances, 20000)
    return () => { mounted.current = false; clearInterval(id) }
  }, [fetchBalances])

  // Build + send the burn transfer with memo
  const sendBurnTransfer = useCallback(async (amountH173k, memoString, burnAddress) => {
    const pk = sessionWallet.publicKey
    const burnPk = new PublicKey(burnAddress)
    const userAta = await getAssociatedTokenAddress(TOKEN_MINT, pk)
    const burnAta = await getAssociatedTokenAddress(TOKEN_MINT, burnPk, true)

    const tx = new Transaction()

    // optional priority fee
    const { swapFeeSol } = getReplenishSettings()
    if (swapFeeSol > 0) {
      const units = 80_000
      const priorityLamports = Math.round(swapFeeSol * LAMPORTS_PER_SOL)
      const micro = Math.ceil((priorityLamports * 1_000_000) / units)
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units }))
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: micro }))
    }

    // create burn ATA if missing (payer = user)
    let burnAtaExists = true
    try { await getAccount(connection, burnAta) } catch { burnAtaExists = false }
    if (!burnAtaExists) {
      tx.add(createAssociatedTokenAccountInstruction(pk, burnAta, burnPk, TOKEN_MINT))
    }

    // transfer h173k
    const rawAmount = BigInt(Math.floor(amountH173k * Math.pow(10, TOKEN_DECIMALS)))
    if (rawAmount <= 0n) throw new Error('Amount too small')
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
    return sig
  }, [connection, sessionWallet])

  // PUBLIC: pay with existing h173k
  const sendWithH173K = useCallback(async (amountH173k, memoString, burnAddress, onSwap) => {
    setError(null)
    const op = () => sendBurnTransfer(amountH173k, memoString, burnAddress)
    let sig
    if (getReplenishEnabled()) {
      // ensures enough SOL for the fee by auto-swapping a little h173k if needed
      sig = await swap.withAutoSOL(op, onSwap)
    } else {
      sig = await op()
    }
    await fetchBalances()
    return { signature: sig, sentAmount: amountH173k }
  }, [sendBurnTransfer, swap, fetchBalances])

  // PUBLIC: pay with SOL -> convert to h173k -> send that h173k (req 16)
  const sendWithSOL = useCallback(async (solAmount, memoString, burnAddress, onSwap) => {
    setError(null)
    const pk = sessionWallet.publicKey
    const userAta = await getAssociatedTokenAddress(TOKEN_MINT, pk)

    // balance before
    let beforeRaw = 0n
    try { const acc = await getAccount(connection, userAta); beforeRaw = acc.amount } catch {}

    if (onSwap) onSwap({ status: 'swapping' })
    const res = await swap.convertSOLtoH173K(solAmount)
    if (onSwap) onSwap({ status: 'swapped', h173kReceived: res.h173kReceived })

    // wait a moment then read actual received amount
    await new Promise(r => setTimeout(r, 1500))
    let afterRaw = beforeRaw
    try { const acc = await getAccount(connection, userAta); afterRaw = acc.amount } catch {}
    let receivedRaw = afterRaw - beforeRaw
    if (receivedRaw <= 0n) {
      // fall back to quoted output
      receivedRaw = BigInt(Math.floor((res.h173kReceived || 0) * Math.pow(10, TOKEN_DECIMALS)))
    }
    const sendAmount = Number(receivedRaw) / Math.pow(10, TOKEN_DECIMALS)
    if (!(sendAmount > 0)) throw new Error('Swap produced no h173k to send')

    const sig = await sendBurnTransfer(sendAmount, memoString, burnAddress)
    await fetchBalances()
    return { signature: sig, sentAmount: sendAmount, solSwapped: solAmount }
  }, [connection, sessionWallet, swap, sendBurnTransfer, fetchBalances])

  /**
   * PUBLIC unified entry (req 16): the user only specifies how much h173k to burn.
   * - if the wallet already holds enough h173k -> burn it directly
   * - otherwise, if there is SOL, automatically convert just enough SOL into
   *   h173k to cover the shortfall, then burn the requested amount
   * No "pay with" choice is exposed to the user.
   */
  const burn = useCallback(async (amountH173k, memoString, burnAddress, onProgress) => {
    setError(null)
    const FEE_RESERVE = 0.01 // SOL kept aside for tx fees
    const pk = sessionWallet.publicKey
    const userAta = await getAssociatedTokenAddress(TOKEN_MINT, pk)

    const readH173k = async () => {
      try { const acc = await getAccount(connection, userAta); return Number(acc.amount) / Math.pow(10, TOKEN_DECIMALS) }
      catch { return 0 }
    }

    let have = await readH173k()

    // Top up from SOL if h173k is insufficient
    if (have < amountH173k) {
      const shortfall = amountH173k - have
      const sol = await connection.getBalance(pk) / LAMPORTS_PER_SOL
      if (sol <= FEE_RESERVE) {
        throw new Error('Not enough h173k, and not enough SOL to convert')
      }
      onProgress?.('Pricing SOL → h173k…')
      let solNeeded = await swap.quoteSOLForH173K(shortfall)
      const spendable = sol - FEE_RESERVE
      if (solNeeded > spendable) {
        // cap to what we can spend; we'll burn whatever h173k we end up with
        solNeeded = spendable
      }
      onProgress?.('Converting SOL → h173k…')
      await swap.convertSOLtoH173K(solNeeded)
      await new Promise(r => setTimeout(r, 1500))
      have = await readH173k()
    }

    // Decide the final burn amount: never more than we actually hold
    const amount = Math.min(amountH173k, have)
    if (!(amount > 0)) throw new Error('Nothing to burn — fund the wallet first')

    onProgress?.('Sending burn…')
    const op = () => sendBurnTransfer(amount, memoString, burnAddress)
    const sig = getReplenishEnabled() ? await swap.withAutoSOL(op) : await op()
    await fetchBalances()
    return { signature: sig, sentAmount: amount }
  }, [connection, sessionWallet, swap, sendBurnTransfer, fetchBalances])

  return {
    solBalance, h173kBalance, loading, error,
    refresh: fetchBalances,
    burn, sendWithH173K, sendWithSOL,
    swapLoading: swap.loading,
  }
}
