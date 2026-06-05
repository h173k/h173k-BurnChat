import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import {
  getRpcEndpoint, saveRpcEndpoint, validateRpcEndpoint, DEFAULT_RPC_ENDPOINT,
  getBurnAddress, saveBurnAddress, DEFAULT_BURN_ADDRESS,
  getDraftAmount, saveDraftAmount,
  getChatSettings, saveChatSettings,
  getGoalProgress, saveGoalProgress, resetGoalProgress,
  getFxState, saveFxState, capList,
  getReplenishSettings, saveReplenishSettings, getReplenishEnabled, saveReplenishEnabled,
  getH173KDecimals, saveH173KDecimals,
  TOKEN_TICKER, TOKEN_SYMBOL, MAX_TEXT_CHARS, MAX_MEMO_BYTES, MEMO_SEP,
  SORT_NEWEST, SORT_LARGEST, UNIT_H173K, UNIT_USDT,
  FX_NICK_SIZE_MIN, FX_NICK_SIZE_MAX, FX_DURATION_MIN, FX_DURATION_MAX,
  FX_TEXT_SIZE_MIN, FX_TEXT_SIZE_MAX, FX_VPOS_MIN, FX_VPOS_MAX,
  FX_DIM_MIN, FX_DIM_MAX, TICKER_SIZE_MIN, TICKER_SIZE_MAX,
  MIN_TRIGGER_THRESHOLD, MIN_REPLENISH_TO, MIN_SWAP_PRIORITY_FEE,
} from './constants'
import {
  generateMnemonic, validateMnemonic, importWallet, walletExists, deleteWallet, sessionWallet, changePassword, exportMnemonic,
} from './crypto/wallet'
import {
  isPINSetup, setupPIN, verifyPIN,
  checkBiometricSupport, isBiometricSetup, setupBiometric, authenticateBiometric, removeBiometric,
} from './crypto/auth'
import { useBurnChat } from './hooks/useBurnChat'
import { getReferralFromURL, generateReferralLink } from './referral'
import { useChatWallet } from './hooks/useChatWallet'
import { useTokenPrice, formatLastUpdated } from './usePrice'
import {
  formatH173K, formatUSD, formatNumber, truncateAddress,
  byteLength, charLength, truncateToBytes, truncateToChars, timeAgo,
} from './utils'
import { QRCodeGenerator } from './components/QRCode'

const LOGO = '/logo.png'

/* ---------- tiny inline icons ---------- */
const Icon = {
  send: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  gear: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  back: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,
  copy: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  refresh: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  fire: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1 .3-1.8.7-2.5C7 8.5 6 10.5 6 13a6 6 0 0 0 12 0c0-4.5-3.5-7-6-11z"/></svg>,
  close: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  eye: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  fingerprint: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 11c0 4-1 7-2 9"/><path d="M5.8 8.5A7 7 0 0 1 19 11c0 1 0 2-.2 3"/><path d="M8 11a4 4 0 0 1 8 0c0 4-.5 6-1 8"/><path d="M3.5 11a8.5 8.5 0 0 1 2-5.5"/><path d="M17.5 18.5c.3-1 .5-2.5.5-4.5"/><path d="M12 11v1c0 5-1 8-2.5 10.5"/></svg>,
  share: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V3"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>,
  plusSquare: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  dots: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>,
  qr: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>,
}

/* ============================================================ */

/* ---------- platform helpers ---------- */

/* Normalize free-typed decimal input: locale comma → dot, strip junk, keep a
   single dot. Used by every numeric field so comma-decimal keyboards work. */
function sanitizeDecimal(raw) {
  let v = String(raw).replace(/,/g, '.').replace(/[^0-9.]/g, '')
  const i = v.indexOf('.')
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '')
  return v
}

function isStandalonePWA() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true
    || document.referrer.startsWith('android-app://')
}

function isMobileDevice() {
  const ua = navigator.userAgent || ''
  const phoneUA = /Android.*Mobile|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
  return phoneUA || (coarse && window.innerWidth <= 820)
}

function isIOSDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS reports as Mac
}

function useIsMobile() {
  const [mobile, setMobile] = useState(isMobileDevice)
  useEffect(() => {
    const onChange = () => setMobile(isMobileDevice())
    window.addEventListener('resize', onChange)
    window.addEventListener('orientationchange', onChange)
    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('orientationchange', onChange)
    }
  }, [])
  return mobile
}

/* Pull-to-refresh on the document scroller. Active only when the page is at the
   very top; drags down past a threshold trigger onRefresh. Returns the current
   pull offset (px) and a refreshing flag so the caller can draw an indicator. */
function usePullToRefresh({ enabled, onRefresh }) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const st = useRef({ startY: 0, active: false, dist: 0 })
  const refreshingRef = useRef(false)
  const THRESHOLD = 70, MAX = 110

  useEffect(() => {
    if (!enabled) { setPull(0); return }
    const scrollEl = () => document.scrollingElement || document.documentElement

    const onStart = (e) => {
      if (refreshingRef.current || e.touches.length !== 1) return
      if ((scrollEl().scrollTop || 0) <= 0) {
        st.current.startY = e.touches[0].clientY
        st.current.active = true
        st.current.dist = 0
      }
    }
    const onMove = (e) => {
      const s = st.current
      if (!s.active || refreshingRef.current) return
      const dy = e.touches[0].clientY - s.startY
      if (dy <= 0 || (scrollEl().scrollTop || 0) > 0) { s.active = false; s.dist = 0; setPull(0); return }
      s.dist = Math.min(MAX, dy * 0.5) // elastic resistance
      setPull(s.dist)
    }
    const onEnd = async () => {
      const s = st.current
      if (!s.active) return
      s.active = false
      if (s.dist >= THRESHOLD) {
        refreshingRef.current = true
        setRefreshing(true); setPull(THRESHOLD)
        const started = Date.now()
        try { await onRefresh() } catch {}
        const left = 600 - (Date.now() - started)
        if (left > 0) await new Promise(r => setTimeout(r, left))
        refreshingRef.current = false
        setRefreshing(false); setPull(0)
      } else {
        setPull(0)
      }
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, onRefresh])

  return { pull, refreshing }
}

/* Full-screen gate shown on phones when the app isn't installed to the home
   screen. Android gets the native install prompt; iOS gets Share-sheet steps. */
function InstallGate() {
  const [deferred, setDeferred] = useState(null)
  const ios = isIOSDevice()

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferred(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    try { await deferred.userChoice } catch {}
    setDeferred(null)
  }

  return (
    <div className="install-gate">
      <div className="install-gate-inner">
        <div className="install-logo"><img src={LOGO} alt="" /></div>
        <h1>Add Burn Chat to your home screen</h1>
        <p>Burn Chat runs as a home-screen app. Add it to your home screen to continue.</p>

        {ios ? (
          <ol className="install-steps">
            <li className="install-step"><span className="step-ic">{Icon.share}</span><span>Tap the <b>Share</b> button in your browser's toolbar</span></li>
            <li className="install-step"><span className="step-ic">{Icon.plusSquare}</span><span>Choose <b>Add to Home Screen</b></span></li>
            <li className="install-step"><span className="step-ic">{Icon.fire}</span><span>Open <b>Burn Chat</b> from your home screen</span></li>
          </ol>
        ) : deferred ? (
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={install}>Add to home screen</button>
        ) : (
          <ol className="install-steps">
            <li className="install-step"><span className="step-ic">{Icon.dots}</span><span>Open the browser <b>menu</b> (⋮ top-right)</span></li>
            <li className="install-step"><span className="step-ic">{Icon.plusSquare}</span><span>Tap <b>Install app</b> or <b>Add to Home screen</b></span></li>
            <li className="install-step"><span className="step-ic">{Icon.fire}</span><span>Open <b>Burn Chat</b> from your home screen</span></li>
          </ol>
        )}
      </div>
    </div>
  )
}

/* ============================================================ */
export default function App() {
  const [appState, setAppState] = useState('loading') // loading | onboard | locked | ready
  const [rpcVersion, setRpcVersion] = useState(0)
  // Phones that aren't installed to the home screen get a full-screen install
  // gate instead of the app. Computed once: installing always relaunches in a
  // fresh standalone context where this is false.
  const [needsInstall] = useState(() => isMobileDevice() && !isStandalonePWA())

  const connection = useMemo(
    () => new Connection(getRpcEndpoint(), { commitment: 'confirmed' }),
    [rpcVersion]
  )

  useEffect(() => {
    // Influencer links: ?ref=<solana address> pre-sets the burn/listen address
    // so anyone opening the link burns to that address. Persisted, then stripped
    // from the URL so a later manual change isn't undone on reload.
    const ref = getReferralFromURL()
    if (ref) {
      saveBurnAddress(ref)
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete('ref')
        window.history.replaceState({}, '', url.toString())
      } catch {}
    }
    if (!walletExists() || !isPINSetup()) setAppState('onboard')
    else setAppState('locked')
  }, [])

  if (needsInstall) return <Background><InstallGate /></Background>

  if (appState === 'loading') {
    return <Background><div className="loading-screen"><div className="loading-content">
      <div className="loading-logo"><img src={LOGO} className="logo-img" alt="" /></div>
      <div className="loading-spinner" /></div></div></Background>
  }
  if (appState === 'onboard') return <Background><Onboarding onDone={() => setAppState('ready')} /></Background>
  if (appState === 'locked') return <Background><LockScreen onUnlock={() => setAppState('ready')} /></Background>
  return <Background><Main connection={connection} onRpcChange={() => setRpcVersion(v => v + 1)} onLock={() => { sessionWallet.lock(); setAppState('locked') }} /></Background>
}

