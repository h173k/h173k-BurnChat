const CACHE_NAME = 'h173k-burnchat-v1'
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  // Never cache RPC / price / dynamic API calls
  if (url.protocol === 'https:' && url.origin !== self.location.origin) return
  if (url.pathname.includes('/api/')) return
  event.respondWith(
    fetch(event.request).then(response => {
      const clone = response.clone()
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
      return response
    }).catch(() => caches.match(event.request))
  )
})
