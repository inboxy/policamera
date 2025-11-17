/**
 * GPS Manager for PoliCamera
 * Handles geolocation tracking and display
 */
class GPSManager {
    constructor() {
        this.isWatching = false;
        this.watchId = null;
        this.currentPosition = null;
        this.isMinimized = false;
        this.updateInterval = null;
        this.callbacks = [];

        // DOM elements
        this.elements = {
            // Hidden data elements
            latitude: null,
            longitude: null,
            altitude: null,
            accuracy: null,
            // Display elements
            gpsLatDisplay: null,
            gpsLonDisplay: null,
            gpsUserIdDisplay: null,
            gpsAltDisplay: null,
            gpsAccDisplay: null,
            gpsTimeDisplay: null,
            gpsHeadingDisplay: null,
            gpsNetworkDisplay: null,
            gpsVersionDisplay: null,
            gpsOverlay: null,
            gpsToggle: null,
            // Orientation elements
            alpha: null,
            beta: null,
            gamma: null
        };
    }

    /**
     * Initialize GPS manager with DOM elements
     * @param {Object} elementIds - Object containing element IDs
     */
    initialize(elementIds) {
        // Bind DOM elements
        Object.keys(this.elements).forEach(key => {
            const elementId = elementIds[key];
            if (elementId) {
                this.elements[key] = document.getElementById(elementId);
            }
        });

        // Setup toggle button
        if (this.elements.gpsToggle) {
            this.elements.gpsToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleOverlay();
            });
        }

        // Start display updates
        this.startDisplayUpdates();
    }

    /**
     * Start watching GPS position
     * @returns {Promise<boolean>} Success status
     */
    async start() {
        if (!navigator.geolocation) {
            throw new Error('Geolocation not supported');
        }

        return new Promise((resolve, reject) => {
            const options = {
                enableHighAccuracy: AppConstants.GPS.ENABLE_HIGH_ACCURACY,
                timeout: AppConstants.GPS.TIMEOUT,
                maximumAge: AppConstants.GPS.MAXIMUM_AGE
            };

            // Start watching location
            this.watchId = navigator.geolocation.watchPosition(
                (position) => {
                    this.handlePosition(position);
                    if (!this.isWatching) {
                        this.isWatching = true;
                        resolve(true);
                    }
                },
                (error) => {
                    if (!this.isWatching) {
                        reject(new Error(this.getErrorMessage(error)));
                    }
                },
                options
            );

            // Also try to get immediate position
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.handlePosition(position);
                    if (!this.isWatching) {
                        this.isWatching = true;
                        resolve(true);
                    }
                },
                () => {}, // Ignore errors here, watchPosition will handle them
                options
            );
        });
    }

    /**
     * Stop watching GPS position
     */
    stop() {
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
        this.isWatching = false;

        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * Handle position update
     * @param {GeolocationPosition} position
     * @private
     */
    handlePosition(position) {
        this.currentPosition = position;
        const { latitude, longitude, altitude, accuracy } = position.coords;

        // Update hidden data elements
        if (this.elements.latitude) {
            this.elements.latitude.textContent = latitude.toFixed(6);
        }
        if (this.elements.longitude) {
            this.elements.longitude.textContent = longitude.toFixed(6);
        }
        if (this.elements.altitude) {
            this.elements.altitude.textContent = altitude ? `${Math.round(altitude)} m` : '-- m';
        }
        if (this.elements.accuracy) {
            this.elements.accuracy.textContent = `${Math.round(accuracy)} m`;
        }

        // Update display
        this.updateDisplay();

        // Notify callbacks
        this.notifyCallbacks(position);
    }

    /**
     * Update GPS display elements
     */
    updateDisplay() {
        if (!this.elements.latitude) return;

        // Update coordinates
        if (this.elements.gpsLatDisplay) {
            this.elements.gpsLatDisplay.textContent = this.elements.latitude.textContent;
        }
        if (this.elements.gpsLonDisplay) {
            this.elements.gpsLonDisplay.textContent = this.elements.longitude.textContent;
        }
        if (this.elements.gpsAltDisplay) {
            this.elements.gpsAltDisplay.textContent = this.elements.altitude.textContent;
        }
        if (this.elements.gpsAccDisplay) {
            this.elements.gpsAccDisplay.textContent = this.elements.accuracy.textContent;
        }

        // Update time
        if (this.elements.gpsTimeDisplay) {
            const now = new Date();
            this.elements.gpsTimeDisplay.textContent = now.toLocaleTimeString();
        }

        // Update heading (from orientation)
        if (this.elements.gpsHeadingDisplay && this.elements.alpha) {
            this.elements.gpsHeadingDisplay.textContent = this.elements.alpha.textContent;
        }

        // Update network status
        if (this.elements.gpsNetworkDisplay && window.networkManager) {
            const networkInfo = networkManager.getNetworkInfo();
            const networkText = networkInfo.online ?
                (networkInfo.effectiveType ? networkInfo.effectiveType.toUpperCase() : 'ONLINE') :
                'OFFLINE';
            this.elements.gpsNetworkDisplay.textContent = networkText;
        }
    }

    /**
     * Start periodic display updates
     */
    startDisplayUpdates() {
        // Initial update
        this.updateDisplay();

        // Update every 500ms for real-time display
        this.updateInterval = setInterval(() => {
            this.updateDisplay();
        }, AppConstants.GPS.UPDATE_INTERVAL);
    }

    /**
     * Toggle GPS overlay (minimize/maximize)
     */
    toggleOverlay() {
        this.isMinimized = !this.isMinimized;

        if (this.elements.gpsOverlay) {
            if (this.isMinimized) {
                this.elements.gpsOverlay.classList.add('minimized');
            } else {
                this.elements.gpsOverlay.classList.remove('minimized');
            }
        }
    }

    /**
     * Get current location data
     * @returns {Object} Current location data
     */
    getCurrentLocation() {
        if (!this.elements.latitude) {
            return {
                latitude: '--',
                longitude: '--',
                altitude: '-- m',
                accuracy: '-- m'
            };
        }

        return {
            latitude: this.elements.latitude.textContent,
            longitude: this.elements.longitude.textContent,
            altitude: this.elements.altitude.textContent,
            accuracy: this.elements.accuracy.textContent
        };
    }

    /**
     * Get current orientation data
     * @returns {Object} Current orientation data
     */
    getCurrentOrientation() {
        if (!this.elements.alpha) {
            return {
                alpha: '0°',
                beta: '0°',
                gamma: '0°'
            };
        }

        return {
            alpha: this.elements.alpha.textContent,
            beta: this.elements.beta.textContent,
            gamma: this.elements.gamma.textContent
        };
    }

    /**
     * Parse altitude from text
     * @param {string} altText - Altitude text (e.g., "123 m")
     * @returns {number|null} Parsed altitude or null
     */
    static parseAltitude(altText) {
        if (altText === '-- m') return null;
        const match = altText.match(/^(\d+)/);
        return match ? parseInt(match[1]) : null;
    }

    /**
     * Parse accuracy from text
     * @param {string} accText - Accuracy text (e.g., "10 m")
     * @returns {number|null} Parsed accuracy or null
     */
    static parseAccuracy(accText) {
        if (accText === '-- m') return null;
        const match = accText.match(/^(\d+)/);
        return match ? parseInt(match[1]) : null;
    }

    /**
     * Parse heading from text
     * @param {string} headingText - Heading text (e.g., "123°")
     * @returns {number|null} Parsed heading or null
     */
    static parseHeading(headingText) {
        if (headingText === '0°') return null;
        const match = headingText.match(/^(\d+)/);
        return match ? parseInt(match[1]) : null;
    }

    /**
     * Check if GPS coordinates are available
     * @returns {boolean} True if coordinates available
     */
    hasValidCoordinates() {
        const location = this.getCurrentLocation();
        return location.latitude !== '--' && location.longitude !== '--';
    }

    /**
     * Get location error message if coordinates not available
     * @returns {string|null} Error message or null
     */
    getLocationError() {
        return this.hasValidCoordinates() ? null : 'GPS coordinates not available';
    }

    /**
     * Get error message from GeolocationPositionError
     * @param {GeolocationPositionError} error
     * @returns {string} Error message
     * @private
     */
    getErrorMessage(error) {
        switch (error.code) {
            case error.PERMISSION_DENIED:
                return 'Permission denied';
            case error.POSITION_UNAVAILABLE:
                return 'Position unavailable';
            case error.TIMEOUT:
                return 'Request timeout';
            default:
                return 'Unknown error';
        }
    }

    /**
     * Register a callback for position updates
     * @param {Function} callback - Function to call on position update
     */
    addPositionCallback(callback) {
        this.callbacks.push(callback);
    }

    /**
     * Remove a position update callback
     * @param {Function} callback - Function to remove
     */
    removePositionCallback(callback) {
        const index = this.callbacks.indexOf(callback);
        if (index > -1) {
            this.callbacks.splice(index, 1);
        }
    }

    /**
     * Notify all registered callbacks
     * @param {GeolocationPosition} position
     * @private
     */
    notifyCallbacks(position) {
        this.callbacks.forEach(callback => {
            try {
                callback(position);
            } catch (error) {
                console.error('Error in GPS callback:', error);
            }
        });
    }

    /**
     * Update user ID display
     * @param {string} userId - User ID to display
     */
    setUserId(userId) {
        if (this.elements.gpsUserIdDisplay) {
            this.elements.gpsUserIdDisplay.textContent = userId || '--';
        }
    }

    /**
     * Update app version display
     * @param {string} version - App version to display
     */
    setVersion(version) {
        if (this.elements.gpsVersionDisplay) {
            this.elements.gpsVersionDisplay.textContent = version || '--';
        }
    }

    /**
     * Update orientation data (called from device orientation events)
     * @param {DeviceOrientationEvent} event
     */
    updateOrientation(event) {
        const alpha = event.alpha ? Math.round(event.alpha) : 0;
        const beta = event.beta ? Math.round(event.beta) : 0;
        const gamma = event.gamma ? Math.round(event.gamma) : 0;

        if (this.elements.alpha) {
            this.elements.alpha.textContent = `${alpha}°`;
        }
        if (this.elements.beta) {
            this.elements.beta.textContent = `${beta}°`;
        }
        if (this.elements.gamma) {
            this.elements.gamma.textContent = `${gamma}°`;
        }

        // Update display
        this.updateDisplay();
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.stop();
        this.callbacks = [];
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GPSManager;
} else {
    window.GPSManager = GPSManager;
}