function Background({ children }) {
  return (
    <>
      <div className="app-background"><div className="light-streak" /></div>
      <div className="app-container"><div className="wallet-app">{children}</div></div>
    </>
  )
}

/* ---------------- Onboarding ---------------- */
function Onboarding({ onDone }) {
  const [step, setStep] = useState('intro') // intro | create | import | nick | pin
  const [mnemonic, setMnemonic] = useState('')
  const [importText, setImportText] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [backedUp, setBackedUp] = useState(false)
  const [nickname, setNickname] = useState('')
  const [err, setErr] = useState('')

  const startCreate = () => { setMnemonic(generateMnemonic()); setRevealed(false); setBackedUp(false); setErr(''); setStep('create') }
  const startImport = () => { setImportText(''); setErr(''); setStep('import') }

  const goNickFromCreate = () => {
    if (!backedUp) { setErr('Please confirm you saved your recovery phrase.'); return }
    setErr(''); setStep('nick')
  }
  const goNickFromImport = () => {
    const m = importText.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!validateMnemonic(m)) { setErr('Invalid recovery phrase. Check the words and order.'); return }
    setMnemonic(m); setErr(''); setStep('nick')
  }

  const finish = (pin) => {
    try {
      importWallet(mnemonic, pin)   // PIN encrypts the seed
      setupPIN(pin)                 // store verify hash
      sessionWallet.unlock(pin)
      const cs = getChatSettings()
      saveChatSettings({ ...cs, nickname: nickname.trim().slice(0, 32) })
      onDone()
    } catch (e) {
      setErr(e.message || 'Setup failed')
    }
  }

  if (step === 'intro') {
    return (
      <div className="onboarding">
        <div className="onboarding-container">
          <div className="onboarding-step">
            <div className="onboarding-logo"><img src={LOGO} className="logo-img large" alt="" /></div>
            <h1 className="onboarding-title">h173k Burn Chat</h1>
            <p className="onboarding-subtitle">Burn $h173k and leave a message on-chain. Your account stays on this device — this is not a connect-style dApp.</p>
            <div className="onboarding-actions">
              <button className="btn btn-action btn-primary" onClick={startCreate}>Create new account</button>
              <button className="btn btn-secondary" onClick={startImport}>I have a recovery phrase</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'create') {
    const words = mnemonic.split(' ')
    return (
      <div className="onboarding"><div className="onboarding-container">
        <button className="back-btn" onClick={() => setStep('intro')}>{Icon.back} Back</button>
        <h1 className="onboarding-title" style={{ marginTop: 16 }}>Your recovery phrase</h1>
        <p className="onboarding-subtitle">Write these 12 words down and keep them secret. They control your funds.</p>
        <div className="backup-warning"><span className="warning-icon">⚠️</span><p>Anyone with this phrase can take your tokens. Never share it.</p></div>
        {!revealed ? (
          <button className="btn-reveal" onClick={() => setRevealed(true)}>Tap to reveal</button>
        ) : (
          <div className="mnemonic-display"><div className="mnemonic-words">
            {words.map((w, i) => (
              <div className="mnemonic-word" key={i}><span className="word-number">{i + 1}</span><span className="word-text">{w}</span></div>
            ))}
          </div></div>
        )}
        {revealed && (
          <label className="checkbox-label" style={{ marginTop: 20 }}>
            <input type="checkbox" checked={backedUp} onChange={e => setBackedUp(e.target.checked)} />
            <span>I have safely saved my recovery phrase</span>
          </label>
        )}
        {err && <div className="error-message">{err}</div>}
        <button className="btn btn-action" disabled={!revealed} onClick={goNickFromCreate}>Continue</button>
      </div></div>
    )
  }

  if (step === 'import') {
    return (
      <div className="onboarding"><div className="onboarding-container">
        <button className="back-btn" onClick={() => setStep('intro')}>{Icon.back} Back</button>
        <h1 className="onboarding-title" style={{ marginTop: 16 }}>Import account</h1>
        <p className="onboarding-subtitle">Enter your 12 or 24-word recovery phrase, separated by spaces.</p>
        <div className="form-group">
          <textarea className="form-input mnemonic-input" placeholder="word1 word2 word3 …" value={importText}
            onChange={e => setImportText(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </div>
        {err && <div className="error-message">{err}</div>}
        <button className="btn btn-action" onClick={goNickFromImport}>Continue</button>
      </div></div>
    )
  }

  if (step === 'nick') {
    return (
      <div className="onboarding"><div className="onboarding-container">
        <button className="back-btn" onClick={() => setStep(importText ? 'import' : 'create')}>{Icon.back} Back</button>
        <h1 className="onboarding-title" style={{ marginTop: 16 }}>Choose a nickname</h1>
        <p className="onboarding-subtitle">This is shown next to your burns in the chat. You can change it anytime in Settings.</p>
        <div className="form-group">
          <input className="form-input" type="text" maxLength={32} placeholder="e.g. firestarter"
            value={nickname} onChange={e => setNickname(e.target.value)}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <span className="form-hint">{nickname.trim() ? `${nickname.trim().length}/32` : 'Optional — leave blank to burn as "anon".'}</span>
        </div>
        <button className="btn btn-action" onClick={() => { setErr(''); setStep('pin') }}>
          {nickname.trim() ? 'Continue' : 'Skip for now'}
        </button>
      </div></div>
    )
  }

  // pin setup
  return <PinSetup onSet={finish} err={err} />
}

function PinSetup({ onSet, err }) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [stage, setStage] = useState('first')
  const [localErr, setLocalErr] = useState('')

  const press = (d) => {
    const cur = stage === 'first' ? pin : confirm
    if (cur.length >= 6) return
    const next = cur + d
    if (stage === 'first') {
      setPin(next)
      if (next.length === 6) { setStage('confirm'); }
    } else {
      setConfirm(next)
      if (next.length === 6) {
        if (next === pin) onSet(next)
        else { setLocalErr('PINs do not match'); setPin(''); setConfirm(''); setStage('first') }
      }
    }
  }
  const del = () => { if (stage === 'first') setPin(p => p.slice(0, -1)); else setConfirm(c => c.slice(0, -1)) }
  const current = stage === 'first' ? pin : confirm

  return (
    <div className="lock-screen"><div className="lock-content">
      <div className="lock-logo"><img src={LOGO} className="logo-img" alt="" /></div>
      <h2 className="lock-title">{stage === 'first' ? 'Create a 6-digit PIN' : 'Confirm your PIN'}</h2>
      <div className="pin-display">{[0,1,2,3,4,5].map(i => <div key={i} className={`pin-dot ${i < current.length ? 'filled' : ''}`} />)}</div>
      {(localErr || err) && <div className="error-message">{localErr || err}</div>}
      <PinPad onPress={press} onDelete={del} />
    </div></div>
  )
}

function PinPad({ onPress, onDelete, disabled }) {
  return (
    <div className="pin-pad">
      {[1,2,3,4,5,6,7,8,9].map(n => <button key={n} className="pin-key" disabled={disabled} onClick={() => onPress(String(n))}>{n}</button>)}
      <div className="pin-key empty" />
      <button className="pin-key" disabled={disabled} onClick={() => onPress('0')}>0</button>
      <button className="pin-key delete" disabled={disabled} onClick={onDelete}>⌫</button>
    </div>
  )
}

/* ---------------- Lock ---------------- */
function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [bioReady, setBioReady] = useState(false)
  const [bioBusy, setBioBusy] = useState(false)
  const triedAuto = useRef(false)

  const runBiometric = useCallback(async () => {
    setErr(''); setBioBusy(true)
    try {
      const recoveredPin = await authenticateBiometric()
      sessionWallet.unlock(recoveredPin)
      onUnlock()
    } catch (e) {
      setErr('Biometric unlock failed — enter your PIN')
    } finally {
      setBioBusy(false)
    }
  }, [onUnlock])

  // Detect biometric availability once, and auto-prompt it on first mount so the
  // user normally never has to touch the PIN pad.
  useEffect(() => {
    if (!isBiometricSetup()) return
    setBioReady(true)
    if (!triedAuto.current) {
      triedAuto.current = true
      runBiometric()
    }
  }, [runBiometric])

  const press = (d) => {
    if (pin.length >= 6) return
    const next = pin + d
    setPin(next)
    if (next.length === 6) {
      try {
        verifyPIN(next)
        sessionWallet.unlock(next)
        onUnlock()
      } catch (e) {
        setErr(e.message || 'Wrong PIN'); setPin('')
      }
    }
  }
  const del = () => setPin(p => p.slice(0, -1))

  return (
    <div className="lock-screen"><div className="lock-content">
      <div className="lock-logo"><img src={LOGO} className="logo-img" alt="" /></div>
      <h2 className="lock-title">Enter your PIN</h2>
      <div className="pin-display">{[0,1,2,3,4,5].map(i => <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />)}</div>
      {err && <div className="error-message">{err}</div>}
      <PinPad onPress={press} onDelete={del} disabled={bioBusy} />
      {bioReady && (
        <button className="btn btn-secondary biometric-btn" onClick={runBiometric} disabled={bioBusy}>
          {Icon.fingerprint}{bioBusy ? 'Authenticating…' : 'Unlock with biometrics'}
        </button>
      )}
    </div></div>
  )
}

