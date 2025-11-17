class PoliCameraApp {
    constructor() {
        // Camera & Media
        this.stream = null;
        this.capturedPhotos = [];
        this.selectedPhotos = new Set();
        this.imageStitcher = null;

        // Detection state
        this.detectionInterval = null;
        this.isDetectionRunning = false;
        this.hasLoggedFirstDetection = false;
        this.hasLoggedDetectionError = false;

        // AI features state
        this.isPoseEstimationEnabled = false;
        this.currentPoses = [];
        this.isFaceDetectionEnabled = false;
        this.currentFaces = [];
        this.isDepthPredictionEnabled = false;
        this.currentDepthMap = null;

        // VTT tracking
        this.vttTrack = null;
        this.vttCues = [];
        this.startTime = null;
        this.currentVTTUrl = null;

        // User identification
        this.userId = null;
        this.appVersion = AppConstants.APP_VERSION;

        // GPS Manager (using new refactored class)
        this.gpsManager = new GPSManager();

        // Initialize app
        this.initializeElements();
        this.initializeEventListeners();
        this.initializeServiceWorker();
        this.initializeNetworkStatus();
        this.initializeDeviceOrientation();
        this.initializeWebVTT();
        this.initializeUserId();
        this.initializeDatabase();
        this.initializeStitcher();
        this.initializePullToRefresh();
        this.initializeGPSManager();
        this.loadVersion();

        // Auto-start camera and GPS when page loads
        this.autoStart();
    }

    initializeElements() {
        this.video = document.getElementById('cameraFeed');
        this.canvas = document.getElementById('canvas');
        this.detectionOverlay = document.getElementById('detectionOverlay');
        this.photosGrid = document.getElementById('photosGrid');

        // Dual view elements
        this.dualViewContainer = document.getElementById('dualViewContainer');
        this.cameraContainer = document.getElementById('cameraContainer');
        this.depthContainer = document.getElementById('depthContainer');
        this.depthCanvas = document.getElementById('depthCanvas');

        // FAB elements
        this.startFab = document.getElementById('startFab');
        this.captureFab = document.getElementById('captureFab');
        this.settingsFab = document.getElementById('settingsFab');
        this.qrFab = document.getElementById('qrFab');
        this.poseFab = document.getElementById('poseFab');
        this.faceFab = document.getElementById('faceFab');
        this.depthFab = document.getElementById('depthFab');
        this.photosOverlay = document.getElementById('photosOverlay');
        this.stitchBtn = document.getElementById('stitchBtn');

        // Debug: Check if depth button exists
        if (!this.depthFab) {
            console.error('❌ Depth FAB button not found in DOM!');
        } else {
            console.log('✅ Depth FAB button found:', this.depthFab);
        }

        // Location elements
        this.latitudeEl = document.getElementById('latitude');
        this.longitudeEl = document.getElementById('longitude');
        this.altitudeEl = document.getElementById('altitude');
        this.accuracyEl = document.getElementById('accuracy');

        // Orientation elements
        this.alphaEl = document.getElementById('alpha');
        this.betaEl = document.getElementById('beta');
        this.gammaEl = document.getElementById('gamma');

        // GPS Display elements
        this.gpsLatDisplayEl = document.getElementById('gpsLatDisplay');
        this.gpsLonDisplayEl = document.getElementById('gpsLonDisplay');
        this.gpsUserIdDisplayEl = document.getElementById('gpsUserIdDisplay');
        this.gpsAltDisplayEl = document.getElementById('gpsAltDisplay');
        this.gpsAccDisplayEl = document.getElementById('gpsAccDisplay');
        this.gpsTimeDisplayEl = document.getElementById('gpsTimeDisplay');
        this.gpsHeadingDisplayEl = document.getElementById('gpsHeadingDisplay');
        this.gpsNetworkDisplayEl = document.getElementById('gpsNetworkDisplay');
        this.gpsVersionDisplayEl = document.getElementById('gpsVersionDisplay');
        this.gpsOverlay = document.getElementById('gpsOverlay');
        this.gpsToggle = document.getElementById('gpsToggle');

        // WebVTT elements
        this.positionTrack = document.getElementById('positionTrack');
    }

    initializeEventListeners() {
        this.startFab.addEventListener('click', () => this.startCamera());
        this.captureFab.addEventListener('click', () => this.capturePhoto());
        this.settingsFab.addEventListener('click', () => this.toggleSettings());
        this.qrFab.addEventListener('click', () => this.showQRCode());
        this.poseFab.addEventListener('click', () => this.togglePoseEstimation());
        this.faceFab.addEventListener('click', () => this.toggleFaceDetection());
        this.depthFab.addEventListener('click', () => this.toggleDepthPrediction());
        this.stitchBtn.addEventListener('click', () => this.stitchSelectedPhotos());
        this.gpsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleGPSOverlay();
        });

        // Handle visibility change for camera
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.stream) {
                this.pauseCamera();
            } else if (!document.hidden && this.stream) {
                this.resumeCamera();
            }
        });

        // Handle window resize to update depth canvas dimensions
        window.addEventListener('resize', () => {
            if (this.isDepthPredictionEnabled && depthPredictionManager?.dualViewMode) {
                this.resizeDepthCanvas();
            }
        });
    }

    /**
     * Initialize pull-to-refresh functionality
     */
    initializePullToRefresh() {
        let touchStartY = 0;
        let touchCurrentY = 0;
        let isPulling = false;
        let refreshThreshold = 80;

        // Create refresh indicator element
        const refreshIndicator = document.createElement('div');
        refreshIndicator.id = 'pullToRefreshIndicator';
        refreshIndicator.style.cssText = `
            position: fixed;
            top: 0;
            left: 50%;
            transform: translateX(-50%) translateY(-100px);
            width: 60px;
            height: 60px;
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            transition: transform 0.3s ease, opacity 0.3s ease;
            opacity: 0;
            pointer-events: none;
        `;
        refreshIndicator.innerHTML = `<span class="material-icons" style="font-size: 28px;">refresh</span>`;
        document.body.appendChild(refreshIndicator);

        const main = document.querySelector('.main');
        if (!main) return;

        // Touch start
        main.addEventListener('touchstart', (e) => {
            // Only allow pull-to-refresh at top of page
            if (window.scrollY === 0 && main.scrollTop === 0) {
                touchStartY = e.touches[0].clientY;
            }
        }, { passive: true });

        // Touch move
        main.addEventListener('touchmove', (e) => {
            if (touchStartY === 0) return;

            touchCurrentY = e.touches[0].clientY;
            const pullDistance = touchCurrentY - touchStartY;

            // Only track downward pulls from top
            if (pullDistance > 0 && window.scrollY === 0 && main.scrollTop === 0) {
                isPulling = true;

                // Update indicator position and opacity
                const progress = Math.min(pullDistance / refreshThreshold, 1);
                const translateY = Math.min(pullDistance * 0.5, 100);

                refreshIndicator.style.transform = `translateX(-50%) translateY(${translateY - 100}px) rotate(${progress * 360}deg)`;
                refreshIndicator.style.opacity = progress;

                // Prevent default scrolling behavior when pulling
                if (pullDistance > 10) {
                    e.preventDefault();
                }
            }
        }, { passive: false });

        // Touch end
        main.addEventListener('touchend', (e) => {
            if (!isPulling) {
                touchStartY = 0;
                return;
            }

            const pullDistance = touchCurrentY - touchStartY;

            // Trigger refresh if pulled far enough
            if (pullDistance >= refreshThreshold) {
                this.performRefresh(refreshIndicator);
            } else {
                // Reset indicator
                refreshIndicator.style.transform = 'translateX(-50%) translateY(-100px)';
                refreshIndicator.style.opacity = '0';
            }

            // Reset state
            touchStartY = 0;
            touchCurrentY = 0;
            isPulling = false;
        }, { passive: true });
    }

    /**
     * Perform app refresh
     */
    performRefresh(indicator) {
        // Animate indicator to top center
        indicator.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        indicator.style.transform = 'translateX(-50%) translateY(20px)';
        indicator.style.opacity = '1';

        // Add spinning animation
        indicator.querySelector('.material-icons').style.animation = 'spin 1s linear infinite';

        // Add spin keyframes if not already present
        if (!document.querySelector('#spinKeyframes')) {
            const style = document.createElement('style');
            style.id = 'spinKeyframes';
            style.textContent = `
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        // Show refresh message
        console.log('🔄 Refreshing application...');

        // Perform cleanup before reload
        this.cleanup();

        // Reload after animation
        setTimeout(() => {
            window.location.reload();
        }, 600);
    }

    async initializeServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('sw.js');
                console.log('Service Worker registered:', registration);
            } catch (error) {
                console.warn('Service Worker registration failed:', error);
            }
        }
    }

    initializeNetworkStatus() {
        // Initialize the network manager with our status element
        networkManager.initialize('networkStatusOverlay');
    }


    initializeDeviceOrientation() {
        if ('DeviceOrientationEvent' in window) {
            // Request permission for iOS devices
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                    .then(permission => {
                        if (permission === 'granted') {
                            this.startOrientationListening();
                        }
                    })
                    .catch(console.error);
            } else {
                this.startOrientationListening();
            }
        }
    }

    startOrientationListening() {
        window.addEventListener('deviceorientation', (event) => {
            this.updateOrientation(event);
        });
    }

    /**
     * Update device orientation data
     * @param {DeviceOrientationEvent} event - Orientation event
     */
    updateOrientation(event) {
        // Delegate to GPS Manager
        this.gpsManager.updateOrientation(event);

        // Update VTT cue with orientation data
        this.updateVTTCue();
    }

    initializeWebVTT() {
        // Initialize VTT track
        this.vttTrack = this.positionTrack.track;
        this.vttTrack.mode = 'showing';

        // Create blob URL for VTT content
        this.updateVTTTrack();

        // Start timing for VTT cues
        this.startTime = Date.now();
    }

    /**
     * Initialize GPS Manager
     */
    initializeGPSManager() {
        this.gpsManager.initialize({
            latitude: 'latitude',
            longitude: 'longitude',
            altitude: 'altitude',
            accuracy: 'accuracy',
            alpha: 'alpha',
            beta: 'beta',
            gamma: 'gamma',
            gpsLatDisplay: 'gpsLatDisplay',
            gpsLonDisplay: 'gpsLonDisplay',
            gpsUserIdDisplay: 'gpsUserIdDisplay',
            gpsAltDisplay: 'gpsAltDisplay',
            gpsAccDisplay: 'gpsAccDisplay',
            gpsTimeDisplay: 'gpsTimeDisplay',
            gpsHeadingDisplay: 'gpsHeadingDisplay',
            gpsNetworkDisplay: 'gpsNetworkDisplay',
            gpsVersionDisplay: 'gpsVersionDisplay',
            gpsOverlay: 'gpsOverlay',
            gpsToggle: 'gpsToggle'
        });

        // Set user ID and version
        this.gpsManager.setUserId(this.userId);
        this.gpsManager.setVersion(this.appVersion);

        // Register callback for VTT updates
        this.gpsManager.addPositionCallback(() => {
            this.updateVTTCue();
        });
    }

    /**
     * Initialize user ID from cookie or generate new one
     */
    initializeUserId() {
        // Try to get existing user ID from cookie
        this.userId = Utils.getCookie(AppConstants.USER_ID_COOKIE_NAME);

        if (!this.userId) {
            // Generate new user ID
            this.userId = Utils.generateUserId(AppConstants.USER_ID_LENGTH);

            // Store in cookie
            Utils.setCookie(
                AppConstants.USER_ID_COOKIE_NAME,
                this.userId,
                AppConstants.USER_ID_COOKIE_EXPIRY_DAYS
            );

            console.log('Generated new user ID:', this.userId);
        } else {
            console.log('Found existing user ID:', this.userId);
        }
    }

    /**
     * Get current user ID
     * @returns {string} User ID
     */
    getUserId() {
        return this.userId;
    }

    async initializeDatabase() {
        try {
            await databaseManager.init();
            console.log('Database initialized successfully');
        } catch (error) {
            console.error('Failed to initialize database:', error);
            this.showError('Database initialization failed');
        }
    }

    generateVTTContent() {
        let vttContent = 'WEBVTT\n\n';

        this.vttCues.forEach((cue, index) => {
            vttContent += `${index + 1}\n`;
            vttContent += `${this.formatTime(cue.startTime)} --> ${this.formatTime(cue.endTime)}\n`;
            vttContent += `${cue.text}\n\n`;
        });

        return vttContent;
    }

    /**
     * Format time in WebVTT format
     * @param {number} milliseconds - Time in milliseconds
     * @returns {string} Formatted time string
     */
    formatTime(milliseconds) {
        return Utils.formatVTTTime(milliseconds);
    }

    /**
     * Update WebVTT cue with current position data
     */
    updateVTTCue() {
        if (!this.startTime || !this.stream) return;

        const currentTime = Date.now() - this.startTime;
        const location = this.gpsManager.getCurrentLocation();
        const orientation = this.gpsManager.getCurrentOrientation();
        const network = networkManager.getNetworkInfo();

        // Create cue text with position data using utility function
        const cueText = Utils.formatCueText(location, orientation, network);

        // Add new cue (replace last one if within threshold for faster updates)
        if (this.vttCues.length > 0) {
            const lastCue = this.vttCues[this.vttCues.length - 1];
            if (currentTime - lastCue.startTime < AppConstants.VTT.UPDATE_THRESHOLD) {
                // Update existing cue
                lastCue.endTime = currentTime + AppConstants.VTT.CUE_DURATION;
                lastCue.text = cueText;
            } else {
                // Add new cue
                this.addVTTCue(currentTime, cueText);
            }
        } else {
            // First cue
            this.addVTTCue(currentTime, cueText);
        }

        // Update the track
        this.updateVTTTrack();
    }

    /**
     * Add a new VTT cue
     * @param {number} startTime - Start time in milliseconds
     * @param {string} text - Cue text
     */
    addVTTCue(startTime, text) {
        const cue = {
            startTime: startTime,
            endTime: startTime + AppConstants.VTT.CUE_DURATION,
            text: text
        };

        this.vttCues.push(cue);

        // Keep only last N cues to prevent memory issues
        if (this.vttCues.length > AppConstants.VTT.MAX_CUES) {
            this.vttCues.shift();
        }
    }

    /**
     * Get current location data (deprecated - use gpsManager instead)
     * @deprecated Use gpsManager.getCurrentLocation() instead
     * @returns {Object} Current location data
     */
    getCurrentLocationData() {
        return this.gpsManager.getCurrentLocation();
    }

    /**
     * Get current orientation data (deprecated - use gpsManager instead)
     * @deprecated Use gpsManager.getCurrentOrientation() instead
     * @returns {Object} Current orientation data
     */
    getCurrentOrientationData() {
        return this.gpsManager.getCurrentOrientation();
    }

    /**
     * Get current location (shorthand for getCurrentLocationData)
     * @returns {Object} Current location data
     */
    getCurrentLocation() {
        return this.gpsManager.getCurrentLocation();
    }

    /**
     * Get current orientation (shorthand for getCurrentOrientationData)
     * @returns {Object} Current orientation data
     */
    getCurrentOrientation() {
        return this.gpsManager.getCurrentOrientation();
    }

    updateVTTTrack() {
        const vttContent = this.generateVTTContent();
        const blob = new Blob([vttContent], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);

        // Clean up previous URL
        if (this.currentVTTUrl) {
            URL.revokeObjectURL(this.currentVTTUrl);
        }

        this.positionTrack.src = url;
        this.currentVTTUrl = url;
    }

    /**
     * Auto-start camera and GPS on page load
     */
    async autoStart() {
        // Small delay to ensure DOM is fully ready
        setTimeout(() => {
            this.startCamera();
        }, AppConstants.TIMING.AUTO_START_DELAY);
    }

    async startCamera() {
        try {
            // Update FAB state to show loading
            this.startFab.innerHTML = `<span class="material-icons">hourglass_empty</span>`;
            this.startFab.style.pointerEvents = 'none';

            // Start camera and GPS simultaneously
            const [cameraResult, locationResult] = await Promise.allSettled([
                this.initializeCamera(),
                this.initializeLocation()
            ]);

            // Check results
            let cameraSuccess = cameraResult.status === 'fulfilled';
            let locationSuccess = locationResult.status === 'fulfilled';

            // Update UI based on results
            this.updateStartFabStatus(cameraSuccess, locationSuccess);

            if (cameraSuccess) {
                this.captureFab.style.display = 'flex';
                this.poseFab.style.display = 'flex';
                this.faceFab.style.display = 'flex';
                this.depthFab.style.display = 'flex';
                console.log('✅ All feature buttons displayed (including depth)');

                // Log available managers
                console.log('Available AI managers:', {
                    ai: !!window.aiRecognitionManager,
                    pose: !!window.poseEstimationManager,
                    face: !!window.faceDetectionManager,
                    depth: !!window.depthPredictionManager
                });
            }

            // Show errors if any
            if (!cameraSuccess) {
                this.showError(`Camera: ${cameraResult.reason.message}`);
            }
            if (!locationSuccess) {
                this.showError(`Location: ${locationResult.reason.message}`);
            }

        } catch (error) {
            console.error('Error starting camera and GPS:', error);
            this.showError('Failed to start camera and GPS');
            this.resetStartFab();
        }
    }

    async initializeCamera() {
        const constraints = {
            video: {
                facingMode: 'environment', // Use back camera
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };

        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.video.srcObject = this.stream;

        // Wait for video to be ready and start real-time detection
        this.video.addEventListener('loadedmetadata', () => {
            this.setupDetectionOverlay();
            this.startRealTimeDetection();
        });

        return true;
    }

    /**
     * Initialize location tracking (now uses GPSManager)
     * @returns {Promise<boolean>} Success status
     */
    async initializeLocation() {
        try {
            return await this.gpsManager.start();
        } catch (error) {
            throw error;
        }
    }

    updateStartFabStatus(cameraSuccess, locationSuccess) {
        if (cameraSuccess && locationSuccess) {
            this.startFab.innerHTML = `<span class="material-icons">check_circle</span>`;
            this.startFab.style.backgroundColor = 'var(--md-sys-color-primary)';
        } else if (cameraSuccess) {
            this.startFab.innerHTML = `<span class="material-icons">videocam</span>`;
            this.startFab.style.backgroundColor = 'var(--md-sys-color-secondary-container)';
        } else if (locationSuccess) {
            this.startFab.innerHTML = `<span class="material-icons">location_on</span>`;
            this.startFab.style.backgroundColor = 'var(--md-sys-color-secondary-container)';
        } else {
            this.resetStartFab();
        }
        this.startFab.style.pointerEvents = 'auto';
    }

    resetStartFab() {
        this.startFab.innerHTML = `<span class="material-icons">videocam</span>`;
        this.startFab.style.backgroundColor = '';
        this.startFab.style.pointerEvents = 'auto';
    }

    togglePhotosOverlay() {
        if (this.photosOverlay.style.display === 'none') {
            this.photosOverlay.style.display = 'block';
        } else {
            this.photosOverlay.style.display = 'none';
        }
    }

    toggleSettings() {
        // For now, just show an alert - settings panel can be implemented later
        alert('Settings panel - coming soon!\n\nFeatures to be added:\n• Camera resolution settings\n• GPS update frequency\n• Data export options\n• Theme selection');
    }

    showQRCode() {
        qrCodeManager.showQRCode();
    }

    async togglePoseEstimation() {
        if (!window.poseEstimationManager) {
            this.showError('Pose estimation not available');
            return;
        }

        try {
            const isEnabled = await poseEstimationManager.toggle();
            this.isPoseEstimationEnabled = isEnabled;

            // Update button styling
            if (isEnabled) {
                this.poseFab.classList.add('active');
                this.showToast('Pose estimation enabled', 'accessibility_new');
            } else {
                this.poseFab.classList.remove('active');
                this.showToast('Pose estimation disabled', 'accessibility_new');
            }
        } catch (error) {
            console.error('Failed to toggle pose estimation:', error);
            this.showError('Failed to initialize pose estimation');
        }
    }

    async toggleFaceDetection() {
        if (!window.faceDetectionManager) {
            this.showError('Face detection not available');
            return;
        }

        try {
            const isEnabled = await faceDetectionManager.toggle();
            this.isFaceDetectionEnabled = isEnabled;

            // Update button styling
            if (isEnabled) {
                this.faceFab.classList.add('active');
                this.showToast('Face detection enabled', 'face');
            } else {
                this.faceFab.classList.remove('active');
                this.showToast('Face detection disabled', 'face');
            }
        } catch (error) {
            console.error('Failed to toggle face detection:', error);
            this.showError('Failed to initialize face detection');
        }
    }

    async toggleDepthPrediction() {
        console.log('🌊 Toggle depth prediction clicked');

        if (!window.depthPredictionManager) {
            console.error('❌ Depth prediction manager not available');
            this.showError('Depth prediction not available - manager not loaded');
            return;
        }

        try {
            console.log('Initializing depth prediction...');
            const isEnabled = await depthPredictionManager.toggle();
            this.isDepthPredictionEnabled = isEnabled;

            console.log('Depth prediction toggled:', isEnabled ? 'ON' : 'OFF');

            // Enable/disable picture-in-picture mode
            if (isEnabled) {
                // Enable PiP mode (depth overlay in top left)
                depthPredictionManager.pipMode = true;

                // Update button styling
                this.depthFab.classList.add('active');
                this.showToast('Depth PiP enabled - White=Near, Black=Far', 'layers');
            } else {
                // Disable PiP mode
                depthPredictionManager.pipMode = false;

                // Update button styling
                this.depthFab.classList.remove('active');
                this.showToast('Depth estimation disabled', 'layers');
            }
        } catch (error) {
            console.error('❌ Failed to toggle depth prediction:', error);
            this.showError('Failed to initialize depth prediction: ' + error.message);
        }
    }

    /**
     * Resize depth canvas to match its container dimensions
     */
    resizeDepthCanvas() {
        if (!this.depthCanvas || !this.depthContainer) return;

        const rect = this.depthContainer.getBoundingClientRect();
        this.depthCanvas.width = rect.width;
        this.depthCanvas.height = rect.height;

        console.log(`📐 Depth canvas resized to ${rect.width}x${rect.height}`);
    }

    /**
     * Toggle GPS overlay (minimize/maximize) - delegated to GPS Manager
     */
    toggleGPSOverlay() {
        this.gpsManager.toggleOverlay();
    }

    pauseCamera() {
        if (this.video.srcObject) {
            this.video.pause();
        }
    }

    resumeCamera() {
        if (this.video.srcObject) {
            this.video.play();
        }
    }

    async capturePhoto() {
        if (!this.stream) return;

        const canvas = this.canvas;
        const context = canvas.getContext('2d');

        // Set canvas size to match video
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;

        // Draw video frame to canvas
        context.drawImage(this.video, 0, 0);

        // Get image data
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);

        // Run AI analysis on the captured image
        let aiAnalysis = null;
        if (window.aiRecognitionManager && aiRecognitionManager.isSupported()) {
            try {
                console.log('Running AI analysis on captured photo...');
                aiAnalysis = await aiRecognitionManager.analyzeImage(canvas);
                console.log('AI Analysis results:', aiAnalysis);
            } catch (error) {
                console.error('AI analysis failed:', error);
            }
        }

        // Run pose estimation on the captured image
        let poseData = null;
        if (this.isPoseEstimationEnabled && window.poseEstimationManager) {
            try {
                console.log('Running pose estimation on captured photo...');
                const poses = await poseEstimationManager.detectPoses(canvas, false);
                poseData = poseEstimationManager.exportPoseData(poses);
                console.log('Pose estimation results:', poseData);
            } catch (error) {
                console.error('Pose estimation failed:', error);
            }
        }

        // Run face detection on the captured image
        let faceData = null;
        if (this.isFaceDetectionEnabled && window.faceDetectionManager) {
            try {
                console.log('Running face detection on captured photo...');
                const faces = await faceDetectionManager.detectFaces(canvas, false);
                faceData = faceDetectionManager.exportFaceData(faces);
                console.log('Face detection results:', faceData);
            } catch (error) {
                console.error('Face detection failed:', error);
            }
        }

        // Run depth prediction on the captured image
        let depthData = null;
        if (this.isDepthPredictionEnabled && window.depthPredictionManager) {
            try {
                console.log('Running depth prediction on captured photo...');
                const depthMap = await depthPredictionManager.predictDepth(canvas, false);
                depthData = await depthPredictionManager.exportDepthData(depthMap);
                console.log('Depth prediction results:', depthData);
                // Dispose depth map after exporting data
                if (depthMap) {
                    depthMap.dispose();
                }
            } catch (error) {
                console.error('Depth prediction failed:', error);
            }
        }

        // Create photo object with metadata
        const photo = {
            id: Date.now(),
            userId: this.userId,
            dataUrl: imageDataUrl,
            timestamp: new Date().toISOString(),
            location: this.getCurrentLocation(),
            orientation: this.getCurrentOrientation(),
            networkInfo: networkManager.getNetworkInfo(),
            aiAnalysis: aiAnalysis,
            poseData: poseData,
            faceData: faceData,
            depthData: depthData
        };

        this.capturedPhotos.push(photo);
        this.displayPhoto(photo);
        this.savePhotoToStorage(photo);

        // Store in IndexedDB
        this.savePhotoToDatabase(photo);

        // Show capture feedback
        this.showCaptureEffect();
    }

    getCurrentLocation() {
        return {
            latitude: this.latitudeEl.textContent,
            longitude: this.longitudeEl.textContent,
            altitude: this.altitudeEl.textContent,
            accuracy: this.accuracyEl.textContent
        };
    }

    getCurrentOrientation() {
        return {
            alpha: this.alphaEl.textContent,
            beta: this.betaEl.textContent,
            gamma: this.gammaEl.textContent
        };
    }


    /**
     * Show capture flash effect
     */
    showCaptureEffect() {
        UIHelpers.showCaptureEffect();
    }

    displayPhoto(photo) {
        const photoElement = document.createElement('div');
        photoElement.className = 'photo-item';
        photoElement.innerHTML = `
            <div class="photo-selection" data-photo-id="${photo.id}">
                <span class="material-icons photo-tick">check</span>
            </div>
            <img src="${photo.dataUrl}" alt="Captured photo">
            <div class="photo-metadata">
                <div>${new Date(photo.timestamp).toLocaleTimeString()}</div>
                <div>📍 ${photo.location.latitude !== '--' ? 'GPS' : 'No GPS'}</div>
            </div>
        `;

        const selectionDiv = photoElement.querySelector('.photo-selection');
        const img = photoElement.querySelector('img');

        selectionDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.selectedPhotos.has(photo)) {
                this.selectedPhotos.delete(photo);
                photoElement.classList.remove('selected');
            } else {
                this.selectedPhotos.add(photo);
                photoElement.classList.add('selected');
            }
            this.updateStitchButton();
        });

        img.addEventListener('click', () => {
            this.showPhotoDetails(photo);
        });

        this.photosGrid.appendChild(photoElement);
    }

    showPhotoDetails(photo) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: var(--md-sys-color-surface-container);
            border-radius: 12px;
            padding: 20px;
            max-width: 90%;
            max-height: 90%;
            overflow-y: auto;
            color: var(--md-sys-color-on-surface);
        `;

        const title = document.createElement('h3');
        title.textContent = 'Photo Details';
        title.style.cssText = 'margin-bottom: 16px; color: var(--md-sys-color-primary);';

        const img = document.createElement('img');
        img.src = photo.dataUrl;
        img.alt = 'Captured photo';
        img.style.cssText = 'width: 100%; max-width: 400px; border-radius: 8px; margin-bottom: 16px;';

        const details = document.createElement('div');
        details.style.cssText = 'display: grid; gap: 8px; font-size: 14px;';

        // Basic metadata
        const basicInfo = `
            <div><strong>User ID:</strong> ${this.escapeHtml(photo.userId || 'Unknown')}</div>
            <div><strong>Timestamp:</strong> ${new Date(photo.timestamp).toLocaleString()}</div>
            <div><strong>Location:</strong> ${this.escapeHtml(photo.location.latitude)}, ${this.escapeHtml(photo.location.longitude)}</div>
            <div><strong>Altitude:</strong> ${this.escapeHtml(photo.location.altitude)}</div>
            <div><strong>Accuracy:</strong> ${this.escapeHtml(photo.location.accuracy)}</div>
            <div><strong>Orientation:</strong> α${this.escapeHtml(photo.orientation.alpha)} β${this.escapeHtml(photo.orientation.beta)} γ${this.escapeHtml(photo.orientation.gamma)}</div>
            <div><strong>Network:</strong> ${photo.networkInfo.online ? 'Online' : 'Offline'} (${this.escapeHtml(photo.networkInfo.effectiveType)})</div>
        `;

        // AI analysis section
        let aiInfo = '';
        if (photo.aiAnalysis) {
            if (photo.aiAnalysis.success && photo.aiAnalysis.detections.length > 0) {
                aiInfo = `
                    <hr style="margin: 16px 0; border: 1px solid var(--md-sys-color-outline-variant);">
                    <div><strong>🤖 AI Analysis:</strong></div>
                    <div style="margin-left: 16px;">
                        <div><strong>Summary:</strong> ${this.escapeHtml(photo.aiAnalysis.summary)}</div>
                        <div><strong>Objects Found:</strong> ${photo.aiAnalysis.detections.length}</div>
                        <div style="margin-top: 8px;">
                `;

                photo.aiAnalysis.detections.forEach((detection, index) => {
                    aiInfo += `
                        <div style="margin: 4px 0; padding: 4px 8px; background: var(--md-sys-color-surface-variant); border-radius: 4px;">
                            <strong>${this.escapeHtml(detection.class)}</strong> (${detection.confidence}% confidence)
                        </div>
                    `;
                });

                aiInfo += `
                        </div>
                    </div>
                `;
            } else if (photo.aiAnalysis.success) {
                aiInfo = `
                    <hr style="margin: 16px 0; border: 1px solid var(--md-sys-color-outline-variant);">
                    <div><strong>🤖 AI Analysis:</strong> No objects detected</div>
                `;
            } else {
                aiInfo = `
                    <hr style="margin: 16px 0; border: 1px solid var(--md-sys-color-outline-variant);">
                    <div><strong>🤖 AI Analysis:</strong> Analysis failed</div>
                `;
            }
        }

        // Pose estimation section
        let poseInfo = '';
        if (photo.poseData) {
            if (photo.poseData.poseCount > 0) {
                poseInfo = `
                    <hr style="margin: 16px 0; border: 1px solid var(--md-sys-color-outline-variant);">
                    <div><strong>🏃 Pose Estimation:</strong></div>
                    <div style="margin-left: 16px;">
                        <div><strong>People Detected:</strong> ${photo.poseData.poseCount}</div>
                        <div style="margin-top: 8px;">
                `;

                photo.poseData.poses.forEach((pose, index) => {
                    const keypointCount = pose.keypoints.length;
                    poseInfo += `
                        <div style="margin: 8px 0; padding: 8px; background: var(--md-sys-color-surface-variant); border-radius: 4px;">
                            <strong>Person ${index + 1}</strong> (${Math.round(pose.score * 100)}% confidence)<br>
                            <span style="font-size: 12px;">Keypoints detected: ${keypointCount}</span>
                        </div>
                    `;
                });

                poseInfo += `
                        </div>
                    </div>
                `;
            } else {
                poseInfo = `
                    <hr style="margin: 16px 0; border: 1px solid var(--md-sys-color-outline-variant);">
                    <div><strong>🏃 Pose Estimation:</strong> No people detected</div>
                `;
            }
        }

        // Face detection section
        let faceInfo = '';
        if (photo.faceData) {
            if (photo.faceData.faceCount > 0) {
                faceInfo = `
                    <hr style="margin: 16px 0; border: 1px solid var(--md-sys-color-outline-variant);">
                    <div><strong>👤 Face Detection:</strong></div>
                    <div style="margin-left: 16px;">
                        <div><strong>Faces Detected:</strong> ${photo.faceData.faceCount}</div>
                        <div style="margin-top: 8px;">
                `;

                photo.faceData.faces.forEach((face, index) => {
                    const landmarkCount = face.landmarks.length;
                    faceInfo += `
                        <div style="margin: 8px 0; padding: 8px; background: var(--md-sys-color-surface-variant); border-radius: 4px;">
                            <strong>Face ${index + 1}</strong> (${Math.round(face.score * 100)}% confidence)<br>
                            <span style="font-size: 12px;">Landmarks detected: ${landmarkCount}</span>
                        </div>
                    `;
                });

                faceInfo += `
                        </div>
                    </div>
                `;
            } else {
                faceInfo = `
                    <hr style="margin: 16px 0; border: 1px solid var(--md-sys-color-outline-variant);">
                    <div><strong>👤 Face Detection:</strong> No faces detected</div>
                `;
            }
        }

        // Depth prediction section
        let depthInfo = '';
        if (photo.depthData) {
            depthInfo = `
                <hr style="margin: 16px 0; border: 1px solid var(--md-sys-color-outline-variant);">
                <div><strong>🌊 Depth Prediction:</strong></div>
                <div style="margin-left: 16px;">
                    <div><strong>Average Depth:</strong> ${photo.depthData.average.toFixed(2)}</div>
                    <div><strong>Depth Range:</strong> ${photo.depthData.min.toFixed(2)} - ${photo.depthData.max.toFixed(2)}</div>
                    <div><strong>Color Mode:</strong> ${photo.depthData.colorMode}</div>
                </div>
            `;
        }

        details.innerHTML = basicInfo + aiInfo + poseInfo + faceInfo + depthInfo;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = `
            margin-top: 16px;
            padding: 8px 16px;
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
            border: none;
            border-radius: 20px;
            cursor: pointer;
        `;
        closeBtn.addEventListener('click', () => modal.remove());

        modalContent.appendChild(title);
        modalContent.appendChild(img);
        modalContent.appendChild(details);
        modalContent.appendChild(closeBtn);
        modal.appendChild(modalContent);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        document.body.appendChild(modal);
    }


    /**
     * Update location (deprecated - handled by GPS Manager)
     * @deprecated Location updates are now handled by GPSManager
     * @param {GeolocationPosition} position - Position data
     */
    updateLocation(position) {
        // This is now handled by GPSManager
        // Kept for backward compatibility
        console.warn('updateLocation is deprecated. GPSManager handles this now.');
    }

    /**
     * Update GPS display (deprecated - handled by GPS Manager)
     * @deprecated GPS display updates are now handled by GPSManager
     */
    updateGPSDisplay() {
        // This is now handled by GPSManager
        // Kept for backward compatibility
        console.warn('updateGPSDisplay is deprecated. GPSManager handles this now.');
    }

    /**
     * Load version from manifest
     */
    async loadVersion() {
        try {
            const manifest = await Utils.loadManifest();
            if (manifest && manifest.version) {
                this.appVersion = manifest.version;
                this.gpsManager.setVersion(this.appVersion);
                console.log('📱 PoliCamera version:', this.appVersion);
            }
        } catch (error) {
            console.warn('Failed to load version from manifest:', error);
            // Keep default version
        }
    }

    savePhotoToStorage(photo) {
        try {
            const stored = localStorage.getItem('policamera-photos');
            const photos = stored ? JSON.parse(stored) : [];
            photos.push({
                ...photo,
                dataUrl: null // Don't store large image data in localStorage
            });
            localStorage.setItem('policamera-photos', JSON.stringify(photos));
        } catch (error) {
            console.warn('Failed to save photo metadata to storage:', error);
        }
    }

    async savePhotoToDatabase(photo) {
        try {
            const imageName = `photo_${photo.id}_${this.userId}.jpg`;

            const photoData = {
                userId: photo.userId,
                location: photo.location,
                error: this.getLocationError(),
                imageName: imageName,
                imageData: photo.dataUrl,
                orientation: photo.orientation,
                networkInfo: photo.networkInfo
            };

            const recordId = await databaseManager.storePhoto(photoData);
            console.log('Photo stored in database with ID:', recordId);

            // Also log GPS coordinates
            await this.saveGPSLogToDatabase();

        } catch (error) {
            console.error('Failed to save photo to database:', error);
            this.showError('Failed to save photo data');
        }
    }

    /**
     * Save GPS log to database
     */
    async saveGPSLogToDatabase() {
        try {
            const location = this.gpsManager.getCurrentLocation();

            const gpsData = {
                userId: this.userId,
                lat: parseFloat(location.latitude) || null,
                lon: parseFloat(location.longitude) || null,
                alt: GPSManager.parseAltitude(location.altitude),
                accuracy: GPSManager.parseAccuracy(location.accuracy),
                error: this.gpsManager.getLocationError(),
                heading: GPSManager.parseHeading(this.gpsManager.getCurrentOrientation().alpha)
            };

            await databaseManager.storeGPSLog(gpsData);
        } catch (error) {
            console.error('Failed to save GPS log to database:', error);
        }
    }

    loadPhotosFromStorage() {
        try {
            const stored = localStorage.getItem('policamera-photos');
            if (stored) {
                const photos = JSON.parse(stored);
                // Note: This would only load metadata, not the actual images
                // In a real app, you'd use IndexedDB for image storage
                console.log('Loaded photo metadata:', photos);
            }
        } catch (error) {
            console.warn('Failed to load photos from storage:', error);
        }
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped HTML
     */
    escapeHtml(text) {
        return UIHelpers.escapeHtml(text);
    }

    setupDetectionOverlay() {
        if (!this.detectionOverlay || !this.video) return;

        // Set overlay canvas size to match video dimensions
        const resizeOverlay = () => {
            const rect = this.video.getBoundingClientRect();
            this.detectionOverlay.width = rect.width;
            this.detectionOverlay.height = rect.height;
        };

        // Initial resize
        resizeOverlay();

        // Resize on window resize
        window.addEventListener('resize', resizeOverlay);
    }

    async startRealTimeDetection() {
        if (this.isDetectionRunning || !window.aiRecognitionManager) {
            if (!window.aiRecognitionManager) {
                console.error('AI Recognition Manager not available');
            }
            return;
        }

        try {
            console.log('🤖 Initializing AI model for real-time detection...');

            // Initialize AI model if not already loaded
            const isLoaded = await aiRecognitionManager.initializeModel();
            if (!isLoaded) {
                console.warn('⚠️ AI model failed to load, real-time detection disabled');
                this.showError('AI model failed to load');
                return;
            }

            this.isDetectionRunning = true;
            console.log('✅ Real-time AI detection started');
            console.log('📊 Detection overlay size:', this.detectionOverlay.width, 'x', this.detectionOverlay.height);
            console.log('📹 Video size:', this.video.videoWidth, 'x', this.video.videoHeight);

            // Show brief notification
            this.showDetectionStarted();

            // Use requestAnimationFrame for smooth frame-by-frame detection
            this.runDetectionLoop();

        } catch (error) {
            console.error('❌ Failed to start real-time detection:', error);
            this.isDetectionRunning = false;
            this.showError('Failed to start AI detection: ' + error.message);
        }
    }

    /**
     * Show notification that detection has started
     */
    showDetectionStarted() {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
            padding: 12px 24px;
            border-radius: 24px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: var(--md-sys-elevation-level2);
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        toast.innerHTML = `
            <span class="material-icons">visibility</span>
            AI Detection Active
        `;

        document.body.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 2000);
    }

    runDetectionLoop() {
        if (!this.isDetectionRunning) return;

        // Run detection on current frame
        this.runDetectionFrame().finally(() => {
            // Schedule next frame
            if (this.isDetectionRunning) {
                this.detectionInterval = requestAnimationFrame(() => this.runDetectionLoop());
            }
        });
    }

    async runDetectionFrame() {
        if (!this.isDetectionRunning || !this.video || !this.detectionOverlay) return;

        try {
            // Skip if video not ready
            if (this.video.readyState < 2) return;

            // Run optimized real-time detection directly on video element
            const detections = await aiRecognitionManager.detectObjects(this.video, true);

            // Detect poses if enabled
            if (this.isPoseEstimationEnabled && window.poseEstimationManager) {
                this.currentPoses = await poseEstimationManager.detectPoses(this.video, true);
            } else {
                this.currentPoses = [];
            }

            // Detect faces if enabled
            if (this.isFaceDetectionEnabled && window.faceDetectionManager) {
                this.currentFaces = await faceDetectionManager.detectFaces(this.video, true);
            } else {
                this.currentFaces = [];
            }

            // Predict depth if enabled
            if (this.isDepthPredictionEnabled && window.depthPredictionManager) {
                this.currentDepthMap = await depthPredictionManager.predictDepth(this.video, true);
            } else {
                this.currentDepthMap = null;
            }

            // Only draw if we got results (frame wasn't skipped for performance)
            if (detections && detections.length >= 0) {
                this.drawRealtimeDetections(detections);

                // Log first detection for debugging (only once per session)
                if (!this.hasLoggedFirstDetection && detections.length > 0) {
                    console.log('🎯 First detection:', detections.length, 'objects detected');
                    console.log('Sample detection:', detections[0]);
                    this.hasLoggedFirstDetection = true;
                }
            }

        } catch (error) {
            console.error('❌ Detection frame error:', error);
            // Don't spam console with errors, just log once
            if (!this.hasLoggedDetectionError) {
                console.error('Full error details:', error);
                this.hasLoggedDetectionError = true;
            }
        }
    }

    async drawRealtimeDetections(detections) {
        if (!this.detectionOverlay || !detections) return;

        const ctx = this.detectionOverlay.getContext('2d');

        // Clear previous detections
        ctx.clearRect(0, 0, this.detectionOverlay.width, this.detectionOverlay.height);

        // Validate video dimensions
        if (!this.video.videoWidth || !this.video.videoHeight) return;

        // Calculate scale factors to match video display
        const videoRect = this.video.getBoundingClientRect();
        const scaleX = videoRect.width / this.video.videoWidth;
        const scaleY = videoRect.height / this.video.videoHeight;

        // Render depth map in PiP mode (picture-in-picture in top left)
        if (this.isDepthPredictionEnabled && this.currentDepthMap && window.depthPredictionManager) {
            if (depthPredictionManager.pipMode) {
                // PiP mode: render small depth view in top-left corner at 15% size
                await depthPredictionManager.renderPictureInPicture(
                    ctx,
                    this.currentDepthMap,
                    this.detectionOverlay.width,
                    this.detectionOverlay.height
                );
            }
        }

        // Draw "AI Active" indicator in corner when no detections, poses, or faces
        if (detections.length === 0 && this.currentPoses.length === 0 && this.currentFaces.length === 0) {
            this.drawAIActiveIndicator(ctx);
            this.drawDetectionStats(ctx);
            return;
        }

        detections.forEach(detection => {
            const { bbox, class: className, confidence, trackId } = detection;

            // Validate bbox
            if (!bbox || bbox.width <= 0 || bbox.height <= 0) return;

            // Scale bounding box to overlay dimensions
            const x = bbox.x * scaleX;
            const y = bbox.y * scaleY;
            const width = bbox.width * scaleX;
            const height = bbox.height * scaleY;

            // Skip if scaled dimensions are too small
            if (width < 5 || height < 5) return;

            // Get color for this class from AI manager
            const color = window.aiRecognitionManager ?
                aiRecognitionManager.getClassColor(className) : '#B4F222';

            // Draw bounding box with thicker line and shadow for better visibility
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 4;
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, width, height);

            // Reset shadow for corners
            ctx.shadowBlur = 0;

            // Draw corner accents for modern look - all in one path for efficiency
            const cornerLength = Math.min(20, width / 4, height / 4);
            ctx.lineWidth = 4;
            ctx.beginPath();

            // Top-left corner
            ctx.moveTo(x, y + cornerLength);
            ctx.lineTo(x, y);
            ctx.lineTo(x + cornerLength, y);

            // Top-right corner
            ctx.moveTo(x + width - cornerLength, y);
            ctx.lineTo(x + width, y);
            ctx.lineTo(x + width, y + cornerLength);

            // Bottom-left corner
            ctx.moveTo(x, y + height - cornerLength);
            ctx.lineTo(x, y + height);
            ctx.lineTo(x + cornerLength, y + height);

            // Bottom-right corner
            ctx.moveTo(x + width - cornerLength, y + height);
            ctx.lineTo(x + width, y + height);
            ctx.lineTo(x + width, y + height - cornerLength);

            ctx.stroke();

            // Draw label with track ID if available
            const label = trackId ? `${className} #${trackId} ${confidence}%` : `${className} ${confidence}%`;
            ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            const textMetrics = ctx.measureText(label);
            const textWidth = textMetrics.width;
            const textHeight = 18;

            // Draw label background with same color but semi-transparent
            ctx.fillStyle = this.hexToRGBA(color, 0.9);
            const labelX = x;
            const labelY = y - textHeight - 6;
            const padding = 8;

            // Draw rounded rectangle for label
            this.drawRoundedRect(ctx, labelX, labelY, textWidth + padding * 2, textHeight + 4, 4);
            ctx.fill();

            // Draw label text with contrasting color
            ctx.fillStyle = this.getContrastColor(color);
            ctx.fillText(label, labelX + padding, labelY + textHeight - 3);

            // Draw confidence bar
            const barWidth = width;
            const barHeight = 3;
            const barX = x;
            const barY = y + height + 4;

            // Background bar
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Confidence bar
            ctx.fillStyle = color;
            ctx.fillRect(barX, barY, barWidth * (confidence / 100), barHeight);
        });

        // Draw poses if enabled
        if (this.isPoseEstimationEnabled && this.currentPoses.length > 0 && window.poseEstimationManager) {
            const scale = { x: scaleX, y: scaleY };
            poseEstimationManager.drawPoses(ctx, this.currentPoses, scale);
        }

        // Draw faces if enabled
        if (this.isFaceDetectionEnabled && this.currentFaces.length > 0 && window.faceDetectionManager) {
            const scale = { x: scaleX, y: scaleY };
            faceDetectionManager.drawFaces(ctx, this.currentFaces, scale);
        }

        // Draw detection statistics overlay
        this.drawDetectionStats(ctx);
    }

    /**
     * Helper function to draw rounded rectangle
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} width - Width
     * @param {number} height - Height
     * @param {number} radius - Border radius
     */
    drawRoundedRect(ctx, x, y, width, height, radius) {
        UIHelpers.drawRoundedRect(ctx, x, y, width, height, radius);
    }

    /**
     * Convert hex color to RGBA
     * @param {string} hex - Hex color code
     * @param {number} alpha - Alpha value (0-1)
     * @returns {string} RGBA color string
     */
    hexToRGBA(hex, alpha) {
        return UIHelpers.hexToRGBA(hex, alpha);
    }

    /**
     * Get contrasting color (black or white) for text
     * @param {string} hexColor - Background hex color
     * @returns {string} Contrasting color (black or white)
     */
    getContrastColor(hexColor) {
        return UIHelpers.getContrastColor(hexColor);
    }

    /**
     * Draw AI Active indicator when no objects detected
     */
    drawAIActiveIndicator(ctx) {
        if (!this.detectionOverlay || this.detectionOverlay.width < 100) return;

        const padding = 12;
        const x = this.detectionOverlay.width - 120;
        const y = this.detectionOverlay.height - 50;

        // Background
        ctx.fillStyle = 'rgba(180, 242, 34, 0.8)';
        this.drawRoundedRect(ctx, x, y, 100, 30, 6);
        ctx.fill();

        // Text
        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#000';
        ctx.fillText('🤖 AI ACTIVE', x + 8, y + 19);
    }

    /**
     * Draw detection statistics overlay
     * Optimized to only draw when overlay is visible and stats exist
     */
    drawDetectionStats(ctx) {
        if (!window.aiRecognitionManager) return;

        const stats = aiRecognitionManager.getDetectionStatistics();
        if (!stats || stats.frameCount === 0) return;

        // Only draw stats if we have overlay space
        if (this.detectionOverlay.width < 250) return;

        // Draw stats in top-right corner
        const padding = 12;
        const lineHeight = 18;
        const statsWidth = 200;
        const x = this.detectionOverlay.width - statsWidth - padding;
        let y = padding;

        // Calculate dynamic height based on class count
        const sortedClasses = Object.entries(stats.classCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5); // Top 5 classes

        const statsHeight = lineHeight * (2 + sortedClasses.length) + padding;

        // Background with shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        this.drawRoundedRect(ctx, x - padding, y, statsWidth, statsHeight, 8);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Stats text
        ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#FFFFFF';

        y += lineHeight;
        ctx.fillText(`🎯 Objects: ${stats.trackedObjectsCount}`, x, y);

        y += lineHeight;
        ctx.fillText(`📊 Avg: ${stats.averageDetectionsPerFrame}`, x, y);

        // Class breakdown
        if (sortedClasses.length > 0) {
            ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            for (let i = 0; i < sortedClasses.length; i++) {
                const [className, count] = sortedClasses[i];
                y += lineHeight;
                const color = aiRecognitionManager.getClassColor(className);

                // Draw color indicator
                ctx.fillStyle = color;
                ctx.fillRect(x, y - 8, 10, 10);

                // Draw class name and count (truncate long names)
                ctx.fillStyle = '#FFFFFF';
                const displayName = className.length > 12 ? className.substring(0, 12) + '...' : className;
                ctx.fillText(`${displayName}: ${count}`, x + 15, y);
            }
        }
    }

    stopRealTimeDetection() {
        this.isDetectionRunning = false;

        if (this.detectionInterval) {
            cancelAnimationFrame(this.detectionInterval);
            this.detectionInterval = null;
        }

        // Clear overlay
        if (this.detectionOverlay) {
            const ctx = this.detectionOverlay.getContext('2d');
            ctx.clearRect(0, 0, this.detectionOverlay.width, this.detectionOverlay.height);
        }

        console.log('Real-time detection stopped');
    }

    /**
     * Show error message to user
     * @param {string} message - Error message
     */
    showError(message) {
        UIHelpers.showError(message);
    }

    /**
     * Show toast notification to user
     * @param {string} message - Toast message
     * @param {string|null} icon - Material icon name (optional)
     */
    showToast(message, icon = null) {
        UIHelpers.showToast(message, 'info', icon);
    }

    initializeStitcher() {
        this.imageStitcher = new ImageStitcher();
        this.updateStitchButton();
    }

    updateStitchButton() {
        if (this.stitchBtn) {
            this.stitchBtn.disabled = this.selectedPhotos.size < 2;
            this.stitchBtn.innerHTML = this.selectedPhotos.size < 2
                ? '<span class="material-icons">collections</span> Select 2+ Photos'
                : `<span class="material-icons">collections</span> Stitch ${this.selectedPhotos.size} Photos`;
        }
    }

    async stitchSelectedPhotos() {
        if (this.selectedPhotos.size < 2) {
            this.showError('Please select at least 2 photos to stitch');
            return;
        }

        try {
            this.stitchBtn.disabled = true;
            this.stitchBtn.textContent = 'Stitching...';

            const photoArray = Array.from(this.selectedPhotos);
            const imageSources = photoArray.map(photo => photo.dataUrl);

            const stitchedImageUrl = await this.imageStitcher.stitchImages(imageSources, {
                method: 'auto',
                overlap: 0.1,
                blending: true,
                quality: 0.9,
                format: 'image/jpeg'
            });

            const stitchedPhoto = {
                id: Date.now(),
                userId: this.userId,
                dataUrl: stitchedImageUrl,
                timestamp: new Date().toISOString(),
                location: this.getCurrentLocation(),
                orientation: this.getCurrentOrientation(),
                networkInfo: networkManager.getNetworkInfo(),
                isStitched: true,
                stitchMethod: 'auto',
                sourcePhotos: photoArray.map(p => p.id),
                sourcePhotoCount: photoArray.length
            };

            this.capturedPhotos.push(stitchedPhoto);
            this.displayPhoto(stitchedPhoto);
            this.savePhotoToStorage(stitchedPhoto);
            this.savePhotoToDatabase(stitchedPhoto);

            this.clearPhotoSelection();
            this.showStitchSuccess(stitchedPhoto);

        } catch (error) {
            console.error('Stitching failed:', error);
            this.showError('Failed to stitch photos: ' + error.message);
        } finally {
            this.stitchBtn.disabled = false;
            this.updateStitchButton();
        }
    }

    clearPhotoSelection() {
        this.selectedPhotos.clear();
        const photoItems = this.photosGrid.querySelectorAll('.photo-item');
        photoItems.forEach(photoItem => {
            photoItem.classList.remove('selected');
        });
        this.updateStitchButton();
    }

    showStitchSuccess(stitchedPhoto) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
            padding: 12px 24px;
            border-radius: 24px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: var(--md-sys-elevation-level2);
            cursor: pointer;
        `;
        toast.innerHTML = `
            <span class="material-icons" style="vertical-align: middle; margin-right: 8px;">collections</span>
            Photo stitching complete! Tap to view.
        `;

        toast.addEventListener('click', () => {
            this.showPhotoDetails(stitchedPhoto);
            document.body.removeChild(toast);
        });

        document.body.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);
    }

    /**
     * Cleanup resources before app shutdown
     */
    cleanup() {
        // Cleanup VTT resources
        if (this.currentVTTUrl) {
            URL.revokeObjectURL(this.currentVTTUrl);
            this.currentVTTUrl = null;
        }

        // Cleanup camera stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        // Cleanup GPS Manager
        if (this.gpsManager) {
            this.gpsManager.cleanup();
        }

        // Stop real-time detection
        this.stopRealTimeDetection();

        // Cleanup AI modules
        if (window.aiRecognitionManager) {
            aiRecognitionManager.cleanup();
        }
        if (window.poseEstimationManager) {
            poseEstimationManager.cleanup();
        }
        if (window.faceDetectionManager) {
            faceDetectionManager.cleanup();
        }
        if (window.depthPredictionManager) {
            depthPredictionManager.cleanup();
        }

        // Cleanup current depth map if exists
        if (this.currentDepthMap) {
            this.currentDepthMap.dispose();
            this.currentDepthMap = null;
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PoliCameraApp();
});