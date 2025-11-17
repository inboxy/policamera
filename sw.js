const CACHE_NAME = 'policamera-v3'; // Updated for refactored modules
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  // Core Utilities
  '/constants.js',
  '/utils.js',
  '/ui-helpers.js',
  // Data Management
  '/database.js',
  '/network.js',
  // Feature Modules
  '/qr.js',
  '/gps-manager.js',
  '/stitch.js',
  '/opencv-wrapper.js',
  // AI Modules
  '/ai.js',
  '/ai-worker.js',
  '/pose.js',
  '/face.js',
  '/depth.js',
  // Main Application
  '/app.js'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request).then(fetchResponse => {
          // Check if valid response
          if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
            return fetchResponse;
          }

          // Only cache GET requests for cacheable resources
          if (event.request.method === 'GET' && event.request.url.startsWith(self.location.origin)) {
            // Clone the response
            const responseToCache = fetchResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              })
              .catch(error => {
                console.warn('Failed to cache response:', error);
              });
          }

          return fetchResponse;
        });
      }).catch(() => {
        // If both cache and network fail, return offline page for navigation requests
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});

// Background sync for photo uploads (when online)
self.addEventListener('sync', event => {
  if (event.tag === 'photo-upload') {
    event.waitUntil(uploadPendingPhotos());
  }
});

async function uploadPendingPhotos() {
  // This would handle uploading photos when the device comes back online
  // For now, just log that sync occurred
  console.log('Background sync: photo-upload');

  try {
    // Get pending photos from IndexedDB or localStorage
    // Upload them to your server
    // Remove from pending queue once uploaded
    console.log('Photos would be uploaded here');
  } catch (error) {
    console.error('Failed to upload photos:', error);
    throw error; // This will retry the sync
  }
}

// Push notifications (for future enhancement)
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: data.primaryKey
      }
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow('/')
  );
});