/* PIN confirmation modal — used when enabling biometrics from Settings, where
   the wallet is already unlocked but we still need the raw PIN to bind it to a
   passkey. */
function PinPrompt({ title, subtitle, onSubmit, onCancel }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const press = async (d) => {
    if (busy || pin.length >= 6) return
    const next = pin + d
    setPin(next)
    if (next.length === 6) {
      setBusy(true)
      try {
        await onSubmit(next)
      } catch (e) {
        setErr(e.message || 'Something went wrong'); setPin('')
      } finally {
        setBusy(false)
      }
    }
  }
  const del = () => { if (!busy) setPin(p => p.slice(0, -1)) }

  return (
    <div className="sol-prompt-overlay" onClick={busy ? undefined : onCancel}>
      <div className="sol-prompt-card" onClick={e => e.stopPropagation()}>
        <h2 className="lock-title" style={{ marginBottom: 12 }}>{title}</h2>
        {subtitle && <p className="onboarding-subtitle" style={{ marginBottom: 20 }}>{subtitle}</p>}
        <div className="pin-display">{[0,1,2,3,4,5].map(i => <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />)}</div>
        {err && <div className="error-message">{err}</div>}
        <PinPad onPress={press} onDelete={del} disabled={busy} />
        <button className="btn btn-secondary" style={{ marginTop: 12, width: '100%' }} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  )
}

/* Change PIN: verify current, enter new twice. Re-encrypts the seed with the
   new PIN (the PIN is the seed's encryption key) and updates the auth hash. If
   biometric was enabled it's reset, since the old PIN was bound to it. */
function ChangePinModal({ onClose, onDone }) {
  const [step, setStep] = useState('old') // old | new | confirm
  const [pin, setPin] = useState('')
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const titles = { old: 'Enter current PIN', new: 'Choose a new PIN', confirm: 'Confirm new PIN' }

  const press = async (d) => {
    if (busy || pin.length >= 6) return
    const next = pin + d
    setPin(next)
    if (next.length < 6) return

    if (step === 'old') {
      try { verifyPIN(next); setOldPin(next); setStep('new'); setPin(''); setErr('') }
      catch (e) { setErr(e.message || 'Wrong PIN'); setPin('') }
    } else if (step === 'new') {
      setNewPin(next); setStep('confirm'); setPin(''); setErr('')
    } else {
      if (next !== newPin) { setErr('PINs do not match — start again'); setPin(''); setNewPin(''); setStep('new'); return }
      setBusy(true)
      try {
        changePassword(oldPin, next) // re-encrypt seed with the new PIN
        setupPIN(next)               // update auth PIN hash
        let bioReset = false
        if (isBiometricSetup()) { removeBiometric(); bioReset = true }
        onDone(bioReset)
      } catch (e) {
        setErr(e.message || 'Could not change PIN'); setPin(''); setOldPin(''); setNewPin(''); setStep('old')
      } finally { setBusy(false) }
    }
  }
  const del = () => { if (!busy) setPin(p => p.slice(0, -1)) }

  return (
    <div className="sol-prompt-overlay" onClick={busy ? undefined : onClose}>
      <div className="sol-prompt-card" onClick={e => e.stopPropagation()}>
        <h2 className="lock-title" style={{ marginBottom: 20 }}>{titles[step]}</h2>
        <div className="pin-display">{[0,1,2,3,4,5].map(i => <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />)}</div>
        {err && <div className="error-message">{err}</div>}
        <PinPad onPress={press} onDelete={del} disabled={busy} />
        <button className="btn btn-secondary" style={{ marginTop: 12, width: '100%' }} onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  )
}

