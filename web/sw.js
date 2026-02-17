/**
 * Surebet Detector Service Worker
 * Provides offline support, caching, and push notifications
 */

const CACHE_NAME = 'surebet-detector-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

const API_CACHE_NAME = 'surebet-api-v1';
const API_ROUTES = [
  '/api/opportunities',
  '/api/stats',
  '/api/movements'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Skip waiting');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Cache failed:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== API_CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // API requests - network first, cache fallback
  if (API_ROUTES.some(route => url.pathname.includes(route))) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // Static assets - cache first, network fallback
  event.respondWith(cacheFirst(request));
});

// Cache first strategy for static assets
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  if (cached) {
    // Return cached version and update in background
    fetch(request)
      .then((response) => {
        if (response.ok) {
          cache.put(request, response.clone());
        }
      })
      .catch(() => {});
    return cached;
  }
  
  // Not in cache, fetch from network
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Fetch failed:', error);
    // Return offline fallback for HTML requests
    if (request.headers.get('accept')?.includes('text/html')) {
      return cache.match('/index.html');
    }
    throw error;
  }
}

// Network first strategy for API calls
async function networkFirst(request) {
  const cache = await caches.open(API_CACHE_NAME);
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Update cache with fresh data
      cache.put(request, networkResponse.clone());
      
      // Notify clients about new data
      notifyClients('data-updated', {
        url: request.url,
        timestamp: Date.now()
      });
      
      return networkResponse;
    }
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', error);
  }
  
  // Return cached version if available
  const cached = await cache.match(request);
  if (cached) {
    console.log('[SW] Serving cached API response');
    return cached;
  }
  
  // No cache available
  return new Response(
    JSON.stringify({ error: 'Offline', cached: false }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  if (!event.data) {
    return;
  }
  
  const data = event.data.json();
  const options = {
    body: data.body || 'New arbitrage opportunity detected!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: data.tag || 'surebet-alert',
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    data: data.payload || {}
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Surebet Alert', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  
  event.notification.close();
  
  const { action, notification } = event;
  const data = notification.data || {};
  
  if (action === 'dismiss') {
    return;
  }
  
  // Open or focus the app
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const url = data.url || '/';
        
        // Focus existing window if open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        
        // Open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-opportunities') {
    event.waitUntil(syncOpportunities());
  }
});

// Sync opportunities when back online
async function syncOpportunities() {
  try {
    const response = await fetch('/api/opportunities');
    const data = await response.json();
    
    const cache = await caches.open(API_CACHE_NAME);
    cache.put('/api/opportunities', new Response(JSON.stringify(data)));
    
    notifyClients('sync-complete', { timestamp: Date.now() });
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

// Message handling from main thread
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'skip-waiting':
      self.skipWaiting();
      break;
      
    case 'cache-opportunities':
      cacheOpportunities(payload);
      break;
      
    case 'subscribe-push':
      subscribePush(payload);
      break;
      
    default:
      console.log('[SW] Unknown message type:', type);
  }
});

// Cache opportunities data
async function cacheOpportunities(data) {
  const cache = await caches.open(API_CACHE_NAME);
  const response = new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
  await cache.put('/api/opportunities', response);
  console.log('[SW] Opportunities cached');
}

// Subscribe to push notifications
async function subscribePush(subscription) {
  // Store subscription for later use
  console.log('[SW] Push subscription received');
  
  // Send to server
  try {
    await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });
    console.log('[SW] Push subscription saved');
  } catch (error) {
    console.error('[SW] Failed to save subscription:', error);
  }
}

// Helper to notify all clients
function notifyClients(type, payload) {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type, payload });
      });
    });
}

// Periodic background sync (if supported)
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'update-opportunities') {
      event.waitUntil(syncOpportunities());
    }
  });
}

console.log('[SW] Service worker loaded');
