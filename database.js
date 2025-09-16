/**
 * IndexedDB database manager for PoliCamera
 * Stores user data including GPS coordinates, photos, and metadata
 */
class DatabaseManager {
    constructor() {
        this.dbName = 'PoliCameraDB';
        this.dbVersion = 1;
        this.db = null;
        this.stores = {
            photos: 'photos',
            gpsLogs: 'gpsLogs',
            sessions: 'sessions'
        };
    }

    /**
     * Initialize the database connection
     * @returns {Promise<void>}
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('Database error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database initialized successfully');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                this.createObjectStores(db);
            };
        });
    }

    /**
     * Create object stores for the database
     * @param {IDBDatabase} db
     */
    createObjectStores(db) {
        // Photos store
        if (!db.objectStoreNames.contains(this.stores.photos)) {
            const photosStore = db.createObjectStore(this.stores.photos, {
                keyPath: 'id',
                autoIncrement: true
            });

            photosStore.createIndex('userId', 'userId', { unique: false });
            photosStore.createIndex('timestamp', 'timestamp', { unique: false });
            photosStore.createIndex('imageName', 'imageName', { unique: false });
        }

        // GPS logs store
        if (!db.objectStoreNames.contains(this.stores.gpsLogs)) {
            const gpsStore = db.createObjectStore(this.stores.gpsLogs, {
                keyPath: 'id',
                autoIncrement: true
            });

            gpsStore.createIndex('userId', 'userId', { unique: false });
            gpsStore.createIndex('timestamp', 'timestamp', { unique: false });
            gpsStore.createIndex('date', 'date', { unique: false });
        }

        // Sessions store
        if (!db.objectStoreNames.contains(this.stores.sessions)) {
            const sessionsStore = db.createObjectStore(this.stores.sessions, {
                keyPath: 'id',
                autoIncrement: true
            });

            sessionsStore.createIndex('userId', 'userId', { unique: false });
            sessionsStore.createIndex('startTime', 'startTime', { unique: false });
        }
    }

    /**
     * Store photo data with GPS information
     * @param {Object} photoData
     * @returns {Promise<number>}
     */
    async storePhoto(photoData) {
        const now = new Date();

        const record = {
            userId: photoData.userId,
            date: now.toISOString().split('T')[0], // YYYY-MM-DD
            time: now.toTimeString().split(' ')[0], // HH:MM:SS
            timestamp: now.toISOString(),
            lat: photoData.location?.latitude || null,
            lon: photoData.location?.longitude || null,
            alt: photoData.location?.altitude || null,
            accuracy: photoData.location?.accuracy || null,
            error: photoData.error || null,
            imageName: photoData.imageName || `photo_${Date.now()}.jpg`,
            imageData: photoData.imageData || null,
            orientation: photoData.orientation || null,
            networkInfo: photoData.networkInfo || null
        };

        return this.addRecord(this.stores.photos, record);
    }

    /**
     * Store GPS log entry
     * @param {Object} gpsData
     * @returns {Promise<number>}
     */
    async storeGPSLog(gpsData) {
        const now = new Date();

        const record = {
            userId: gpsData.userId,
            date: now.toISOString().split('T')[0],
            time: now.toTimeString().split(' ')[0],
            timestamp: now.toISOString(),
            lat: gpsData.lat,
            lon: gpsData.lon,
            alt: gpsData.alt,
            accuracy: gpsData.accuracy,
            error: gpsData.error || null,
            heading: gpsData.heading || null,
            speed: gpsData.speed || null
        };

        return this.addRecord(this.stores.gpsLogs, record);
    }

    /**
     * Add a record to a specific store
     * @param {string} storeName
     * @param {Object} record
     * @returns {Promise<number>}
     */
    async addRecord(storeName, record) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(record);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                console.error(`Error adding record to ${storeName}:`, request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get all photos for a specific user
     * @param {string} userId
     * @returns {Promise<Array>}
     */
    async getPhotosForUser(userId) {
        return this.getRecordsByIndex(this.stores.photos, 'userId', userId);
    }

    /**
     * Get GPS logs for a specific user and date range
     * @param {string} userId
     * @param {string} startDate - ISO date string
     * @param {string} endDate - ISO date string
     * @returns {Promise<Array>}
     */
    async getGPSLogsForUser(userId, startDate = null, endDate = null) {
        if (!startDate && !endDate) {
            return this.getRecordsByIndex(this.stores.gpsLogs, 'userId', userId);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.stores.gpsLogs], 'readonly');
            const store = transaction.objectStore(this.stores.gpsLogs);
            const index = store.index('userId');
            const request = index.getAll(userId);

            request.onsuccess = () => {
                let results = request.result;

                if (startDate || endDate) {
                    results = results.filter(record => {
                        const recordDate = record.date;
                        if (startDate && recordDate < startDate) return false;
                        if (endDate && recordDate > endDate) return false;
                        return true;
                    });
                }

                resolve(results);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get records by index
     * @param {string} storeName
     * @param {string} indexName
     * @param {any} value
     * @returns {Promise<Array>}
     */
    async getRecordsByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Delete a record by ID
     * @param {string} storeName
     * @param {number} id
     * @returns {Promise<void>}
     */
    async deleteRecord(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Clear all records from a store
     * @param {string} storeName
     * @returns {Promise<void>}
     */
    async clearStore(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get database statistics
     * @returns {Promise<Object>}
     */
    async getStats() {
        const stats = {};

        for (const storeName of Object.values(this.stores)) {
            stats[storeName] = await this.getRecordCount(storeName);
        }

        return stats;
    }

    /**
     * Get record count for a store
     * @param {string} storeName
     * @returns {Promise<number>}
     */
    async getRecordCount(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Export data for a specific user
     * @param {string} userId
     * @returns {Promise<Object>}
     */
    async exportUserData(userId) {
        const [photos, gpsLogs] = await Promise.all([
            this.getPhotosForUser(userId),
            this.getGPSLogsForUser(userId)
        ]);

        return {
            userId,
            exportDate: new Date().toISOString(),
            photos,
            gpsLogs,
            stats: {
                totalPhotos: photos.length,
                totalGPSLogs: gpsLogs.length
            }
        };
    }

    /**
     * Close the database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// Create singleton instance
const databaseManager = new DatabaseManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = databaseManager;
} else {
    window.databaseManager = databaseManager;
}