function Main({ connection, onRpcChange, onLock }) {
  const isMobile = useIsMobile()
  const [view, setView] = useState('chat') // chat | settings
  const [showReceive, setShowReceive] = useState(false)
  const [settings, setSettings] = useState(getChatSettings())
  const [burnAddress, setBurnAddress] = useState(getBurnAddress())
  const [fxMessage, setFxMessage] = useState(null)
  const [goalFxOpen, setGoalFxOpen] = useState(false)
  // Burn-goal progress. Initialised from localStorage so it accumulates across
  // restarts. The refs mirror the persisted state for use inside effects.
  const [goalProgress, setGoalProgress] = useState(getGoalProgress)
  const goalProgressRef = useRef(goalProgress)
  const countedRef = useRef(new Set(goalProgress.counted || []))
  // Big burns that already played their celebration (persisted across runs).
  const celebratedRef = useRef(new Set(getFxState().sigs || []))
  const [toast, setToast] = useState(null)
  // Composer draft lives here (not in Composer) so it survives switching to
  // Settings and back — otherwise ChatView/Composer unmount and lose the input.
  const [draftText, setDraftText] = useState('')
  const [draftAmount, setDraftAmountState] = useState(getDraftAmount)
  // Persist the amount so it survives closing/reopening the app.
  const setDraftAmount = useCallback((v) => { setDraftAmountState(v); saveDraftAmount(v) }, [])

  const pubkey = sessionWallet.publicKey
  const price = useTokenPrice()

  // Big-burn celebrations and goal accumulation are both driven by effects that
  // watch the full message set below (so they work identically for live polls
  // and for messages reloaded after a restart). The hook no longer needs a
  // live callback for the effect.
  const chat = useBurnChat(connection, burnAddress, settings.fetchLimit)
  const wallet = useChatWallet(connection, sessionWallet)

  // local optimistic messages (own sends) merged with chain messages, deduped by signature
  const [localMsgs, setLocalMsgs] = useState([])
  const allMessages = useMemo(() => {
    const map = new Map()
    for (const m of chat.messages) map.set(m.signature, m)
    for (const m of localMsgs) if (!map.has(m.signature)) map.set(m.signature, m)
    return Array.from(map.values())
  }, [chat.messages, localMsgs])

  // filter + sort (req 8, 10)
  const visible = useMemo(() => {
    let arr = allMessages.filter(m => m.amount >= (settings.minBurnFilter || 0))
    if (settings.sort === SORT_LARGEST) arr = arr.slice().sort((a, b) => b.amount - a.amount || b.blockTime - a.blockTime)
    else arr = arr.slice().sort((a, b) => b.blockTime - a.blockTime)
    return arr
  }, [allMessages, settings.minBurnFilter, settings.sort])

  const updateSettings = useCallback((patch) => {
    setSettings(prev => { const next = { ...prev, ...patch }; saveChatSettings(next); return next })
  }, [])

  // --- Big-burn celebration (persists across runs) ---
  // Drives the full-screen effect from the complete message set, so it fires the
  // same whether a big burn just arrived live or was reloaded after a restart.
  // The set of already-celebrated signatures is persisted, so:
  //   * the historical backlog never spams celebrations on first launch,
  //   * each big burn celebrates at most once, ever,
  //   * a big burn that happened while the app was closed still gets its effect
  //     once when you reopen — its special graphics survive the restart.
  useEffect(() => {
    if (chat.loading) return
    const fx = getFxState()
    if (!fx.baseline) {
      // First ever run: seed everything currently on screen as "already seen"
      // so we don't replay the whole history as popups.
      const seed = capList([...fx.sigs, ...allMessages.map(m => m.signature)])
      celebratedRef.current = new Set(seed)
      saveFxState({ baseline: true, sigs: seed })
      return
    }
    if (!settings.fxEnabled || !(settings.fxThreshold > 0)) return
    const fresh = allMessages.filter(
      m => m.amount >= settings.fxThreshold && !celebratedRef.current.has(m.signature)
    )
    if (!fresh.length) return
    for (const m of fresh) celebratedRef.current.add(m.signature)
    const capped = capList([...celebratedRef.current])
    celebratedRef.current = new Set(capped)
    saveFxState({ baseline: true, sigs: capped })
    // Celebrate the biggest newly-seen big burn (avoids a queue of popups).
    const big = fresh.slice().sort((a, b) => b.amount - a.amount)[0]
    setFxMessage(big)
  }, [allMessages, chat.loading, settings.fxEnabled, settings.fxThreshold])

  // --- Burn goal accumulation (persists across runs) ---
  // Counting starts the moment the goal is enabled: the burns already in the
  // chat at that point are marked as "before the goal" (counted, but not added),
  // so only burns from then on move the bar. New burns are deduped by signature
  // so re-fetched messages are never counted twice, and the running total is
  // kept in localStorage so it survives restarts.
  useEffect(() => {
    if (chat.loading) return
    if (!settings.goalEnabled) return // only count while the goal is active
    const prev = goalProgressRef.current
    let burned = prev.burned
    let reached = prev.reached
    let lastTarget = prev.lastTarget
    let started = prev.started
    let changed = false
    if (!started) {
      // Baseline: ignore everything already on screen, start fresh from now.
      countedRef.current = new Set(allMessages.map(m => m.signature))
      burned = 0
      reached = false
      lastTarget = settings.goalTarget
      started = true
      changed = true
    } else {
      for (const m of allMessages) {
        if (!countedRef.current.has(m.signature)) {
          countedRef.current.add(m.signature)
          burned += (m.amount > 0 ? m.amount : 0)
          changed = true
        }
      }
      // Changing the target arms the celebration again for the new goal.
      if (settings.goalTarget !== lastTarget) {
        lastTarget = settings.goalTarget
        reached = false
        changed = true
      }
    }
    let popup = false
    if (settings.goalTarget > 0 && burned >= settings.goalTarget && !reached) {
      reached = true
      popup = true
      changed = true
    }
    if (changed) {
      const capped = capList([...countedRef.current])
      countedRef.current = new Set(capped)
      const next = { burned, reached, lastTarget, started, counted: capped }
      goalProgressRef.current = next
      setGoalProgress(next)
      saveGoalProgress(next)
    }
    if (popup) setGoalFxOpen(true)
  }, [allMessages, chat.loading, settings.goalEnabled, settings.goalTarget])

  const resetGoal = useCallback(() => {
    resetGoalProgress()
    // started:false → the next effect run re-baselines to "now", so the count
    // restarts fresh and ignores the current backlog.
    const fresh = { burned: 0, reached: false, lastTarget: settings.goalTarget, started: false, counted: [] }
    countedRef.current = new Set()
    goalProgressRef.current = fresh
    setGoalProgress(fresh)
    setGoalFxOpen(false)
  }, [settings.goalTarget])

  const showToast = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind }); setTimeout(() => setToast(null), 4000)
  }, [])

  const onSent = useCallback((msg) => {
    setLocalMsgs(prev => [msg, ...prev])
    // Instant feedback for your own big burn, and mark it celebrated so the
    // effect above doesn't fire a second time when it re-appears from chain.
    if (settings.fxEnabled && settings.fxThreshold > 0 && msg.amount >= settings.fxThreshold) {
      celebratedRef.current.add(msg.signature)
      const capped = capList([...celebratedRef.current])
      celebratedRef.current = new Set(capped)
      saveFxState({ baseline: true, sigs: capped })
      setFxMessage(msg)
    }
  }, [settings.fxEnabled, settings.fxThreshold])

  // deposit prompt (req 19): no SOL AND no h173k.
  // Only when balances actually loaded (no RPC error) and the user hasn't dismissed it.
  const [depositDismissed, setDepositDismissed] = useState(false)
  const needsDeposit = !wallet.loading && !wallet.error
    && wallet.solBalance < 0.0001 && wallet.h173kBalance <= 0
    && !depositDismissed

  // RPC warning: the default public endpoint is heavily rate-limited, and any
  // RPC error usually means the user must set their own endpoint. Surface a
  // dismissible banner with a one-tap shortcut to the RPC settings (root cause
  // of "app feels stuck right after creating an account").
  const [rpcBannerDismissed, setRpcBannerDismissed] = useState(false)
  const usingDefaultRpc = getRpcEndpoint() === DEFAULT_RPC_ENDPOINT
  const showRpcBanner = view === 'chat' && !settings.watchOnly && !rpcBannerDismissed
    && (!!wallet.error || chat.status === 'error' || usingDefaultRpc)

  const openSettings = useCallback(() => setView('settings'), [])

  // Pull-to-refresh replaces the reload button on phones.
  const doRefresh = useCallback(() => chat.refresh(), [chat])
  const { pull, refreshing } = usePullToRefresh({
    enabled: isMobile && view === 'chat',
    onRefresh: doRefresh,
  })

  return (
    <div className="main-view">
      {isMobile && (pull > 0 || refreshing) && (
        <div className="ptr-indicator" style={{ transform: `translateY(${pull}px)`, opacity: refreshing ? 1 : Math.min(1, pull / 70) }}>
          <div className={`ptr-spinner ${refreshing ? 'spin' : ''}`} style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }} />
        </div>
      )}
      <header className="main-header">
        <div className="brand-row">
          <img src={LOGO} className="logo-img" style={{ width: 40, height: 40 }} alt="" />
          <div>
            <div className="brand-title">Burn Chat</div>
            <PriceTag price={price} tickerSize={settings.tickerSize} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!settings.watchOnly && view === 'chat' && !isMobile && <button className="icon-btn" onClick={() => chat.refresh()} title="Reload">{Icon.refresh}</button>}
          {!settings.watchOnly && view === 'chat' && (
            <button className="icon-btn" onClick={() => setShowReceive(true)} title="Receive — show address QR">{Icon.qr}</button>
          )}
          {!settings.watchOnly && view === 'chat' && (
            <button className="icon-btn" onClick={() => setView('settings')} title="Settings">{Icon.gear}</button>
          )}
          {settings.watchOnly && view === 'chat' && (
            <button className="icon-btn" onClick={() => updateSettings({ watchOnly: false })} title="Exit watch-only">
              {Icon.eye}
            </button>
          )}
        </div>
      </header>

      {view === 'settings' ? (
        <SettingsView
          settings={settings} updateSettings={updateSettings}
          burnAddress={burnAddress} setBurnAddress={(a) => { saveBurnAddress(a); setBurnAddress(a) }}
          onRpcChange={onRpcChange} onLock={onLock}
          onBack={() => setView('chat')}
          pubkey={pubkey} h173kDecimals={getH173KDecimals()}
          goalBurned={goalProgress.burned} onResetGoal={resetGoal}
        />
      ) : (
        <ChatView
          messages={visible} totalCount={allMessages.length}
          settings={settings} price={price} status={chat.status} loading={chat.loading} error={chat.error}
          wallet={wallet} burnAddress={burnAddress} pubkey={pubkey}
          onSent={onSent} showToast={showToast}
          goalBurned={goalProgress.burned}
          needsDeposit={needsDeposit} onCloseDeposit={() => setDepositDismissed(true)}
          showRpcBanner={showRpcBanner} onDismissRpcBanner={() => setRpcBannerDismissed(true)}
          onOpenSettings={openSettings}
          draftText={draftText} setDraftText={setDraftText}
          draftAmount={draftAmount} setDraftAmount={setDraftAmount}
        />
      )}

      {fxMessage && <BurnFx message={fxMessage} settings={settings} price={price} onClose={() => setFxMessage(null)} />}
      {goalFxOpen && <GoalFx settings={settings} burned={goalProgress.burned} price={price} onClose={() => setGoalFxOpen(false)} />}
      {showReceive && <ReceiveModal pubkey={pubkey} onClose={() => setShowReceive(false)} />}
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </div>
  )
}

function PriceTag({ price, tickerSize }) {
  const size = Number(tickerSize) > 0 ? Number(tickerSize) : 13
  return (
    <div className="price-tag" style={{ fontSize: size }}>
      <span className="ticker">${TOKEN_SYMBOL}</span>
      {price.price != null
        ? <span className="price-usd">{formatUSD(price.price)}</span>
        : <span className="price-usd dim">{price.loading ? '…' : 'n/a'}</span>}
    </div>
  )
}

