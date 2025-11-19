/**
 * Camera Manager for PoliCamera
 * Handles camera initialization, switching, and stream management
 */
class CameraManager {
    constructor() {
        this.stream = null;
        this.videoElement = null;
        this.currentFacingMode = 'environment'; // Default to back camera
        this.isInitialized = false;
        this.permissionState = null;

        // Camera constraints
        this.constraints = {
            video: {
                facingMode: this.currentFacingMode,
                width: { ideal: AppConstants.CAMERA.IDEAL_WIDTH },
                height: { ideal: AppConstants.CAMERA.IDEAL_HEIGHT }
            }
        };
    }

    /**
     * Initialize camera with given video element
     * @param {HTMLVideoElement} videoElement - Video element to attach stream
     * @returns {Promise<boolean>} True if successful
     */
    async initialize(videoElement) {
        if (!videoElement) {
            throw new Error('Video element is required');
        }

        this.videoElement = videoElement;

        // Check if camera is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera API not supported in this browser');
        }

        try {
            // Request camera permission and start stream
            await this.startCamera();

            // Set up permission monitoring
            await this.setupPermissionMonitoring();

            this.isInitialized = true;
            console.log('✅ Camera Manager initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize camera:', error);
            throw error;
        }
    }

    /**
     * Start camera stream
     * @returns {Promise<MediaStream>}
     */
    async startCamera() {
        try {
            // Stop existing stream if any
            this.stopCamera();

            // Update constraints with current facing mode
            this.constraints.video.facingMode = this.currentFacingMode;

            // Get user media
            this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);

            // Attach to video element
            if (this.videoElement) {
                this.videoElement.srcObject = this.stream;
            }

            console.log(`✅ Camera started (facing: ${this.currentFacingMode})`);
            return this.stream;
        } catch (error) {
            console.error('❌ Failed to start camera:', error);

            // Provide user-friendly error messages
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                throw new Error('Camera permission denied. Please allow camera access.');
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                throw new Error('No camera found on this device.');
            } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                throw new Error('Camera is already in use by another application.');
            } else {
                throw new Error(`Camera error: ${error.message}`);
            }
        }
    }

    /**
     * Stop camera stream
     */
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
                console.log('🛑 Camera track stopped');
            });
            this.stream = null;

            if (this.videoElement) {
                this.videoElement.srcObject = null;
            }
        }
    }

    /**
     * Switch between front and back cameras
     * @returns {Promise<void>}
     */
    async switchCamera() {
        try {
            // Toggle facing mode
            this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';

            console.log(`🔄 Switching to ${this.currentFacingMode} camera...`);

            // Restart camera with new facing mode
            await this.startCamera();

            console.log(`✅ Switched to ${this.currentFacingMode} camera`);
        } catch (error) {
            console.error('❌ Failed to switch camera:', error);
            // Revert facing mode on error
            this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
            throw error;
        }
    }

    /**
     * Get available camera devices
     * @returns {Promise<Array<MediaDeviceInfo>>}
     */
    async getCameraDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter(device => device.kind === 'videoinput');
        } catch (error) {
            console.error('Failed to enumerate camera devices:', error);
            return [];
        }
    }

    /**
     * Check if multiple cameras are available
     * @returns {Promise<boolean>}
     */
    async hasMultipleCameras() {
        const cameras = await this.getCameraDevices();
        return cameras.length > 1;
    }

    /**
     * Set up permission monitoring
     * @returns {Promise<void>}
     */
    async setupPermissionMonitoring() {
        try {
            if ('permissions' in navigator) {
                const permission = await navigator.permissions.query({ name: 'camera' });
                this.permissionState = permission.state;

                permission.onchange = () => {
                    const oldState = this.permissionState;
                    this.permissionState = permission.state;

                    console.log(`Camera permission changed: ${oldState} -> ${this.permissionState}`);

                    // Emit custom event for permission changes
                    const event = new CustomEvent('camerapermissionchange', {
                        detail: {
                            oldState,
                            newState: this.permissionState
                        }
                    });
                    window.dispatchEvent(event);
                };

                console.log(`Camera permission state: ${this.permissionState}`);
            }
        } catch (error) {
            console.warn('Could not set up camera permission monitoring:', error);
        }
    }

    /**
     * Get current camera stream
     * @returns {MediaStream|null}
     */
    getStream() {
        return this.stream;
    }

    /**
     * Get current facing mode
     * @returns {string}
     */
    getFacingMode() {
        return this.currentFacingMode;
    }

    /**
     * Check if camera is active
     * @returns {boolean}
     */
    isActive() {
        return this.stream !== null && this.stream.active;
    }

    /**
     * Get video track settings
     * @returns {Object|null}
     */
    getVideoSettings() {
        if (!this.stream) return null;

        const videoTrack = this.stream.getVideoTracks()[0];
        if (!videoTrack) return null;

        return videoTrack.getSettings();
    }

    /**
     * Get current resolution
     * @returns {Object|null} Object with width and height
     */
    getResolution() {
        const settings = this.getVideoSettings();
        if (!settings) return null;

        return {
            width: settings.width,
            height: settings.height
        };
    }

    /**
     * Capture photo from current stream
     * @param {number} quality - JPEG quality (0-1)
     * @returns {Promise<string>} Data URL of captured image
     */
    async capturePhoto(quality = AppConstants.CAMERA.IMAGE_QUALITY) {
        if (!this.stream || !this.videoElement) {
            throw new Error('Camera not initialized');
        }

        try {
            // Create canvas for capture
            const canvas = document.createElement('canvas');
            canvas.width = this.videoElement.videoWidth;
            canvas.height = this.videoElement.videoHeight;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);

            // Convert to data URL
            const dataUrl = canvas.toDataURL(AppConstants.CAMERA.IMAGE_FORMAT, quality);

            return dataUrl;
        } catch (error) {
            console.error('Failed to capture photo:', error);
            throw error;
        }
    }

    /**
     * Apply camera constraints
     * @param {Object} constraints - New constraints to apply
     * @returns {Promise<void>}
     */
    async applyConstraints(constraints) {
        if (!this.stream) {
            throw new Error('Camera not started');
        }

        try {
            const videoTrack = this.stream.getVideoTracks()[0];
            if (videoTrack) {
                await videoTrack.applyConstraints(constraints);
                console.log('✅ Camera constraints applied:', constraints);
            }
        } catch (error) {
            console.error('Failed to apply constraints:', error);
            throw error;
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.stopCamera();
        this.videoElement = null;
        this.isInitialized = false;
        console.log('🧹 Camera Manager cleaned up');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CameraManager;
} else {
    window.CameraManager = CameraManager;
}
