/**
 * Browser notifications for incoming burns.
 *
 * Scope note: these are foreground notifications raised by the page itself.
 * They fire while the app is open (including when its tab is in the background
 * or the phone screen is on another app, as long as the page is alive). Waking
 * a fully closed app would need Web Push with a server holding subscriptions
 * and VAPID keys, which this client-only app has no backend for.
 */

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export function notificationPermission() {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * Ask the OS/browser for permission. Must be called from a user gesture on
 * most browsers, so this is wired to the toggle in Settings rather than run
 * automatically on load.
 */
export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/**
 * Show one notification. Returns false when it could not be shown, so callers
 * can fall back to an in-app toast.
 *
 * `tag` collapses repeats: re-notifying with the same tag replaces the previous
 * one instead of stacking, which keeps a burst of burns from flooding the tray.
 */
export function showNotification(title, { body, tag, icon, onClick } = {}) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false
  try {
    const n = new Notification(title, {
      body,
      tag,
      icon: icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      silent: false,
    })
    n.onclick = () => {
      try { window.focus() } catch { /* ignore */ }
      n.close()
      if (onClick) onClick()
    }
    return true
  } catch {
    // Some mobile browsers only allow notifications via a service worker
    // registration and throw on the constructor. Nothing to recover here.
    return false
  }
}