/* ---------------- Chat ---------------- */
function ChatView({ messages, totalCount, settings, price, status, loading, error, wallet, burnAddress, pubkey, onSent, showToast, goalBurned, needsDeposit, onCloseDeposit, showRpcBanner, onDismissRpcBanner, onOpenSettings, draftText, setDraftText, draftAmount, setDraftAmount }) {
  const displayAmount = useCallback((amt) => {
    if (settings.displayUnit === UNIT_USDT && price.price != null) return formatUSD(amt * price.price)
    return `${formatH173K(amt)} ${TOKEN_TICKER}`
  }, [settings.displayUnit, price.price])

  // Keep the top of the list in view when new burns arrive. This matters most
  // for "largest first": the biggest burn lives at the top and shouldn't get
  // pushed off-screen by incoming messages. We only auto-pin when the user is
  // already near the top, so we never yank someone who scrolled down to read.
  const prevLenRef = useRef(0)
  const prevTopIdRef = useRef(null)
  useEffect(() => {
    const len = messages.length
    const topId = messages[0]?.signature || null
    const grew = len > prevLenRef.current
    const topChanged = topId !== prevTopIdRef.current
    prevLenRef.current = len
    prevTopIdRef.current = topId
    if (!grew && !topChanged) return
    const scrollEl = document.scrollingElement || document.documentElement
    const nearTop = (scrollEl?.scrollTop || window.scrollY || 0) < 160
    if (nearTop) {
      // jump back to the very top so the #1 burn (largest, or newest) stays on screen
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
    }
  }, [messages, settings.sort])

  return (
    <>
      <div className="chat-meta">
        <span>{status === 'live' ? <><span className="live-dot" /> live</> : status === 'error' ? 'connection error' : 'connecting…'}</span>
        <span>{messages.length}{settings.minBurnFilter > 0 ? ` / ${totalCount}` : ''} messages</span>
      </div>

      <GoalBar settings={settings} burned={goalBurned} displayAmount={displayAmount} />

      {showRpcBanner && (
        <div className="rpc-banner">
          <div className="rpc-banner-text">
            {error || status === 'error'
              ? 'Can’t reach the network. The public RPC is rate-limited — add your own RPC.'
              : 'You’re on the public RPC (rate-limited). Add your own RPC for reliable live updates.'}
          </div>
          <div className="rpc-banner-actions">
            <button className="btn btn-small" onClick={onOpenSettings}>Open settings</button>
            <button className="rpc-banner-x" onClick={onDismissRpcBanner} aria-label="Dismiss">{Icon.close}</button>
          </div>
        </div>
      )}

      {/* Deposit hint shows inline (never a blocking overlay) so the header and
          settings always stay reachable (req 19). Hidden in watch-only mode. */}
      {needsDeposit && !settings.watchOnly && <DepositPrompt pubkey={pubkey} onClose={onCloseDeposit} />}

      <div className="chat-list">
        {loading && messages.length === 0 && <div className="loading-spinner-small" />}
        {!loading && messages.length === 0 && (
          <div className="empty-state">
            {settings.minBurnFilter > 0 && totalCount > 0
              ? 'No messages above your burn filter.'
              : 'No burns yet. Be the first to burn and leave a message.'}
          </div>
        )}
        {messages.map(m => (
          <MessageRow key={m.signature} m={m} displayAmount={displayAmount}
            mine={pubkey && m.sender === pubkey.toString()}
            big={settings.fxThreshold > 0 && m.amount >= settings.fxThreshold} />
        ))}
      </div>

      {!settings.watchOnly && (
        <Composer wallet={wallet} settings={settings} burnAddress={burnAddress} price={price}
          pubkey={pubkey} onSent={onSent} showToast={showToast}
          text={draftText} setText={setDraftText} amount={draftAmount} setAmount={setDraftAmount} />
      )}
    </>
  )
}

function MessageRow({ m, displayAmount, mine, big }) {
  const sig = m.signature
  const explorer = `https://solscan.io/tx/${sig}`
  return (
    <div className={`msg ${mine ? 'mine' : ''} ${big ? 'msg-big' : ''}`}>
      <div className="msg-head">
        <span className="msg-nick">{m.nick ? m.nick : 'anon'}</span>
        {big && <span className="msg-big-badge">{Icon.fire} BIG BURN</span>}
        <span className="msg-from">{truncateAddress(m.sender)}</span>
        <span className="msg-time">{timeAgo(m.blockTime)}</span>
      </div>
      {/* text is rendered as a plain text node => no HTML/JS can execute (req 20) */}
      <div className="msg-text">{m.text || <span className="dim">(no text)</span>}</div>
      <div className="msg-foot">
        <span className={`msg-burn ${big ? 'msg-burn-big' : ''}`}>{Icon.fire}<span>{displayAmount(m.amount)}</span></span>
        <a className="msg-link" href={explorer} target="_blank" rel="noreferrer noopener">tx</a>
      </div>
    </div>
  )
}

/* ---------------- Composer ---------------- */
function Composer({ wallet, settings, burnAddress, price, pubkey, onSent, showToast, text, setText, amount, setAmount }) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [err, setErr] = useState('')

  const nick = settings.nickname || ''
  const chars = charLength(text)
  const memoPreviewBytes = byteLength((nick ? nick + MEMO_SEP : '') + text)

  const buildMemo = () => {
    let n = nick, t = text
    let memo = (n ? n + MEMO_SEP : '') + t
    if (byteLength(memo) <= MAX_MEMO_BYTES) return memo
    // trim nick first, then text
    const tPart = MEMO_SEP + t
    const nickBudget = MAX_MEMO_BYTES - byteLength(tPart)
    if (n && nickBudget > 0) { n = truncateToBytes(n, nickBudget); memo = n + tPart }
    if (byteLength(memo) > MAX_MEMO_BYTES) {
      const textBudget = MAX_MEMO_BYTES - byteLength(n ? n + MEMO_SEP : '')
      t = truncateToBytes(t, Math.max(0, textBudget))
      memo = (n ? n + MEMO_SEP : '') + t
    }
    return memo
  }

  const onText = (e) => {
    const v = e.target.value
    setText(truncateToChars(v, MAX_TEXT_CHARS))   // enforce 260 chars (req 6)
  }

  const canSend = !busy && amount && parseFloat(amount) > 0 && chars > 0

  // Normalize the amount field ourselves. type="number" silently blanks out
  // comma input on comma-decimal locales (e.g. PL/DE keyboards), so the burn
  // button never lit up. We accept commas and convert them to a dot.
  const onAmount = (raw) => setAmount(sanitizeDecimal(raw))

  const submit = async () => {
    setErr('')
    const amt = parseFloat(amount)
    if (!(amt > 0)) { setErr('Enter an amount greater than 0'); return }
    if (chars === 0) { setErr('Write a message first'); return }
    const memo = buildMemo()
    if (byteLength(memo) > MAX_MEMO_BYTES) { setErr('Message is too long (max 500 bytes)'); return }

    // need either h173k or SOL to fund the burn
    if (wallet.h173kBalance <= 0 && wallet.solBalance <= 0.01) {
      setErr('Fund the account with h173k or SOL first'); return
    }

    setBusy(true)
    try {
      // user types an h173k amount; burn() uses h173k first and, if short,
      // automatically converts SOL to cover the rest
      const res = await wallet.burn(amt, memo, burnAddress, setProgress)
      // optimistic local message
      onSent({
        signature: res.signature,
        blockTime: Math.floor(Date.now() / 1000),
        amount: res.sentAmount,
        sender: pubkey ? pubkey.toString() : null,
        nick: nick || '',
        text: text,
      })
      setText('') // keep the amount so the user can quickly burn it again
      showToast('🔥 Burn sent!')
    } catch (e) {
      console.error(e)
      setErr(e.message || 'Transaction failed')
    } finally {
      setBusy(false); setProgress('')
    }
  }

  return (
    <div className="composer">
      {!nick && <div className="composer-hint">Set a nickname in Settings so others know who you are.</div>}
      <div className="composer-row">
        <textarea className="form-input composer-text" placeholder="Say something as you burn…"
          value={text} onChange={onText} rows={2} />
      </div>
      <div className="composer-counts">
        <span className={chars >= MAX_TEXT_CHARS ? 'warn' : ''}>{chars}/{MAX_TEXT_CHARS} chars</span>
        <span className={memoPreviewBytes > MAX_MEMO_BYTES ? 'warn' : ''}>{memoPreviewBytes}/{MAX_MEMO_BYTES} bytes</span>
      </div>

      <div className="amount-input-wrapper">
        <input className="form-input" type="text" inputMode="decimal" autoComplete="off"
          placeholder="Amount to burn (h173k)"
          value={amount} onChange={e => onAmount(e.target.value)} />
        <button className="max-btn" onClick={() => setAmount(String(wallet.h173kBalance))}>MAX</button>
      </div>
      <div className="composer-counts">
        <span className="dim">Balance: {formatH173K(wallet.h173kBalance)} h173k · {formatNumber(wallet.solBalance, 4)} SOL</span>
        {parseFloat(amount) > wallet.h173kBalance && wallet.solBalance > 0.01 && (
          <span className="dim">not enough h173k → SOL will be converted</span>
        )}
      </div>

      {err && <div className="error-message">{err}</div>}

      <button className="btn btn-action" disabled={!canSend} onClick={submit}>
        {busy ? (progress || 'Working…') : <>{Icon.fire}&nbsp;Burn &amp; send</>}
      </button>
      <div className="composer-target">to {truncateAddress(burnAddress, 6, 6)}</div>
    </div>
  )
}

/* ---------------- Deposit prompt (inline, dismissible) ---------------- */
/* Reveal the recovery phrase. Only reached after a PIN check. Renders the words
   in the same grid as onboarding, with a copy button and a warning. */
function RecoveryPhraseModal({ phrase, onClose }) {
  const words = phrase.trim().split(/\s+/)
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard?.writeText(phrase); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <div className="sol-prompt-overlay" onClick={onClose}>
      <div className="sol-prompt-card" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <button className="prompt-close" onClick={onClose} title="Close" aria-label="Close">{Icon.close}</button>
        <h2 style={{ marginBottom: 8 }}>Recovery phrase</h2>
        <div className="backup-warning"><span className="warning-icon">⚠️</span><p>Anyone with this phrase can take your funds. Never share it.</p></div>
        <div className="mnemonic-display"><div className="mnemonic-words">
          {words.map((w, i) => (
            <div className="mnemonic-word" key={i}><span className="word-number">{i + 1}</span><span className="word-text">{w}</span></div>
          ))}
        </div></div>
        <button className="btn btn-secondary" onClick={copy} style={{ width: '100%', marginTop: 16 }}>{copied ? 'Copied ✓' : 'Copy phrase'}</button>
        <button className="btn btn-primary" onClick={onClose} style={{ width: '100%', marginTop: 10 }}>Done</button>
      </div>
    </div>
  )
}

