import { useState, useEffect } from 'react'
import { getH173KPrice } from './hooks/useSwap'

/**
 * SOL per 1 h173k, taken from the h173k/WSOL pool the app already swaps
 * against. No external price feed is involved: the reserves are the rate.
 *
 * It is a mid price with no fee or slippage applied, which is what a "this is
 * what you're burning" figure should be — the number a burn actually costs in
 * SOL depends on the trade size, and quoting that here would make the preview
 * jitter for reasons the user can't see.
 *
 * Gated on `enabled` so nothing is fetched at all while the preview is set to
 * USD, which is the default.
 */
const REFRESH_MS = 30000

export function useSolRate(connection, enabled) {
  const [rate, setRate] = useState(null)

  useEffect(() => {
    if (!enabled || !connection) return
    let cancelled = false
    const load = async () => {
      const r = await getH173KPrice(connection)
      // A zero or non-finite rate would turn the preview into "0 SOL" or NaN;
      // keeping the previous value is better than showing either.
      if (!cancelled && Number.isFinite(r) && r > 0) setRate(r)
    }
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [connection, enabled])

  return rate
}
