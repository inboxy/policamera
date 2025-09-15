/**
 * Network utility module for handling connection monitoring and status updates
 */
class NetworkManager {
    constructor() {
        this.statusElement = null;
        this.statusIcon = null;
        this.statusText = null;
        this.callbacks = [];

        this.initializeEventListeners();
    }

    /**
     * Initialize the network manager with DOM elements
     * @param {string} statusElementId - ID of the network status element
     */
    initialize(statusElementId) {
        this.statusElement = document.getElementById(statusElementId);
        if (this.statusElement) {
            this.statusIcon = this.statusElement.querySelector('.material-icons');
            this.statusText = this.statusElement.querySelector('.status-text');
        }

        // Initial status update
        this.updateNetworkStatus();
    }

    /**
     * Set up event listeners for network changes
     */
    initializeEventListeners() {
        // Listen for network connection changes
        if ('connection' in navigator) {
            navigator.connection.addEventListener('change', () => {
                this.updateNetworkStatus();
                this.notifyCallbacks();
            });
        }

        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.updateNetworkStatus();
            this.notifyCallbacks();
        });

        window.addEventListener('offline', () => {
            this.updateNetworkStatus();
            this.notifyCallbacks();
        });
    }

    /**
     * Update the network status display
     */
    updateNetworkStatus() {
        if (!this.statusElement) return;

        const connection = navigator.connection;

        if (navigator.onLine) {
            this.statusIcon.textContent = 'wifi';
            this.statusText.textContent = connection ?
                `${connection.effectiveType.toUpperCase()}` : 'Online';
            this.statusElement.style.color = 'var(--md-sys-color-primary)';
        } else {
            this.statusIcon.textContent = 'wifi_off';
            this.statusText.textContent = 'Offline';
            this.statusElement.style.color = 'var(--md-sys-color-error)';
        }
    }

    /**
     * Get detailed network information
     * @returns {Object} Network information object
     */
    getNetworkInfo() {
        const connection = navigator.connection;
        return {
            online: navigator.onLine,
            effectiveType: connection ? connection.effectiveType : 'unknown',
            downlink: connection ? connection.downlink : null,
            rtt: connection ? connection.rtt : null,
            saveData: connection ? connection.saveData : false,
            type: connection ? connection.type : 'unknown'
        };
    }

    /**
     * Get a formatted network status string for display
     * @returns {string} Formatted network status
     */
    getNetworkStatusText() {
        const network = this.getNetworkInfo();
        let text = `📶 ${network.online ? 'Online' : 'Offline'}`;

        if (network.effectiveType && network.effectiveType !== 'unknown') {
            text += ` (${network.effectiveType.toUpperCase()})`;
        }

        return text;
    }

    /**
     * Check if the device is online
     * @returns {boolean} True if online
     */
    isOnline() {
        return navigator.onLine;
    }

    /**
     * Check if the connection is slow (2G or slow-2g)
     * @returns {boolean} True if connection is slow
     */
    isSlowConnection() {
        const connection = navigator.connection;
        if (!connection) return false;

        return connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g';
    }

    /**
     * Check if data saver mode is enabled
     * @returns {boolean} True if data saver is enabled
     */
    isDataSaverEnabled() {
        const connection = navigator.connection;
        return connection ? connection.saveData : false;
    }

    /**
     * Get connection quality estimate
     * @returns {string} 'excellent', 'good', 'fair', or 'poor'
     */
    getConnectionQuality() {
        const connection = navigator.connection;
        if (!connection || !navigator.onLine) return 'poor';

        switch (connection.effectiveType) {
            case '4g':
                return 'excellent';
            case '3g':
                return 'good';
            case '2g':
                return 'fair';
            case 'slow-2g':
                return 'poor';
            default:
                return 'fair';
        }
    }

    /**
     * Register a callback for network status changes
     * @param {Function} callback - Function to call when network status changes
     */
    addStatusChangeCallback(callback) {
        this.callbacks.push(callback);
    }

    /**
     * Remove a status change callback
     * @param {Function} callback - Function to remove
     */
    removeStatusChangeCallback(callback) {
        const index = this.callbacks.indexOf(callback);
        if (index > -1) {
            this.callbacks.splice(index, 1);
        }
    }

    /**
     * Notify all registered callbacks of network status changes
     */
    notifyCallbacks() {
        const networkInfo = this.getNetworkInfo();
        this.callbacks.forEach(callback => {
            try {
                callback(networkInfo);
            } catch (error) {
                console.error('Error in network status callback:', error);
            }
        });
    }

    /**
     * Get network performance metrics
     * @returns {Object} Performance metrics
     */
    getPerformanceMetrics() {
        const connection = navigator.connection;
        if (!connection) return null;

        return {
            downlink: connection.downlink, // Mbps
            rtt: connection.rtt, // milliseconds
            effectiveType: connection.effectiveType,
            saveData: connection.saveData
        };
    }
}

// Create a singleton instance
const networkManager = new NetworkManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = networkManager;
} else {
    window.networkManager = networkManager;
}