/* Address QR + copy, opened from the header button. */
function ReceiveModal({ pubkey, onClose }) {
  const addr = pubkey ? pubkey.toString() : ''
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(addr)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="sol-prompt-overlay" onClick={onClose}>
      <div className="sol-prompt-card" onClick={e => e.stopPropagation()}>
        <button className="prompt-close" onClick={onClose} title="Close" aria-label="Close">{Icon.close}</button>
        <h2 style={{ marginBottom: 8 }}>Receive</h2>
        <p style={{ marginBottom: 18 }}>Transfer <b>h173k</b> or <b>Solana (SOL)</b> to this address.</p>
        <div className="qr-code-container" style={{ display: 'flex', justifyContent: 'center' }}>
          {addr && <QRCodeGenerator data={addr} size={190} />}
        </div>
        <div className="sol-prompt-value" onClick={copy} style={{ marginTop: 16 }}>
          {addr}<span className="copy-hint">{copied ? 'copied ✓' : 'tap to copy'}</span>
        </div>
        <button className="btn btn-secondary" onClick={copy} style={{ width: '100%', marginTop: 14 }}>
          {copied ? 'Copied ✓' : 'Copy address'}
        </button>
        <p className="sol-prompt-note" style={{ marginTop: 12 }}>Only send h173k or SOL on Solana mainnet to this address.</p>
      </div>
    </div>
  )
}

function DepositPrompt({ pubkey, onClose }) {
  const addr = pubkey ? pubkey.toString() : ''
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(addr)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="deposit-card">
      <button className="prompt-close" onClick={onClose} title="Dismiss" aria-label="Dismiss">{Icon.close}</button>
      <div className="sol-prompt-icon">👛</div>
      <h2>Fund your account</h2>
      <p>This account is empty. Deposit <b>h173k</b> or <b>SOL</b> to start burning. SOL is converted to h173k automatically when you burn.</p>
      <div className="sol-prompt-address">
        <div className="sol-prompt-label">Your address</div>
        <div className="qr-code-container" style={{ display: 'flex', justifyContent: 'center' }}>
          {addr && <QRCodeGenerator data={addr} size={170} />}
        </div>
        <div className="sol-prompt-value" onClick={copy}>{addr}<span className="copy-hint">{copied ? 'copied ✓' : 'tap to copy'}</span></div>
      </div>
      <p className="sol-prompt-note">Only send h173k or SOL on Solana mainnet to this address.</p>
      <button className="btn btn-secondary" onClick={onClose} style={{ marginTop: 8 }}>Dismiss</button>
    </div>
  )
}

/* ---------------- Special effect overlay (req 13) ---------------- */
function GoalBar({ settings, burned, displayAmount }) {
  if (!settings.goalEnabled || !(settings.goalTarget > 0)) return null
  const total = burned > 0 ? burned : 0
  const pct = Math.min(100, (total / settings.goalTarget) * 100)
  const reached = total >= settings.goalTarget
  return (
    <div className={`goal-bar ${reached ? 'reached' : ''}`}>
      <div className="goal-bar-head">
        <span className="goal-bar-title">{Icon.fire} Burn goal</span>
        <span className="goal-bar-pct">{reached ? '100' : pct.toFixed(pct < 10 ? 2 : 1)}%</span>
      </div>
      <div className="goal-bar-track">
        <div className="goal-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="goal-bar-foot">
        <span className="goal-bar-burned">{displayAmount(total)}</span>
        <span className="goal-bar-target dim">/ {displayAmount(settings.goalTarget)}</span>
      </div>
    </div>
  )
}

function GoalFx({ settings, burned, price, onClose }) {
  useEffect(() => {
    const secs = Number(settings.fxDuration) > 0 ? Number(settings.fxDuration) : 8
    const t = setTimeout(onClose, Math.max(secs, 4) * 1000)
    return () => clearTimeout(t)
  }, [onClose, settings.fxDuration])
  const amountStr = settings.displayUnit === UNIT_USDT && price.price != null
    ? formatUSD(burned * price.price)
    : `${formatH173K(burned)} h173k`
  let dim = Number(settings.fxDim)
  if (!Number.isFinite(dim)) dim = 85
  dim = Math.min(100, Math.max(0, dim)) / 100
  const overlayStyle = {
    background: `radial-gradient(circle at 50% 40%, rgba(255,170,40,${0.26 * dim}), transparent 70%), rgba(0,0,0,${dim})`,
  }
  return (
    <div className="fx-overlay goal-fx" onClick={onClose} style={overlayStyle}>
      <div className="fx-card">
        <div className="fx-flames">🎉🔥🎉</div>
        <div className="fx-label">GOAL REACHED</div>
        <div className="fx-amount">{amountStr}</div>
        <div className="fx-text" style={{ fontSize: 20, marginTop: 8 }}>{settings.goalText}</div>
        <div className="fx-hint">tap to dismiss</div>
      </div>
    </div>
  )
}

