/**
 * Barcode/QR Code Manager for PoliCamera
 * Real-time barcode scanning using ZXing library
 * Supports 1D barcodes and 2D codes (QR, Data Matrix, PDF417, Aztec)
 */
/**
 * BarcodeManager - Manages barcode/QR code scanning functionality
 */
export class BarcodeManager {
    /**
     * Constructor
     */
    constructor(config, subtitleConfig) {
        this.reader = null;
        this.isInitialized = false;
        this.isEnabled = false;
        // Configuration
        this.config = {
            targetFPS: 5, // 5 scans per second (balanced performance)
            tryHarder: true, // More accurate scanning
            formats: [], // All formats by default
        };
        this.subtitleConfig = {
            position: 'bottom',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            textColor: '#ffffff',
            fontSize: 18,
            fadeTime: 5000, // 5 seconds
        };
        // UI Elements
        this.subtitleBar = null;
        this.fadeTimeout = null;
        this.modal = null;
        this.modalTimeout = null;
        // Canvas overlay for drawing bounding boxes
        this.overlayCanvas = null;
        this.overlayEnabled = true;
        this.overlayTimeout = null;
        // Scanning state
        this.lastScanTime = 0;
        this.currentResult = null;
        /**
         * Result history storage
         * Stores the last 20 scanned barcode results in a FIFO queue.
         *
         * Memory Management:
         * - Each BarcodeResult is ~500 bytes (text + metadata)
         * - Max 20 results = ~10KB memory footprint
         * - Prevents unbounded memory growth during long scanning sessions
         * - Oldest results are automatically removed when limit is reached
         */
        this.resultHistory = [];
        /**
         * Maximum number of results to keep in history
         * Limited to 20 to prevent memory leaks during extended use
         */
        this.maxHistorySize = 20;
        /**
         * LocalStorage key for persisting history
         */
        this.storageKey = 'policamera-barcode-history';
        /**
         * Enable/disable automatic persistence
         */
        this.persistenceEnabled = false;
        // Performance metrics
        this.metrics = {
            scansPerformed: 0,
            successfulScans: 0,
            failedScans: 0,
            totalScanTime: 0,
        };
        // Debug mode
        this.debugMode = false;
        if (config) {
            this.config = { ...this.config, ...config };
        }
        if (subtitleConfig) {
            this.subtitleConfig = { ...this.subtitleConfig, ...subtitleConfig };
        }
        // Initialize debug mode from config
        this.debugMode = this.config.debugMode || false;
        // Calculate scan interval from target FPS
        this.scanInterval = 1000 / this.config.targetFPS;
    }
    /**
     * Initialize the barcode scanner
     */
    async initialize() {
        if (this.isInitialized) {
            if (this.debugMode) {
                console.log('📱 BarcodeManager already initialized');
            }
            return true;
        }
        try {
            if (this.debugMode) {
                console.log('📱 Initializing BarcodeManager...');
            }
            // Create ZXing reader with hints
            const hints = new Map();
            // Set formats if specified
            if (this.config.formats && this.config.formats.length > 0) {
                hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, this.config.formats);
            }
            // Enable try harder mode for more accuracy
            if (this.config.tryHarder) {
                hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
            }
            this.reader = new ZXing.BrowserMultiFormatReader(hints);
            // Create subtitle bar UI
            this.createSubtitleBar();
            // Create modal UI
            this.createModal();
            this.isInitialized = true;
            if (this.debugMode) {
                console.log('✅ BarcodeManager initialized successfully');
            }
            return true;
        }
        catch (error) {
            console.error('❌ Failed to initialize BarcodeManager:', error);
            return false;
        }
    }
    /**
     * Toggle barcode scanning on/off
     */
    async toggle() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        this.isEnabled = !this.isEnabled;
        if (this.isEnabled) {
            if (this.debugMode) {
                console.log('📱 Barcode scanning enabled');
            }
            // Show scanning indicator
            this.showScanningIndicator();
        }
        else {
            if (this.debugMode) {
                console.log('📱 Barcode scanning disabled');
            }
            this.hideSubtitle();
        }
        return this.isEnabled;
    }
    /**
     * Show scanning indicator
     */
    showScanningIndicator() {
        if (!this.subtitleBar)
            return;
        this.subtitleBar.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; gap: 12px;">
                <span style="font-size: 20px;">📱</span>
                <span style="font-weight: 600;">BARCODE SCANNER</span>
                <span style="opacity: 0.8;">|</span>
                <span style="opacity: 0.7;">Scanning...</span>
            </div>
        `;
        this.subtitleBar.style.opacity = '1';
    }
    /**
     * Scan barcode from image element or video frame
     */
    async scanFromImage(imageSource, isRealTime = false) {
        if (!this.isEnabled || !this.reader) {
            return null;
        }
        // Throttle real-time scanning based on target FPS
        if (isRealTime) {
            const now = Date.now();
            if (now - this.lastScanTime < this.scanInterval) {
                return this.currentResult; // Return cached result
            }
            this.lastScanTime = now;
        }
        const startTime = performance.now();
        try {
            this.metrics.scansPerformed++;
            // Decode barcode from image
            const result = await this.reader.decodeFromImageElement(imageSource);
            const scanTime = performance.now() - startTime;
            this.metrics.totalScanTime += scanTime;
            this.metrics.successfulScans++;
            // Create barcode result
            const barcodeResult = {
                text: result.getText(),
                format: ZXing.BarcodeFormat[result.getBarcodeFormat()],
                timestamp: Date.now(),
                rawBytes: result.getRawBytes(),
                resultPoints: result.getResultPoints()?.map((point) => ({
                    x: point.getX(),
                    y: point.getY(),
                })),
            };
            // Update current result and history
            this.currentResult = barcodeResult;
            this.addToHistory(barcodeResult);
            // Show modal popup with barcode info
            this.showModal(barcodeResult);
            // Update subtitle display
            if (barcodeResult.text.length > 0) {
                this.updateSubtitleText(barcodeResult);
            }
            if (this.debugMode) {
                console.log(`📱 Barcode detected [${barcodeResult.format}]: ${barcodeResult.text.substring(0, 50)}${barcodeResult.text.length > 50 ? '...' : ''}`);
            }
            return barcodeResult;
        }
        catch (error) {
            // NotFoundException is expected when no barcode is found
            if (!(error instanceof ZXing.NotFoundException)) {
                this.metrics.failedScans++;
                if (this.debugMode) {
                    console.warn('⚠️ Barcode scan error:', error);
                }
            }
            return null;
        }
    }
    /**
     * Scan continuously from video stream (polling-based)
     * Uses canvas buffer to avoid interfering with video display
     * Returns interval ID that can be cleared with stopScanning()
     */
    startVideoScanning(videoElement, callback, intervalMs = 200) {
        if (!this.reader || !this.isEnabled) {
            return -1;
        }
        // Create an off-screen canvas for frame capture
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Failed to create canvas context for barcode scanning');
            return -1;
        }
        const scanInterval = window.setInterval(async () => {
            try {
                // Skip if video is not ready
                if (videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
                    return;
                }
                // Set canvas size to match video
                if (canvas.width !== videoElement.videoWidth || canvas.height !== videoElement.videoHeight) {
                    canvas.width = videoElement.videoWidth;
                    canvas.height = videoElement.videoHeight;
                }
                // Capture current video frame to canvas
                ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                // Scan from canvas instead of video element directly
                const result = await this.reader.decodeFromImageElement(canvas);
                if (result) {
                    const barcodeResult = {
                        text: result.getText(),
                        format: ZXing.BarcodeFormat[result.getBarcodeFormat()],
                        timestamp: Date.now(),
                        rawBytes: result.getRawBytes(),
                        resultPoints: result.getResultPoints()?.map((point) => ({
                            x: point.getX(),
                            y: point.getY(),
                        })),
                    };
                    this.currentResult = barcodeResult;
                    this.addToHistory(barcodeResult);
                    // Show modal popup with barcode info
                    this.showModal(barcodeResult);
                    this.updateSubtitleText(barcodeResult);
                    this.metrics.successfulScans++;
                    callback(barcodeResult);
                }
                this.metrics.scansPerformed++;
            }
            catch (error) {
                // NotFoundException is expected when no barcode found
                if (!(error instanceof ZXing.NotFoundException)) {
                    // Only log unexpected errors
                    console.debug('Barcode scan error:', error);
                }
            }
        }, intervalMs);
        return scanInterval;
    }
    /**
     * Stop continuous scanning
     */
    stopScanning() {
        if (this.reader) {
            this.reader.reset();
            if (this.debugMode) {
                console.log('📱 Barcode scanning stopped');
            }
        }
    }
    /**
     * Create subtitle bar UI element
     */
    createSubtitleBar() {
        // Remove existing bar if present
        const existing = document.getElementById('barcode-subtitle-bar');
        if (existing) {
            existing.remove();
        }
        this.subtitleBar = document.createElement('div');
        this.subtitleBar.id = 'barcode-subtitle-bar';
        this.subtitleBar.style.cssText = `
            position: fixed;
            left: 0;
            right: 0;
            ${this.subtitleConfig.position}: 0;
            background: ${this.subtitleConfig.backgroundColor};
            color: ${this.subtitleConfig.textColor};
            padding: 12px 20px;
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: ${this.subtitleConfig.fontSize}px;
            font-weight: 500;
            text-align: center;
            z-index: 10002;
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            pointer-events: none;
            word-break: break-word;
        `;
        document.body.appendChild(this.subtitleBar);
    }
    /**
     * Create modal for displaying barcode information
     */
    createModal() {
        // Remove existing modal if present
        const existing = document.getElementById('barcode-modal');
        if (existing) {
            existing.remove();
        }
        this.modal = document.createElement('div');
        this.modal.id = 'barcode-modal';
        this.modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.8);
            background: linear-gradient(135deg, rgba(20, 21, 20, 0.98) 0%, rgba(30, 31, 30, 0.98) 100%);
            border: 2px solid ${this.subtitleConfig.backgroundColor === 'rgba(0, 0, 0, 0.85)' ? '#B4F222' : this.subtitleConfig.textColor};
            border-radius: 16px;
            padding: 24px 32px;
            font-family: 'Segoe UI', system-ui, sans-serif;
            color: ${this.subtitleConfig.textColor};
            z-index: 10003;
            opacity: 0;
            pointer-events: none;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(180, 242, 34, 0.2);
            backdrop-filter: blur(10px);
            min-width: 320px;
            max-width: 80vw;
            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            display: none;
        `;
        document.body.appendChild(this.modal);
    }
    /**
     * Show modal with barcode result for 2 seconds
     */
    showModal(result) {
        if (!this.modal)
            return;
        // Clear any existing timeout
        if (this.modalTimeout) {
            window.clearTimeout(this.modalTimeout);
        }
        // Get format icon and color
        const formatIcon = this.getFormatIcon(result.format);
        const accentColor = '#B4F222';
        // Escape HTML to prevent XSS
        const safeText = this.escapeHtml(result.text);
        // Truncate very long text for display
        const displayText = result.text.length > 200 ? safeText.substring(0, 200) + '...' : safeText;
        // Create modal content
        this.modal.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 48px; margin-bottom: 16px;">${formatIcon}</div>
                <div style="font-size: 14px; font-weight: 700; letter-spacing: 1px; color: ${accentColor}; margin-bottom: 12px; text-transform: uppercase;">
                    ${result.format}
                </div>
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px; word-break: break-word; line-height: 1.4;">
                    ${displayText}
                </div>
                <div style="font-size: 12px; opacity: 0.6; margin-top: 16px;">
                    Scanned at ${new Date(result.timestamp).toLocaleTimeString()}
                </div>
            </div>
        `;
        // Show modal with animation
        this.modal.style.display = 'block';
        requestAnimationFrame(() => {
            if (this.modal) {
                this.modal.style.opacity = '1';
                this.modal.style.transform = 'translate(-50%, -50%) scale(1)';
            }
        });
        // Auto-hide after 2 seconds
        this.modalTimeout = window.setTimeout(() => {
            this.hideModal();
        }, 2000);
    }
    /**
     * Hide the modal
     */
    hideModal() {
        if (this.modal) {
            this.modal.style.opacity = '0';
            this.modal.style.transform = 'translate(-50%, -50%) scale(0.8)';
            setTimeout(() => {
                if (this.modal) {
                    this.modal.style.display = 'none';
                }
            }, 300);
        }
    }
    /**
     * Update subtitle text with barcode result
     */
    updateSubtitleText(result) {
        if (!this.subtitleBar)
            return;
        // Get format icon
        const formatIcon = this.getFormatIcon(result.format);
        // Escape HTML to prevent XSS
        const safeText = this.escapeHtml(result.text);
        // Truncate long text for display
        const displayText = result.text.length > 100 ? safeText.substring(0, 100) + '...' : safeText;
        this.subtitleBar.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; gap: 12px;">
                <span style="font-size: 20px;">${formatIcon}</span>
                <span style="font-weight: 600;">${result.format}</span>
                <span style="opacity: 0.8;">|</span>
                <span style="flex: 1; max-width: 600px; overflow: hidden; text-overflow: ellipsis;">${displayText}</span>
            </div>
        `;
        // Show subtitle
        this.subtitleBar.style.opacity = '1';
        // Auto-hide after configured time
        if (this.fadeTimeout) {
            window.clearTimeout(this.fadeTimeout);
        }
        this.fadeTimeout = window.setTimeout(() => {
            this.hideSubtitle();
        }, this.subtitleConfig.fadeTime);
    }
    /**
     * Get icon for barcode format
     */
    getFormatIcon(format) {
        // Map format names to icons
        const iconMap = {
            QR_CODE: '📱',
            DATA_MATRIX: '⬛',
            AZTEC: '🔷',
            PDF_417: '📄',
            MAXICODE: '⬢',
            EAN_13: '🏷️',
            EAN_8: '🏷️',
            UPC_A: '🏷️',
            UPC_E: '🏷️',
            CODE_39: '▬',
            CODE_93: '▬',
            CODE_128: '▬',
            CODABAR: '▬',
            ITF: '▬',
        };
        return iconMap[format] || '📊';
    }
    /**
     * Hide subtitle bar
     */
    hideSubtitle() {
        if (this.subtitleBar) {
            this.subtitleBar.style.opacity = '0';
        }
    }
    /**
     * Escape HTML to prevent XSS attacks
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    /**
     * Set the canvas overlay for drawing barcode bounding boxes
     * This should be called from the main app to provide the detection overlay canvas
     */
    setOverlayCanvas(canvas) {
        this.overlayCanvas = canvas;
    }
    /**
     * Enable or disable visual overlay of detected barcodes
     */
    setOverlayEnabled(enabled) {
        this.overlayEnabled = enabled;
    }
    /**
     * Draw barcode bounding box overlay on the canvas
     * Shows where the barcode was detected with a colored box and label
     */
    drawBarcodeOverlay(result, videoElement) {
        if (!this.overlayCanvas || !this.overlayEnabled) {
            return;
        }
        const ctx = this.overlayCanvas.getContext('2d');
        if (!ctx)
            return;
        // Calculate scale factors between video and canvas
        const scaleX = this.overlayCanvas.width / videoElement.videoWidth;
        const scaleY = this.overlayCanvas.height / videoElement.videoHeight;
        // Get result points (corners of the barcode)
        const points = result.resultPoints;
        if (!points || points.length === 0) {
            // Fallback: draw in center if no points available
            return;
        }
        // Calculate bounding box from result points
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        points.forEach(point => {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        });
        // Scale to canvas coordinates
        const x = minX * scaleX;
        const y = minY * scaleY;
        const width = (maxX - minX) * scaleX;
        const height = (maxY - minY) * scaleY;
        // Choose color based on barcode format
        const color = this.getBarcodeColor(result.format);
        // Draw bounding box with glow effect
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);
        ctx.shadowBlur = 0;
        // Draw corner markers for more precise indication
        const markerSize = Math.min(15, width * 0.1, height * 0.1);
        ctx.lineWidth = 4;
        points.forEach(point => {
            const px = point.x * scaleX;
            const py = point.y * scaleY;
            ctx.beginPath();
            ctx.arc(px, py, markerSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
        // Prepare text label
        const formatIcon = this.getFormatIcon(result.format);
        const displayText = result.text.length > 30 ? result.text.substring(0, 30) + '...' : result.text;
        // Draw label background
        ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const labelText = `${formatIcon} ${result.format}: ${displayText}`;
        const metrics = ctx.measureText(labelText);
        const labelWidth = metrics.width + 16;
        const labelHeight = 30;
        // Position label above the bounding box
        const labelX = x;
        const labelY = Math.max(labelHeight + 5, y - 5);
        // Draw label background with gradient
        const gradient = ctx.createLinearGradient(labelX, labelY - labelHeight, labelX, labelY);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
        gradient.addColorStop(1, 'rgba(20, 20, 20, 0.95)');
        ctx.fillStyle = gradient;
        this.drawRoundedRect(ctx, labelX, labelY - labelHeight, labelWidth, labelHeight, 6);
        ctx.fill();
        // Draw label border
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        this.drawRoundedRect(ctx, labelX, labelY - labelHeight, labelWidth, labelHeight, 6);
        ctx.stroke();
        // Draw label text
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(labelText, labelX + 8, labelY - labelHeight / 2 + 6);
        // Auto-clear overlay after 2 seconds
        if (this.overlayTimeout) {
            window.clearTimeout(this.overlayTimeout);
        }
        this.overlayTimeout = window.setTimeout(() => {
            this.clearOverlay();
        }, 2000);
    }
    /**
     * Clear the barcode overlay
     */
    clearOverlay() {
        // The overlay will be cleared by the main detection loop
        // This just clears our stored result so it won't be redrawn
        if (this.overlayTimeout) {
            window.clearTimeout(this.overlayTimeout);
            this.overlayTimeout = null;
        }
    }
    /**
     * Get color for barcode format
     */
    getBarcodeColor(format) {
        const colorMap = {
            QR_CODE: '#00FF00', // Green
            DATA_MATRIX: '#00FFFF', // Cyan
            AZTEC: '#FF00FF', // Magenta
            PDF_417: '#FFFF00', // Yellow
            EAN_13: '#FF8800', // Orange
            EAN_8: '#FF8800', // Orange
            UPC_A: '#FF6600', // Dark Orange
            UPC_E: '#FF6600', // Dark Orange
            CODE_128: '#8800FF', // Purple
            CODE_39: '#0088FF', // Blue
        };
        return colorMap[format] || '#B4F222'; // Default to app accent color
    }
    /**
     * Draw rounded rectangle
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
     * Add result to history with automatic FIFO cleanup
     *
     * Implements a circular buffer pattern where oldest items are removed
     * when the history exceeds maxHistorySize (20 items).
     *
     * This prevents memory leaks during:
     * - Long scanning sessions
     * - High-frequency barcode detection
     * - Continuous real-time scanning scenarios
     *
     * If persistence is enabled, also saves to localStorage.
     *
     * @param result - The barcode result to add to history
     */
    addToHistory(result) {
        this.resultHistory.push(result);
        // FIFO cleanup: Remove oldest when exceeding limit
        if (this.resultHistory.length > this.maxHistorySize) {
            this.resultHistory.shift();
        }
        // Save to storage if persistence enabled
        this.saveHistoryToStorage();
    }
    /**
     * Get result history
     */
    getHistory() {
        return [...this.resultHistory];
    }
    /**
     * Get current result
     */
    getCurrentResult() {
        return this.currentResult;
    }
    /**
     * Get performance metrics
     */
    getMetrics() {
        return {
            scansPerformed: this.metrics.scansPerformed,
            successfulScans: this.metrics.successfulScans,
            failedScans: this.metrics.failedScans,
            avgScanTime: this.metrics.scansPerformed > 0
                ? this.metrics.totalScanTime / this.metrics.scansPerformed
                : 0,
            isEnabled: this.isEnabled,
            isInitialized: this.isInitialized,
            currentFormat: this.currentResult?.format || null,
        };
    }
    /**
     * Set enabled barcode formats
     */
    setFormats(formats) {
        this.config.formats = formats;
        // Reinitialize reader with new formats
        if (this.isInitialized) {
            this.cleanup();
            this.initialize();
        }
    }
    /**
     * Get list of supported formats
     */
    getSupportedFormats() {
        return Object.keys(ZXing.BarcodeFormat).filter((key) => isNaN(Number(key)));
    }
    /**
     * Clear result history
     */
    clearHistory() {
        this.resultHistory = [];
        this.currentResult = null;
        this.clearHistoryFromStorage();
        if (this.debugMode) {
            console.log('📱 Barcode history cleared');
        }
    }
    /**
     * Export history to JSON format
     *
     * Creates a structured export containing all scan history with metadata.
     * Useful for:
     * - Data analysis and reporting
     * - Debugging scan patterns
     * - Backup/restore functionality
     * - Integration with external systems
     *
     * @returns JSON string containing complete scan history
     */
    exportHistory() {
        const exportData = {
            exportVersion: '1.0',
            timestamp: new Date().toISOString(),
            device: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
            },
            scanner: {
                maxHistorySize: this.maxHistorySize,
                currentHistorySize: this.resultHistory.length,
                targetFPS: this.config.targetFPS,
                formats: this.config.formats?.map(f => ZXing.BarcodeFormat[f]) || 'all',
            },
            metrics: this.getMetrics(),
            history: this.resultHistory.map(result => ({
                text: result.text,
                format: result.format,
                timestamp: result.timestamp,
                timestampISO: new Date(result.timestamp).toISOString(),
                hasRawBytes: !!result.rawBytes,
                resultPointsCount: result.resultPoints?.length || 0,
            })),
        };
        return JSON.stringify(exportData, null, 2);
    }
    /**
     * Download history as JSON file
     *
     * Triggers a browser download of the scan history.
     * File is named with timestamp for easy organization.
     */
    downloadHistory() {
        try {
            const jsonData = this.exportHistory();
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `barcode-history-${Date.now()}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            if (this.debugMode) {
                console.log('📥 Barcode history downloaded');
            }
        }
        catch (error) {
            console.error('Failed to download history:', error);
        }
    }
    /**
     * Enable automatic persistence to localStorage
     *
     * When enabled, history is automatically saved after each scan.
     * History is also restored on initialization.
     *
     * @param enabled - Whether to enable persistence
     */
    setPersistence(enabled) {
        this.persistenceEnabled = enabled;
        if (this.debugMode) {
            console.log(`📱 Barcode history persistence ${enabled ? 'enabled' : 'disabled'}`);
        }
        if (enabled) {
            // Load existing history
            this.loadHistoryFromStorage();
        }
    }
    /**
     * Save current history to localStorage
     *
     * Stores a simplified version of the history (without raw bytes)
     * to reduce storage size.
     */
    saveHistoryToStorage() {
        if (!this.persistenceEnabled)
            return;
        try {
            const simplifiedHistory = this.resultHistory.map(result => ({
                text: result.text,
                format: result.format,
                timestamp: result.timestamp,
                // Omit rawBytes and resultPoints to save space
            }));
            localStorage.setItem(this.storageKey, JSON.stringify(simplifiedHistory));
        }
        catch (error) {
            if (this.debugMode) {
                console.warn('Failed to save barcode history to storage:', error);
            }
            // Disable persistence if storage is full
            if (error instanceof Error && error.name === 'QuotaExceededError') {
                this.persistenceEnabled = false;
                if (this.debugMode) {
                    console.warn('Storage quota exceeded - persistence disabled');
                }
            }
        }
    }
    /**
     * Load history from localStorage
     *
     * Restores previously saved scan results.
     * Only loads if persistence is enabled.
     */
    loadHistoryFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored)
                return;
            const history = JSON.parse(stored);
            // Validate and restore history
            if (Array.isArray(history)) {
                this.resultHistory = history.slice(-this.maxHistorySize);
                if (this.debugMode) {
                    console.log(`📱 Loaded ${this.resultHistory.length} barcode results from storage`);
                }
            }
        }
        catch (error) {
            if (this.debugMode) {
                console.warn('Failed to load barcode history from storage:', error);
            }
        }
    }
    /**
     * Clear history from both memory and storage
     */
    clearHistoryFromStorage() {
        try {
            localStorage.removeItem(this.storageKey);
            if (this.debugMode) {
                console.log('📱 Barcode history cleared from storage');
            }
        }
        catch (error) {
            if (this.debugMode) {
                console.warn('Failed to clear storage:', error);
            }
        }
    }
    /**
     * Cleanup resources
     */
    async cleanup() {
        console.log('📱 Cleaning up BarcodeManager...');
        // Stop scanning
        this.stopScanning();
        // Reset reader
        if (this.reader) {
            this.reader.reset();
            this.reader = null;
        }
        // Remove subtitle bar
        if (this.subtitleBar) {
            this.subtitleBar.remove();
            this.subtitleBar = null;
        }
        // Clear fade timeout
        if (this.fadeTimeout) {
            window.clearTimeout(this.fadeTimeout);
            this.fadeTimeout = null;
        }
        // Clear modal timeout
        if (this.modalTimeout) {
            window.clearTimeout(this.modalTimeout);
            this.modalTimeout = null;
        }
        // Remove modal
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
        // Clear results
        this.clearHistory();
        // Reset state
        this.isEnabled = false;
        this.isInitialized = false;
        console.log('✅ BarcodeManager cleanup complete');
    }
}
// Export singleton instance
const barcodeManager = new BarcodeManager();
export default barcodeManager;
// Add to window for non-module usage
if (typeof window !== 'undefined') {
    window.barcodeManager = barcodeManager;
    window.BarcodeManager = BarcodeManager;
}
//# sourceMappingURL=barcode-manager.js.map