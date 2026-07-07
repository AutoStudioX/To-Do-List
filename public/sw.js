const CACHE_NAME = 'dashboard-v2'

self.addEventListener('install', event => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
})

self.addEventListener('fetch', event => {
  // Never cache HTML pages — always fetch fresh from network
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request))
    return
  }
  // Cache-first for static assets only
  if (event.request.destination === 'style' || event.request.destination === 'script' || event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
        const clone = res.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        return res
      }))
    )
    return
  }
  event.respondWith(fetch(event.request))
})
