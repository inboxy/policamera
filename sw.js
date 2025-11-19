const CACHE_NAME = 'policamera-v4'; // Updated for encryption and integrity checks

// Critical files with integrity validation
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  // Core Utilities
  './constants.js',
  './utils.js',
  './ui-helpers.js',
  './crypto-manager.js',
  // Data Management
  './database.js',
  './network.js',
  // Feature Modules
  './qr.js',
  './gps-manager.js',
  './stitch.js',
  './opencv-wrapper.js',
  // AI Modules
  './ai.js',
  './ai-worker.js',
  './pose.js',
  './face.js',
  './depth.js',
  // Main Application
  './app.js'
];

// File integrity hashes (should be generated during build)
// For now, we'll validate file types and sizes
const integrityChecks = {
  maxFileSize: 10 * 1024 * 1024, // 10MB max for any cached file
  allowedTypes: [
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript',
    'application/json',
    'application/manifest+json'
  ]
};

/**
 * Validate response before caching
 * @param {Response} response - Response to validate
 * @param {string} url - URL of the resource
 * @returns {boolean} True if response is valid
 */
function validateResponse(response, url) {
  // Check if response is valid
  if (!response || response.status !== 200) {
    console.warn(`Invalid response for ${url}: status ${response?.status}`);
    return false;
  }

  // Check content type
  const contentType = response.headers.get('content-type');
  if (contentType) {
    const isAllowedType = integrityChecks.allowedTypes.some(type =>
      contentType.toLowerCase().includes(type)
    );
    if (!isAllowedType) {
      console.warn(`Disallowed content type for ${url}: ${contentType}`);
      return false;
    }
  }

  // Check content length if available
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > integrityChecks.maxFileSize) {
    console.warn(`File too large for ${url}: ${contentLength} bytes`);
    return false;
  }

  return true;
}

// Install event - cache resources with validation
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        console.log('📦 Service Worker: Installing and caching resources...');

        // Cache files one by one with validation
        const cachePromises = urlsToCache.map(async url => {
          try {
            const response = await fetch(url);

            if (!validateResponse(response, url)) {
              console.error(`Validation failed for ${url}, skipping cache`);
              return;
            }

            // Clone response before caching (can only read once)
            await cache.put(url, response.clone());
            console.log(`✅ Cached: ${url}`);
          } catch (error) {
            console.error(`Failed to cache ${url}:`, error);
            // Don't fail installation if optional resources fail
            if (url === './index.html' || url === './app.js') {
              throw error; // Critical files must be cached
            }
          }
        });

        await Promise.allSettled(cachePromises);
        console.log('✅ Service Worker: Installation complete');
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

// Fetch event - serve from cache with validation, fallback to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // If we have a cached response, validate it
        if (cachedResponse) {
          // Check if cached response is still valid
          const cacheDate = cachedResponse.headers.get('date');
          if (cacheDate) {
            const cacheAge = Date.now() - new Date(cacheDate).getTime();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours

            // If cache is stale, try network first
            if (cacheAge > maxAge) {
              console.log(`Stale cache for ${event.request.url}, trying network`);
              return fetch(event.request)
                .then(fetchResponse => {
                  if (validateResponse(fetchResponse, event.request.url)) {
                    const responseToCache = fetchResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                      cache.put(event.request, responseToCache);
                    });
                    return fetchResponse;
                  }
                  return cachedResponse; // Return stale cache if network response invalid
                })
                .catch(() => cachedResponse); // Return stale cache on network error
            }
          }

          return cachedResponse;
        }

        // No cache, fetch from network
        return fetch(event.request).then(fetchResponse => {
          // Validate response before caching
          if (!validateResponse(fetchResponse, event.request.url)) {
            return fetchResponse; // Return without caching if invalid
          }

          // Only cache same-origin GET requests
          if (event.request.url.startsWith(self.location.origin)) {
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
      })
      .catch(() => {
        // If both cache and network fail, return offline page for navigation requests
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
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