/**
 * Utility Functions for PoliCamera
 * Common helper functions and data processing utilities
 */
class Utils {
    /**
     * Generate a secure random user ID
     * @param {number} length - Length of ID to generate
     * @returns {string} Generated user ID
     */
    static generateUserId(length = AppConstants.USER_ID_LENGTH) {
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        const array = new Uint8Array(length);

        if (crypto && crypto.getRandomValues) {
            crypto.getRandomValues(array);
        } else {
            // Fallback for older browsers
            for (let i = 0; i < length; i++) {
                array[i] = Math.floor(Math.random() * 256);
            }
        }

        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars[array[i] % chars.length];
        }

        return result;
    }

    /**
     * Set a cookie
     * @param {string} name - Cookie name
     * @param {string} value - Cookie value
     * @param {number} days - Days until expiration
     */
    static setCookie(name, value, days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        const expires = `expires=${date.toUTCString()}`;
        document.cookie = `${name}=${value};${expires};path=/;SameSite=Strict`;
    }

    /**
     * Get a cookie value
     * @param {string} name - Cookie name
     * @returns {string|null} Cookie value or null
     */
    static getCookie(name) {
        const nameEQ = name + "=";
        const cookies = document.cookie.split(';');

        for (let i = 0; i < cookies.length; i++) {
            let cookie = cookies[i];
            while (cookie.charAt(0) === ' ') {
                cookie = cookie.substring(1, cookie.length);
            }
            if (cookie.indexOf(nameEQ) === 0) {
                return cookie.substring(nameEQ.length, cookie.length);
            }
        }
        return null;
    }

    /**
     * Format time in WebVTT format (HH:MM:SS.mmm)
     * @param {number} milliseconds - Time in milliseconds
     * @returns {string} Formatted time string
     */
    static formatVTTTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const ms = milliseconds % 1000;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }

    /**
     * Format location data for VTT cue text
     * @param {Object} location - Location data
     * @param {Object} orientation - Orientation data
     * @param {Object} network - Network info
     * @returns {string} Formatted cue text
     */
    static formatCueText(location, orientation, network) {
        let text = '';

        if (location.latitude !== '--') {
            // Primary GPS coordinates
            text += `GPS COORDINATES\n`;
            text += `LAT: ${location.latitude}\n`;
            text += `LON: ${location.longitude}\n`;

            // Secondary GPS info
            if (location.altitude !== '-- m') {
                text += `ALT: ${location.altitude}\n`;
            }
            text += `ACC: ${location.accuracy}\n`;
        } else {
            text += `GPS: SEARCHING...\n`;
        }

        // Add timestamp
        const now = new Date();
        text += `TIME: ${now.toLocaleTimeString()}\n`;

        // Add orientation data if available
        if (orientation.alpha !== '0°') {
            text += `HEADING: ${orientation.alpha}\n`;
        }

        // Network status
        text += `${network.online ? 'ONLINE' : 'OFFLINE'}`;
        if (network.effectiveType && network.effectiveType !== 'unknown') {
            text += ` (${network.effectiveType.toUpperCase()})`;
        }

        return text.trim();
    }

    /**
     * Parse numeric value from text with unit
     * @param {string} text - Text to parse (e.g., "123 m", "45°")
     * @param {string} defaultValue - Default value to return if parsing fails
     * @returns {number|null} Parsed number or null
     */
    static parseNumericValue(text, defaultValue = null) {
        if (text === defaultValue) return null;
        const match = text.match(/^(\d+)/);
        return match ? parseInt(match[1]) : null;
    }

    /**
     * Debounce function calls
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Throttle function calls
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in milliseconds
     * @returns {Function} Throttled function
     */
    static throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Deep clone an object
     * @param {Object} obj - Object to clone
     * @returns {Object} Cloned object
     */
    static deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));

        const clonedObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = this.deepClone(obj[key]);
            }
        }
        return clonedObj;
    }

    /**
     * Check if device supports a specific API
     * @param {string} api - API name to check
     * @returns {boolean} True if supported
     */
    static supportsAPI(api) {
        const apis = {
            'geolocation': () => 'geolocation' in navigator,
            'mediaDevices': () => 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
            'serviceWorker': () => 'serviceWorker' in navigator,
            'indexedDB': () => 'indexedDB' in window,
            'webgl': () => {
                try {
                    const canvas = document.createElement('canvas');
                    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
                } catch (e) {
                    return false;
                }
            },
            'deviceOrientation': () => 'DeviceOrientationEvent' in window,
            'connection': () => 'connection' in navigator
        };

        return apis[api] ? apis[api]() : false;
    }

    /**
     * Request permission for device orientation on iOS
     * @returns {Promise<boolean>} True if granted
     */
    static async requestOrientationPermission() {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                return permission === 'granted';
            } catch (error) {
                console.error('Error requesting orientation permission:', error);
                return false;
            }
        }
        return true; // Permission not required on non-iOS devices
    }

    /**
     * Calculate distance between two GPS coordinates (Haversine formula)
     * @param {number} lat1 - Latitude 1
     * @param {number} lon1 - Longitude 1
     * @param {number} lat2 - Latitude 2
     * @param {number} lon2 - Longitude 2
     * @returns {number} Distance in meters
     */
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    /**
     * Format bytes to human-readable string
     * @param {number} bytes - Number of bytes
     * @param {number} decimals - Number of decimal places
     * @returns {string} Formatted string (e.g., "1.5 MB")
     */
    static formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    /**
     * Validate email format
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid
     */
    static isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    /**
     * Get device information
     * @returns {Object} Device info
     */
    static getDeviceInfo() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            onLine: navigator.onLine,
            cookieEnabled: navigator.cookieEnabled,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1
        };
    }

    /**
     * Check if running on mobile device
     * @returns {boolean} True if mobile
     */
    static isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
     * Check if running in standalone mode (PWA)
     * @returns {boolean} True if standalone
     */
    static isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true;
    }

    /**
     * Load JSON from manifest file
     * @returns {Promise<Object>} Manifest data
     */
    static async loadManifest() {
        try {
            const response = await fetch('manifest.json');
            return await response.json();
        } catch (error) {
            console.error('Failed to load manifest:', error);
            return null;
        }
    }

    /**
     * Safe JSON parse with error handling
     * @param {string} jsonString - JSON string to parse
     * @param {*} defaultValue - Default value if parsing fails
     * @returns {*} Parsed object or default value
     */
    static safeJsonParse(jsonString, defaultValue = null) {
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('JSON parse error:', error);
            return defaultValue;
        }
    }

    /**
     * Safe localStorage getItem with error handling
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Stored value or default
     */
    static safeLocalStorageGet(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('localStorage get error:', error);
            return defaultValue;
        }
    }

    /**
     * Safe localStorage setItem with error handling
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @returns {boolean} True if successful
     */
    static safeLocalStorageSet(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('localStorage set error:', error);
            return false;
        }
    }

    /**
     * Retry a function with exponential backoff
     * @param {Function} fn - Function to retry
     * @param {number} maxRetries - Maximum number of retries
     * @param {number} baseDelay - Base delay in milliseconds
     * @returns {Promise<*>} Result of function
     */
    static async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                const delay = baseDelay * Math.pow(2, i);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
} else {
    window.Utils = Utils;
}
