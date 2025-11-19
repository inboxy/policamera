/**
 * Crypto Manager for PoliCamera
 * Provides client-side encryption for sensitive data using Web Crypto API
 */
class CryptoManager {
    constructor() {
        this.keyName = 'policamera-encryption-key';
        this.algorithm = {
            name: 'AES-GCM',
            length: 256
        };
        this.key = null;
    }

    /**
     * Initialize or retrieve encryption key
     * @returns {Promise<CryptoKey>}
     */
    async initializeKey() {
        if (this.key) {
            return this.key;
        }

        try {
            // Try to load existing key from IndexedDB
            const storedKey = await this.loadKeyFromStorage();

            if (storedKey) {
                this.key = storedKey;
                console.log('✅ Encryption key loaded from storage');
                return this.key;
            }

            // Generate new key if none exists
            this.key = await window.crypto.subtle.generateKey(
                this.algorithm,
                true, // extractable
                ['encrypt', 'decrypt']
            );

            // Store the key for future use
            await this.saveKeyToStorage(this.key);
            console.log('✅ New encryption key generated and stored');

            return this.key;
        } catch (error) {
            console.error('Failed to initialize encryption key:', error);
            throw new Error('Encryption key initialization failed');
        }
    }

    /**
     * Save encryption key to IndexedDB
     * @param {CryptoKey} key - Crypto key to save
     * @returns {Promise<void>}
     */
    async saveKeyToStorage(key) {
        try {
            const exportedKey = await window.crypto.subtle.exportKey('jwk', key);

            // Store in a separate IndexedDB for keys
            const db = await this.openKeyDB();
            const transaction = db.transaction(['keys'], 'readwrite');
            const store = transaction.objectStore('keys');

            await new Promise((resolve, reject) => {
                const request = store.put({ id: this.keyName, key: exportedKey });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            db.close();
        } catch (error) {
            console.error('Failed to save encryption key:', error);
            throw error;
        }
    }

    /**
     * Load encryption key from IndexedDB
     * @returns {Promise<CryptoKey|null>}
     */
    async loadKeyFromStorage() {
        try {
            const db = await this.openKeyDB();
            const transaction = db.transaction(['keys'], 'readonly');
            const store = transaction.objectStore('keys');

            const exportedKey = await new Promise((resolve, reject) => {
                const request = store.get(this.keyName);
                request.onsuccess = () => {
                    resolve(request.result?.key || null);
                };
                request.onerror = () => reject(request.error);
            });

            db.close();

            if (!exportedKey) {
                return null;
            }

            // Import the key
            const key = await window.crypto.subtle.importKey(
                'jwk',
                exportedKey,
                this.algorithm,
                true,
                ['encrypt', 'decrypt']
            );

            return key;
        } catch (error) {
            console.warn('Failed to load encryption key:', error);
            return null;
        }
    }

    /**
     * Open or create the key storage database
     * @returns {Promise<IDBDatabase>}
     */
    async openKeyDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('PoliCameraKeyDB', 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('keys')) {
                    db.createObjectStore('keys', { keyPath: 'id' });
                }
            };
        });
    }

    /**
     * Encrypt data
     * @param {string} data - Data to encrypt
     * @returns {Promise<Object>} Encrypted data with IV
     */
    async encrypt(data) {
        if (!data) return null;

        try {
            await this.initializeKey();

            // Generate random IV (Initialization Vector)
            const iv = window.crypto.getRandomValues(new Uint8Array(12));

            // Convert string to ArrayBuffer
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(data);

            // Encrypt the data
            const encryptedBuffer = await window.crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                this.key,
                dataBuffer
            );

            // Convert to base64 for storage
            const encryptedArray = new Uint8Array(encryptedBuffer);
            const encryptedBase64 = this.arrayBufferToBase64(encryptedArray);
            const ivBase64 = this.arrayBufferToBase64(iv);

            return {
                encrypted: encryptedBase64,
                iv: ivBase64
            };
        } catch (error) {
            console.error('Encryption failed:', error);
            throw new Error('Failed to encrypt data');
        }
    }

    /**
     * Decrypt data
     * @param {Object} encryptedData - Object with encrypted data and IV
     * @returns {Promise<string>} Decrypted data
     */
    async decrypt(encryptedData) {
        if (!encryptedData || !encryptedData.encrypted || !encryptedData.iv) {
            return null;
        }

        try {
            await this.initializeKey();

            // Convert base64 back to ArrayBuffer
            const encryptedBuffer = this.base64ToArrayBuffer(encryptedData.encrypted);
            const iv = this.base64ToArrayBuffer(encryptedData.iv);

            // Decrypt the data
            const decryptedBuffer = await window.crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                this.key,
                encryptedBuffer
            );

            // Convert ArrayBuffer back to string
            const decoder = new TextDecoder();
            return decoder.decode(decryptedBuffer);
        } catch (error) {
            console.error('Decryption failed:', error);
            throw new Error('Failed to decrypt data');
        }
    }

    /**
     * Encrypt GPS coordinates
     * @param {Object} location - Location object with lat/lon
     * @returns {Promise<Object>} Encrypted location
     */
    async encryptLocation(location) {
        if (!location) return null;

        try {
            const encryptedLat = location.latitude ?
                await this.encrypt(String(location.latitude)) : null;
            const encryptedLon = location.longitude ?
                await this.encrypt(String(location.longitude)) : null;
            const encryptedAlt = location.altitude ?
                await this.encrypt(String(location.altitude)) : null;

            return {
                latitude: encryptedLat,
                longitude: encryptedLon,
                altitude: encryptedAlt,
                accuracy: location.accuracy // Keep accuracy unencrypted for sorting/filtering
            };
        } catch (error) {
            console.error('Failed to encrypt location:', error);
            return location; // Return unencrypted on error
        }
    }

    /**
     * Decrypt GPS coordinates
     * @param {Object} encryptedLocation - Encrypted location object
     * @returns {Promise<Object>} Decrypted location
     */
    async decryptLocation(encryptedLocation) {
        if (!encryptedLocation) return null;

        try {
            const latitude = encryptedLocation.latitude ?
                parseFloat(await this.decrypt(encryptedLocation.latitude)) : null;
            const longitude = encryptedLocation.longitude ?
                parseFloat(await this.decrypt(encryptedLocation.longitude)) : null;
            const altitude = encryptedLocation.altitude ?
                parseFloat(await this.decrypt(encryptedLocation.altitude)) : null;

            return {
                latitude,
                longitude,
                altitude,
                accuracy: encryptedLocation.accuracy
            };
        } catch (error) {
            console.error('Failed to decrypt location:', error);
            return encryptedLocation; // Return encrypted data on error
        }
    }

    /**
     * Convert ArrayBuffer to Base64
     * @param {Uint8Array} buffer - Buffer to convert
     * @returns {string} Base64 string
     */
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Convert Base64 to ArrayBuffer
     * @param {string} base64 - Base64 string
     * @returns {Uint8Array} Array buffer
     */
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Check if encryption is supported
     * @returns {boolean} True if supported
     */
    static isSupported() {
        return 'crypto' in window &&
               'subtle' in window.crypto &&
               'generateKey' in window.crypto.subtle;
    }

    /**
     * Delete encryption key (for testing or reset)
     * @returns {Promise<void>}
     */
    async deleteKey() {
        try {
            const db = await this.openKeyDB();
            const transaction = db.transaction(['keys'], 'readwrite');
            const store = transaction.objectStore('keys');

            await new Promise((resolve, reject) => {
                const request = store.delete(this.keyName);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            db.close();
            this.key = null;
            console.log('✅ Encryption key deleted');
        } catch (error) {
            console.error('Failed to delete encryption key:', error);
            throw error;
        }
    }
}

// Create singleton instance
const cryptoManager = new CryptoManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = cryptoManager;
} else {
    window.cryptoManager = cryptoManager;
}
