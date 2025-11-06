class PoliCameraApp {
    constructor() {
        this.stream = null;
        this.capturedPhotos = [];
        this.isLocationWatching = false;
        this.locationWatchId = null;
        this.vttTrack = null;
        this.vttCues = [];
        this.startTime = null;
        this.currentVTTUrl = null;
        this.userId = null;
        this.detectionInterval = null;
        this.isDetectionRunning = false;
        this.imageStitcher = null;
        this.selectedPhotos = new Set();
        this.hasLoggedFirstDetection = false;
        this.hasLoggedDetectionError = false;
        this.appVersion = '1.0.0'; // Default version

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
        this.loadVersion();

        // Auto-start camera and GPS when page loads
        this.autoStart();

        // Start GPS display updates
        this.startGPSDisplayUpdates();
    }

    initializeElements() {
        this.video = document.getElementById('cameraFeed');
        this.canvas = document.getElementById('canvas');
        this.detectionOverlay = document.getElementById('detectionOverlay');
        this.photosGrid = document.getElementById('photosGrid');

        // FAB elements
        this.startFab = document.getElementById('startFab');
        this.captureFab = document.getElementById('captureFab');
        this.settingsFab = document.getElementById('settingsFab');
        this.qrFab = document.getElementById('qrFab');
        this.photosOverlay = document.getElementById('photosOverlay');
        this.stitchBtn = document.getElementById('stitchBtn');

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

        // WebVTT elements
        this.positionTrack = document.getElementById('positionTrack');
    }

    initializeEventListeners() {
        this.startFab.addEventListener('click', () => this.startCamera());
        this.captureFab.addEventListener('click', () => this.capturePhoto());
        this.settingsFab.addEventListener('click', () => this.toggleSettings());
        this.qrFab.addEventListener('click', () => this.showQRCode());
        this.stitchBtn.addEventListener('click', () => this.stitchSelectedPhotos());

        // Handle visibility change for camera
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.stream) {
                this.pauseCamera();
            } else if (!document.hidden && this.stream) {
                this.resumeCamera();
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

    updateOrientation(event) {
        const alpha = event.alpha ? Math.round(event.alpha) : 0;
        const beta = event.beta ? Math.round(event.beta) : 0;
        const gamma = event.gamma ? Math.round(event.gamma) : 0;

        this.alphaEl.textContent = `${alpha}°`;
        this.betaEl.textContent = `${beta}°`;
        this.gammaEl.textContent = `${gamma}°`;

        // Update permanent GPS display
        this.updateGPSDisplay();

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

    initializeUserId() {
        // Try to get existing user ID from cookie
        this.userId = this.getCookie('policamera-userid');

        if (!this.userId) {
            // Generate new 12-character user ID using custom generator
            this.userId = this.generateUserId(12);

            // Store in cookie with 1 year expiration
            this.setCookie('policamera-userid', this.userId, 365);

            console.log('Generated new user ID:', this.userId);
        } else {
            console.log('Found existing user ID:', this.userId);
        }
    }

    setCookie(name, value, days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        const expires = `expires=${date.toUTCString()}`;
        document.cookie = `${name}=${value};${expires};path=/;SameSite=Strict`;
    }

    getCookie(name) {
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

    generateUserId(length) {
        // Custom secure ID generator using crypto.getRandomValues
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

    formatTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const ms = milliseconds % 1000;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }

    updateVTTCue() {
        if (!this.startTime || !this.stream) return;

        const currentTime = Date.now() - this.startTime;
        const location = this.getCurrentLocationData();
        const orientation = this.getCurrentOrientationData();
        const network = networkManager.getNetworkInfo();

        // Create cue text with position data
        const cueText = this.formatCueText(location, orientation, network);

        // Add new cue (replace last one if within 500ms for faster updates)
        if (this.vttCues.length > 0) {
            const lastCue = this.vttCues[this.vttCues.length - 1];
            if (currentTime - lastCue.startTime < 500) {
                // Update existing cue
                lastCue.endTime = currentTime + 500;
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

    addVTTCue(startTime, text) {
        const cue = {
            startTime: startTime,
            endTime: startTime + 500, // 500ms duration for faster updates
            text: text
        };

        this.vttCues.push(cue);

        // Keep only last 100 cues to prevent memory issues
        if (this.vttCues.length > 100) {
            this.vttCues.shift();
        }
    }

    formatCueText(location, orientation, network) {
        let text = '';

        if (location.latitude !== '--') {
            // Primary GPS coordinates - make them prominent
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

    getCurrentLocationData() {
        return {
            latitude: this.latitudeEl.textContent,
            longitude: this.longitudeEl.textContent,
            altitude: this.altitudeEl.textContent,
            accuracy: this.accuracyEl.textContent
        };
    }

    getCurrentOrientationData() {
        return {
            alpha: this.alphaEl.textContent,
            beta: this.betaEl.textContent,
            gamma: this.gammaEl.textContent
        };
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

    async autoStart() {
        // Small delay to ensure DOM is fully ready
        setTimeout(() => {
            this.startCamera();
        }, 100);
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

    async initializeLocation() {
        if (!navigator.geolocation) {
            throw new Error('Geolocation not supported');
        }

        return new Promise((resolve, reject) => {
            const options = {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            };

            // Start watching location
            this.locationWatchId = navigator.geolocation.watchPosition(
                (position) => {
                    this.updateLocation(position);
                    if (!this.isLocationWatching) {
                        this.isLocationWatching = true;
                        resolve(true);
                    }
                },
                (error) => {
                    if (!this.isLocationWatching) {
                        reject(new Error(this.getLocationErrorMessage(error)));
                    }
                },
                options
            );

            // Also try to get immediate position
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.updateLocation(position);
                    if (!this.isLocationWatching) {
                        this.isLocationWatching = true;
                        resolve(true);
                    }
                },
                () => {}, // Ignore errors here, watchPosition will handle them
                options
            );
        });
    }

    getLocationErrorMessage(error) {
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

        // Create photo object with metadata
        const photo = {
            id: Date.now(),
            userId: this.userId,
            dataUrl: imageDataUrl,
            timestamp: new Date().toISOString(),
            location: this.getCurrentLocation(),
            orientation: this.getCurrentOrientation(),
            networkInfo: networkManager.getNetworkInfo(),
            aiAnalysis: aiAnalysis
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


    showCaptureEffect() {
        const effect = document.createElement('div');
        effect.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: white;
            opacity: 0.8;
            z-index: 9999;
            pointer-events: none;
            animation: captureFlash 0.2s ease-out;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes captureFlash {
                0% { opacity: 0.8; }
                100% { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(effect);

        setTimeout(() => {
            document.body.removeChild(effect);
            document.head.removeChild(style);
        }, 200);
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

        details.innerHTML = basicInfo + aiInfo;

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


    updateLocation(position) {
        const { latitude, longitude, altitude, accuracy } = position.coords;

        this.latitudeEl.textContent = latitude.toFixed(6);
        this.longitudeEl.textContent = longitude.toFixed(6);
        this.altitudeEl.textContent = altitude ? `${Math.round(altitude)} m` : '-- m';
        this.accuracyEl.textContent = `${Math.round(accuracy)} m`;

        // Update permanent GPS display
        this.updateGPSDisplay();

        // Update VTT cue with location data
        this.updateVTTCue();
    }

    updateGPSDisplay() {
        // Update GPS coordinates display
        this.gpsLatDisplayEl.textContent = this.latitudeEl.textContent;
        this.gpsLonDisplayEl.textContent = this.longitudeEl.textContent;
        this.gpsUserIdDisplayEl.textContent = this.userId || '--';
        this.gpsAltDisplayEl.textContent = this.altitudeEl.textContent;
        this.gpsAccDisplayEl.textContent = this.accuracyEl.textContent;

        // Update time
        const now = new Date();
        this.gpsTimeDisplayEl.textContent = now.toLocaleTimeString();

        // Update heading (alpha orientation)
        this.gpsHeadingDisplayEl.textContent = this.alphaEl.textContent;

        // Update network status
        const networkInfo = networkManager.getNetworkInfo();
        const networkText = networkInfo.online ?
            (networkInfo.effectiveType ? networkInfo.effectiveType.toUpperCase() : 'ONLINE') :
            'OFFLINE';
        this.gpsNetworkDisplayEl.textContent = networkText;

        // Update version
        this.gpsVersionDisplayEl.textContent = this.appVersion;
    }

    /**
     * Load version from manifest
     */
    async loadVersion() {
        try {
            const response = await fetch('manifest.json');
            const manifest = await response.json();
            if (manifest.version) {
                this.appVersion = manifest.version;
                this.gpsVersionDisplayEl.textContent = this.appVersion;
                console.log('📱 PoliCamera version:', this.appVersion);
            }
        } catch (error) {
            console.warn('Failed to load version from manifest:', error);
            // Keep default version
        }
    }

    startGPSDisplayUpdates() {
        // Initial update
        this.updateGPSDisplay();

        // Update every 500ms for real-time display
        this.gpsUpdateInterval = setInterval(() => {
            this.updateGPSDisplay();
        }, 500);
    }

    handleLocationError(error) {
        let message = 'Location error: ';
        switch (error.code) {
            case error.PERMISSION_DENIED:
                message += 'Permission denied';
                break;
            case error.POSITION_UNAVAILABLE:
                message += 'Position unavailable';
                break;
            case error.TIMEOUT:
                message += 'Request timeout';
                break;
            default:
                message += 'Unknown error';
                break;
        }
        this.showError(message);
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

    async saveGPSLogToDatabase() {
        try {
            const gpsData = {
                userId: this.userId,
                lat: parseFloat(this.latitudeEl.textContent) || null,
                lon: parseFloat(this.longitudeEl.textContent) || null,
                alt: this.parseAltitude(this.altitudeEl.textContent),
                accuracy: this.parseAccuracy(this.accuracyEl.textContent),
                error: this.getLocationError(),
                heading: this.parseHeading(this.alphaEl.textContent)
            };

            await databaseManager.storeGPSLog(gpsData);
        } catch (error) {
            console.error('Failed to save GPS log to database:', error);
        }
    }

    getLocationError() {
        // Return error if GPS coordinates are not available
        if (this.latitudeEl.textContent === '--' || this.longitudeEl.textContent === '--') {
            return 'GPS coordinates not available';
        }
        return null;
    }

    parseAltitude(altText) {
        if (altText === '-- m') return null;
        const match = altText.match(/^(\d+)/);
        return match ? parseInt(match[1]) : null;
    }

    parseAccuracy(accText) {
        if (accText === '-- m') return null;
        const match = accText.match(/^(\d+)/);
        return match ? parseInt(match[1]) : null;
    }

    parseHeading(headingText) {
        if (headingText === '0°') return null;
        const match = headingText.match(/^(\d+)/);
        return match ? parseInt(match[1]) : null;
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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

    drawRealtimeDetections(detections) {
        if (!this.detectionOverlay || !detections) return;

        const ctx = this.detectionOverlay.getContext('2d');

        // Clear previous detections
        ctx.clearRect(0, 0, this.detectionOverlay.width, this.detectionOverlay.height);

        // Draw "AI Active" indicator in corner when no detections
        if (detections.length === 0) {
            this.drawAIActiveIndicator(ctx);
            this.drawDetectionStats(ctx);
            return;
        }

        // Validate video dimensions
        if (!this.video.videoWidth || !this.video.videoHeight) return;

        // Calculate scale factors to match video display
        const videoRect = this.video.getBoundingClientRect();
        const scaleX = videoRect.width / this.video.videoWidth;
        const scaleY = videoRect.height / this.video.videoHeight;

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

        // Draw detection statistics overlay
        this.drawDetectionStats(ctx);
    }

    /**
     * Helper function to draw rounded rectangle
     */
    drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    /**
     * Convert hex color to RGBA
     */
    hexToRGBA(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * Get contrasting color (black or white) for text
     */
    getContrastColor(hexColor) {
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? '#000000' : '#FFFFFF';
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

    showError(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--md-sys-color-error);
            color: var(--md-sys-color-on-error);
            padding: 12px 24px;
            border-radius: 24px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: var(--md-sys-elevation-level2);
        `;
        toast.textContent = message;

        document.body.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 4000);
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

    cleanup() {
        // Cleanup method for proper resource management
        if (this.currentVTTUrl) {
            URL.revokeObjectURL(this.currentVTTUrl);
            this.currentVTTUrl = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        if (this.locationWatchId) {
            navigator.geolocation.clearWatch(this.locationWatchId);
        }
        if (this.gpsUpdateInterval) {
            clearInterval(this.gpsUpdateInterval);
        }
        // Stop real-time detection
        this.stopRealTimeDetection();
        // Cleanup AI worker
        if (window.aiRecognitionManager) {
            aiRecognitionManager.cleanup();
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PoliCameraApp();
});