function BurnFx({ message, settings, price, onClose }) {
  useEffect(() => {
    const secs = Number(settings.fxDuration) > 0 ? Number(settings.fxDuration) : 6.5
    const t = setTimeout(onClose, secs * 1000)
    return () => clearTimeout(t)
  }, [onClose, settings.fxDuration])
  const amountStr = settings.displayUnit === UNIT_USDT && price.price != null
    ? formatUSD(message.amount * price.price)
    : `${formatH173K(message.amount)} h173k`
  const nickSize = Number(settings.fxNickSize) > 0 ? Number(settings.fxNickSize) : 28
  const textSize = Number(settings.fxTextSize) > 0 ? Number(settings.fxTextSize) : 16
  let vpos = Number(settings.fxVerticalPos)
  if (!Number.isFinite(vpos)) vpos = 50
  vpos = Math.min(100, Math.max(0, vpos))
  let dim = Number(settings.fxDim)
  if (!Number.isFinite(dim)) dim = 85
  dim = Math.min(100, Math.max(0, dim)) / 100
  // Darken whatever is behind the effect so the text stays readable. A subtle
  // warm glow sits on top of the adjustable black backdrop.
  const overlayStyle = {
    background: `radial-gradient(circle at 50% 40%, rgba(255,90,0,${0.22 * dim}), transparent 70%), rgba(0,0,0,${dim})`,
  }
  // 0 = top edge at top of screen, 50 = centered, 100 = bottom edge at bottom
  const posStyle = {
    position: 'absolute',
    top: `${vpos}%`,
    left: '50%',
    transform: `translate(-50%, -${vpos}%)`,
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '0 24px',
  }
  return (
    <div className="fx-overlay" onClick={onClose} style={overlayStyle}>
      <div style={posStyle}>
        <div className="fx-card">
          <div className="fx-flames">🔥🔥🔥</div>
          <div className="fx-amount">{amountStr}</div>
          <div className="fx-label">BURNED</div>
          <div className="fx-nick" style={{ fontSize: nickSize }}>{message.nick ? message.nick : 'anon'}</div>
          <div className="fx-text" style={{ fontSize: textSize }}>{message.text}</div>
          <div className="fx-hint">tap to dismiss</div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Settings ---------------- */
function SettingsView({ settings, updateSettings, burnAddress, setBurnAddress, onRpcChange, onLock, onBack, pubkey, h173kDecimals, goalBurned, onResetGoal }) {
  const [nick, setNick] = useState(settings.nickname)
  const [addr, setAddr] = useState(burnAddress)
  const [addrErr, setAddrErr] = useState('')
  // Share/referral link — defaults to the user's own address so their followers'
  // burns flow to them. Editable in case they receive on a different wallet.
  const [refAddr, setRefAddr] = useState(pubkey ? pubkey.toString() : '')
  const [refCopied, setRefCopied] = useState(false)
  const refValid = useMemo(() => { try { new PublicKey(refAddr.trim()); return true } catch { return false } }, [refAddr])
  const refLink = refValid ? generateReferralLink(refAddr.trim()) : ''
  const copyRefLink = () => {
    if (!refValid) return
    navigator.clipboard?.writeText(refLink)
    setRefCopied(true)
    setTimeout(() => setRefCopied(false), 2000)
  }
  const [rpc, setRpc] = useState(getRpcEndpoint())
  const [rpcMsg, setRpcMsg] = useState('')
  const [rep, setRep] = useState(getReplenishSettings())
  const [repEnabled, setRepEnabled] = useState(getReplenishEnabled())
  const [decimals, setDecimals] = useState(h173kDecimals)
  // Local string buffer for the decimal filter so users can type "0." / "0,5"
  // without the parsed number snapping the field back mid-entry.
  const [minBurnStr, setMinBurnStr] = useState(settings.minBurnFilter ? String(settings.minBurnFilter) : '')
  const onMinBurn = (raw) => {
    const v = sanitizeDecimal(raw)
    setMinBurnStr(v)
    const n = parseFloat(v)
    updateSettings({ minBurnFilter: isNaN(n) ? 0 : Math.max(0, n) })
  }
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Biometric unlock
  const [bioSupported, setBioSupported] = useState(false)
  const [bioOn, setBioOn] = useState(isBiometricSetup())
  const [showBioPin, setShowBioPin] = useState(false)
  const [bioMsg, setBioMsg] = useState('')
  // Change PIN
  const [showChangePin, setShowChangePin] = useState(false)
  const [pinMsg, setPinMsg] = useState('')
  // Reveal recovery phrase (PIN-gated)
  const [showRevealPin, setShowRevealPin] = useState(false)
  const [revealedPhrase, setRevealedPhrase] = useState(null)

  useEffect(() => {
    let alive = true
    checkBiometricSupport().then(ok => { if (alive) setBioSupported(ok) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const enableBiometric = async (pin) => {
    verifyPIN(pin)               // throws on wrong PIN → surfaced by PinPrompt
    await setupBiometric(pin)    // triggers the OS passkey/biometric prompt
    setBioOn(true)
    setShowBioPin(false)
    setBioMsg('Biometric unlock enabled ✓')
    setTimeout(() => setBioMsg(''), 3000)
  }

  const toggleBiometric = (next) => {
    setBioMsg('')
    if (next) {
      setShowBioPin(true)        // need the PIN to bind the passkey
    } else {
      removeBiometric()
      setBioOn(false)
    }
  }

  const saveNick = () => updateSettings({ nickname: nick.trim().slice(0, 32) })

  const saveAddr = () => {
    setAddrErr('')
    try { new PublicKey(addr.trim()) } catch { setAddrErr('Not a valid Solana address'); return }
    setBurnAddress(addr.trim())
  }

  const saveRpc = async () => {
    setRpcMsg('Checking…')
    const ok = await validateRpcEndpoint(rpc.trim())
    saveRpcEndpoint(rpc.trim())
    onRpcChange()
    setRpcMsg(ok ? 'Saved ✓' : 'Saved (could not verify health)')
    setTimeout(() => setRpcMsg(''), 3000)
  }

  const saveRep = (patch) => {
    const next = { ...rep, ...patch }
    setRep(next); saveReplenishSettings(next)
  }

  return (
    <div className="settings-view">
      <div className="view-header settings-header">
        <button className="back-btn" onClick={onBack}>{Icon.back} Back</button>
        <h2>Settings</h2>
        <span className="settings-header-spacer" />
      </div>

      {/* Identity */}
      <div className="settings-section">
        <h3>Identity</h3>
        <div className="form-group">
          <label className="form-label">Nickname (shown to others)</label>
          <div className="input-with-action">
            <input className="form-input" value={nick} maxLength={32} placeholder="e.g. firestarter"
              onChange={e => setNick(e.target.value)} />
            <button className="btn btn-secondary" onClick={saveNick}>Save</button>
          </div>
          <span className="form-hint">Included in the memo and displayed beside your messages.</span>
        </div>
      </div>

      {/* Listening */}
      <div className="settings-section">
        <h3>Burn / listen address</h3>
        <div className="form-group">
          <label className="form-label">Watched address</label>
          <div className="input-with-action">
            <input className="form-input" value={addr} onChange={e => setAddr(e.target.value)} spellCheck={false} autoCapitalize="none" />
            <button className="btn btn-secondary" onClick={saveAddr}>Save</button>
          </div>
          {addrErr && <span className="form-hint" style={{ color: 'var(--color-error)' }}>{addrErr}</span>}
          <span className="form-hint">Default: {truncateAddress(DEFAULT_BURN_ADDRESS, 8, 8)}</span>
          <button className="convert-sol-btn" style={{ marginTop: 8 }} onClick={() => { setAddr(DEFAULT_BURN_ADDRESS); setBurnAddress(DEFAULT_BURN_ADDRESS) }}>Reset to default</button>
        </div>
      </div>

      {/* Share / referral link */}
      <div className="settings-section">
        <h3>Share link</h3>
        <div className="referral-link-section">
          <p className="referral-description">
            Share this link. Anyone who opens it has their burn address set to the address below,
            so their burns go to that account. Defaults to your own address.
          </p>
          <div className="form-group">
            <label className="form-label">Receiving address</label>
            <input className="form-input" value={refAddr} onChange={e => setRefAddr(e.target.value)}
              spellCheck={false} autoCapitalize="none" />
            {!refValid && refAddr.trim() && <span className="form-hint" style={{ color: 'var(--color-error)' }}>Not a valid Solana address</span>}
          </div>
          {refValid && (
            <>
              <div className="referral-link-box" onClick={copyRefLink}>
                <span className="referral-link-text">{refLink}</span>
                <span style={{ flex: '0 0 auto', color: 'var(--color-white-70)' }}>{Icon.copy}</span>
              </div>
              <button className="btn btn-secondary referral-copy-btn" onClick={copyRefLink}>
                {refCopied ? 'Copied ✓' : 'Copy link'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Display */}
      <div className="settings-section">
        <h3>Chat display</h3>
        <SegRow label="Sort order" value={settings.sort}
          options={[[SORT_NEWEST, 'Newest first'], [SORT_LARGEST, 'Largest first']]}
          onChange={v => updateSettings({ sort: v })} />
        <SegRow label="Show amounts as" value={settings.displayUnit}
          options={[[UNIT_H173K, 'h173k'], [UNIT_USDT, 'USDT']]}
          onChange={v => updateSettings({ displayUnit: v })} />
        <div className="form-group">
          <label className="form-label">Load last N messages (from API)</label>
          <input className="form-input" type="number" min="1" max="1000" value={settings.fetchLimit}
            onChange={e => updateSettings({ fetchLimit: Math.max(1, Math.min(1000, parseInt(e.target.value || '1', 10))) })} />
          <span className="form-hint">Initial pull only. New burns stream in live; filters (not this limit) decide what's hidden.</span>
        </div>
        <div className="form-group">
          <label className="form-label">Only show burns ≥ (h173k)</label>
          <input className="form-input" type="text" inputMode="decimal" autoComplete="off" placeholder="0"
            value={minBurnStr} onChange={e => onMinBurn(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">h173k decimals shown</label>
          <input className="form-input" type="number" min="0" max="9" value={decimals}
            onChange={e => { const v = Math.max(0, Math.min(9, parseInt(e.target.value || '0', 10))); setDecimals(v); saveH173KDecimals(v) }} />
        </div>
        <ToggleRow label="Watch-only mode (hide controls, show chat only)"
          checked={settings.watchOnly} onChange={v => updateSettings({ watchOnly: v })} />
        <span className="form-hint">Hides the composer and toolbar. Tap the eye icon in the header to leave.</span>
        <div className="form-group" style={{ marginTop: 20 }}>
          <label className="form-label">Ticker &amp; price size in header (px): {settings.tickerSize}</label>
          <input type="range" min={TICKER_SIZE_MIN} max={TICKER_SIZE_MAX} step="1"
            value={settings.tickerSize}
            onChange={e => updateSettings({ tickerSize: Math.min(TICKER_SIZE_MAX, Math.max(TICKER_SIZE_MIN, parseInt(e.target.value, 10))) })} />
          <div className="price-tag" style={{ fontSize: settings.tickerSize, marginTop: 8 }}>
            <span className="ticker">${TOKEN_SYMBOL}</span>
            <span className="price-usd">$0.00</span>
          </div>
        </div>
      </div>

      {/* Burn goal */}
      <div className="settings-section">
        <h3>Burn goal</h3>
        <ToggleRow label="Show burn-goal progress bar" checked={settings.goalEnabled}
          onChange={v => updateSettings({ goalEnabled: v })} />
        <span className="form-hint">Counting starts when you enable the goal — burns already in the chat don't count. The total is kept between app restarts.</span>
        <div className="form-group">
          <label className="form-label">Goal amount (h173k)</label>
          <input className="form-input" type="number" min="0" step="any" value={settings.goalTarget || ''}
            placeholder="e.g. 10000000"
            onChange={e => updateSettings({ goalTarget: Math.max(0, parseFloat(e.target.value || '0')) })} />
        </div>
        <div className="form-group">
          <label className="form-label">Message shown when the goal is reached</label>
          <textarea className="form-input" rows={2} value={settings.goalText}
            onChange={e => updateSettings({ goalText: e.target.value.slice(0, 280) })} />
        </div>
        <div className="form-group">
          <label className="form-label">
            Counted so far: {formatH173K(goalBurned > 0 ? goalBurned : 0)} h173k
            {settings.goalTarget > 0 ? ` (${Math.min(100, (Math.max(0, goalBurned) / settings.goalTarget) * 100).toFixed(1)}%)` : ''}
          </label>
          <button className="btn btn-secondary" onClick={onResetGoal}>Reset progress</button>
          <span className="form-hint">Clears the running total and re-arms the goal effect — start a fresh round from now.</span>
        </div>
      </div>

      {/* Special effect */}
      <div className="settings-section">
        <h3>Big-burn effect</h3>
        <ToggleRow label="Enable animated effect" checked={settings.fxEnabled} onChange={v => updateSettings({ fxEnabled: v })} />
        <div className="form-group">
          <label className="form-label">Trigger when burn ≥ (h173k)</label>
          <input className="form-input" type="number" min="0" step="any" value={settings.fxThreshold}
            onChange={e => updateSettings({ fxThreshold: Math.max(0, parseFloat(e.target.value || '0')) })} />
          <span className="form-hint">Big burns also get a highlighted bubble in the chat with a larger amount.</span>
        </div>
        <div className="form-group">
          <label className="form-label">Show effect for (seconds): {Number(settings.fxDuration).toFixed(1)}</label>
          <input type="range" min={FX_DURATION_MIN} max={FX_DURATION_MAX} step="0.5"
            value={settings.fxDuration}
            onChange={e => updateSettings({ fxDuration: Math.min(FX_DURATION_MAX, Math.max(FX_DURATION_MIN, parseFloat(e.target.value))) })} />
        </div>
        <div className="form-group">
          <label className="form-label">Nickname size in effect (px): {settings.fxNickSize}</label>
          <input type="range" min={FX_NICK_SIZE_MIN} max={FX_NICK_SIZE_MAX} step="1"
            value={settings.fxNickSize}
            onChange={e => updateSettings({ fxNickSize: Math.min(FX_NICK_SIZE_MAX, Math.max(FX_NICK_SIZE_MIN, parseInt(e.target.value, 10))) })} />
          <div className="fx-nick-preview" style={{ fontSize: settings.fxNickSize }}>{settings.nickname || 'anon'}</div>
        </div>
        <div className="form-group">
          <label className="form-label">Message text size in effect (px): {settings.fxTextSize}</label>
          <input type="range" min={FX_TEXT_SIZE_MIN} max={FX_TEXT_SIZE_MAX} step="1"
            value={settings.fxTextSize}
            onChange={e => updateSettings({ fxTextSize: Math.min(FX_TEXT_SIZE_MAX, Math.max(FX_TEXT_SIZE_MIN, parseInt(e.target.value, 10))) })} />
          <div className="fx-text-preview" style={{ fontSize: settings.fxTextSize }}>The quick brown fox 🔥</div>
        </div>
        <div className="form-group">
          <label className="form-label">Vertical position: {settings.fxVerticalPos}% {settings.fxVerticalPos <= 5 ? '(top)' : settings.fxVerticalPos >= 95 ? '(bottom)' : settings.fxVerticalPos === 50 ? '(center)' : ''}</label>
          <input type="range" min={FX_VPOS_MIN} max={FX_VPOS_MAX} step="1"
            value={settings.fxVerticalPos}
            onChange={e => updateSettings({ fxVerticalPos: Math.min(FX_VPOS_MAX, Math.max(FX_VPOS_MIN, parseInt(e.target.value, 10))) })} />
          <span className="form-hint">0% = top of the screen, 50% = centered, 100% = bottom.</span>
        </div>
        <div className="form-group">
          <label className="form-label">Darken background behind effect: {settings.fxDim}%</label>
          <input type="range" min={FX_DIM_MIN} max={FX_DIM_MAX} step="1"
            value={settings.fxDim}
            onChange={e => updateSettings({ fxDim: Math.min(FX_DIM_MAX, Math.max(FX_DIM_MIN, parseInt(e.target.value, 10))) })} />
          <span className="form-hint">Dims the chat behind the effect so the text stays readable. 0% = none, 100% = fully black.</span>
        </div>
      </div>

      {/* Network */}
      <div className="settings-section">
        <h3>Network (RPC)</h3>
        <div className="form-group">
          <label className="form-label">RPC endpoint</label>
          <div className="input-with-action">
            <input className="form-input" value={rpc} onChange={e => setRpc(e.target.value)} spellCheck={false} autoCapitalize="none" />
            <button className="btn btn-secondary" onClick={saveRpc}>Save</button>
          </div>
          {rpcMsg && <span className="form-hint">{rpcMsg}</span>}
          <span className="form-hint">Use your own (Helius/QuickNode/etc) for reliable listening.</span>
        </div>
      </div>

      {/* Auto-replenish SOL */}
      <div className="settings-section">
        <h3>Auto-replenish SOL</h3>
        <ToggleRow label="Auto top-up SOL from h173k" checked={repEnabled}
          onChange={v => { setRepEnabled(v); saveReplenishEnabled(v) }} />
        <div className="form-group">
          <label className="form-label">Trigger below (SOL)</label>
          <input className="form-input" type="number" min={MIN_TRIGGER_THRESHOLD} step="0.001" value={rep.threshold}
            onChange={e => saveRep({ threshold: Math.max(MIN_TRIGGER_THRESHOLD, parseFloat(e.target.value || '0')) })} />
        </div>
        <div className="form-group">
          <label className="form-label">Replenish up to (SOL)</label>
          <input className="form-input" type="number" min={MIN_REPLENISH_TO} step="0.001" value={rep.replenishTo}
            onChange={e => saveRep({ replenishTo: Math.max(MIN_REPLENISH_TO, parseFloat(e.target.value || '0')) })} />
        </div>
        <div className="form-group">
          <label className="form-label">Priority fee (SOL)</label>
          <input className="form-input" type="number" min={MIN_SWAP_PRIORITY_FEE} step="0.0001" value={rep.swapFeeSol}
            onChange={e => saveRep({ swapFeeSol: Math.max(MIN_SWAP_PRIORITY_FEE, parseFloat(e.target.value || '0')) })} />
        </div>
        <span className="form-hint">When on, the app swaps a little h173k → SOL on the h173k-SOL pool so you always have fees.</span>
      </div>

      {/* Account */}
      <div className="settings-section">
        <h3>Account</h3>
        <div className="settings-item" onClick={() => { navigator.clipboard?.writeText(pubkey?.toString() || '') }}>
          <span>Address</span><span className="address-small">{truncateAddress(pubkey?.toString(), 6, 6)}</span>
        </div>
        {bioSupported ? (
          <ToggleRow label="Unlock with biometrics (skip PIN entry)" checked={bioOn} onChange={toggleBiometric} />
        ) : (
          <div className="settings-item"><span className="dim">Biometrics not available on this device</span></div>
        )}
        {bioMsg && <div className="form-hint" style={{ padding: '0 4px' }}>{bioMsg}</div>}
        <div className="settings-item" onClick={() => setShowChangePin(true)}><span>Change PIN</span><span className="arrow">›</span></div>
        {pinMsg && <div className="form-hint" style={{ padding: '0 4px' }}>{pinMsg}</div>}
        <div className="settings-item" onClick={() => setShowRevealPin(true)}><span>Show recovery phrase</span><span className="arrow">›</span></div>
        <div className="settings-item" onClick={onLock}><span>Lock now</span><span className="arrow">›</span></div>
      </div>

      {/* Danger */}
      <div className="settings-section danger">
        <h3>Danger zone</h3>
        {!confirmDelete ? (
          <button className="btn btn-danger" style={{ width: '100%' }} onClick={() => setConfirmDelete(true)}>Remove account from this device</button>
        ) : (
          <div className="delete-confirm">
            <p className="warning-text">This erases the encrypted seed from this device. Make sure you have your recovery phrase saved — it's the only way to restore.</p>
            <div className="delete-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { deleteWallet(); sessionWallet.lock(); location.reload() }}>Delete</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 40 }} />

      {showBioPin && (
        <PinPrompt
          title="Confirm your PIN"
          subtitle="Enter your current PIN to link biometric unlock to this account."
          onSubmit={enableBiometric}
          onCancel={() => setShowBioPin(false)}
        />
      )}

      {showChangePin && (
        <ChangePinModal
          onClose={() => setShowChangePin(false)}
          onDone={(bioReset) => {
            setShowChangePin(false)
            if (bioReset) setBioOn(false)
            setPinMsg(bioReset ? 'PIN changed ✓ — re-enable biometric unlock' : 'PIN changed ✓')
            setTimeout(() => setPinMsg(''), 5000)
          }}
        />
      )}

      {showRevealPin && (
        <PinPrompt
          title="Confirm your PIN"
          subtitle="Enter your PIN to reveal your recovery phrase."
          onSubmit={(pin) => {
            const m = exportMnemonic(pin) // throws on wrong PIN → shown by PinPrompt
            setRevealedPhrase(m)
            setShowRevealPin(false)
          }}
          onCancel={() => setShowRevealPin(false)}
        />
      )}

      {revealedPhrase && <RecoveryPhraseModal phrase={revealedPhrase} onClose={() => setRevealedPhrase(null)} />}
    </div>
  )
}

function SegRow({ label, value, options, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="seg">
        {options.map(([val, txt]) => (
          <button key={val} className={value === val ? 'active' : ''} onClick={() => onChange(val)}>{txt}</button>
        ))}
      </div>
    </div>
  )
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="settings-item" onClick={() => onChange(!checked)} style={{ cursor: 'pointer' }}>
      <span>{label}</span>
      <span className={`switch ${checked ? 'on' : ''}`}><span className="knob" /></span>
    </div>
  )
}
