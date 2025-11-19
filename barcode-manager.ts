/**
 * Barcode/QR Code Manager for PoliCamera
 * Real-time barcode scanning using ZXing library
 * Supports 1D barcodes and 2D codes (QR, Data Matrix, PDF417, Aztec)
 */

import {
    BrowserMultiFormatReader,
    Result,
    BarcodeFormat,
    DecodeHintType,
    NotFoundException,
} from '@zxing/library';

// Barcode configuration
export interface BarcodeConfig {
    targetFPS: number; // Target frames per second for real-time scanning
    formats?: BarcodeFormat[]; // Specific formats to detect (default: all)
    tryHarder?: boolean; // More thorough scanning (slower but more accurate)
    enabledFormats?: string[]; // Format names for enabling/disabling
}

// Subtitle bar configuration
export interface SubtitleBarConfig {
    position: 'top' | 'bottom';
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    fadeTime: number; // Time in ms before auto-hiding
}

// Barcode result interface
export interface BarcodeResult {
    text: string; // Decoded barcode data
    format: string; // Barcode format (e.g., 'QR_CODE', 'EAN_13')
    timestamp: number; // When the code was scanned
    rawBytes?: Uint8Array; // Raw bytes if available
    resultPoints?: Array<{ x: number; y: number }>; // Corner/finder points
}

// Performance metrics
export interface BarcodeMetrics {
    scansPerformed: number;
    successfulScans: number;
    failedScans: number;
    avgScanTime: number;
    isEnabled: boolean;
    isInitialized: boolean;
    currentFormat: string | null;
}

/**
 * BarcodeManager - Manages barcode/QR code scanning functionality
 */
export class BarcodeManager {
    private reader: BrowserMultiFormatReader | null = null;
    private isInitialized: boolean = false;
    private isEnabled: boolean = false;

    // Configuration
    private config: BarcodeConfig = {
        targetFPS: 5, // 5 scans per second (balanced performance)
        tryHarder: true, // More accurate scanning
        formats: [], // All formats by default
    };

    private subtitleConfig: SubtitleBarConfig = {
        position: 'bottom',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        textColor: '#ffffff',
        fontSize: 18,
        fadeTime: 5000, // 5 seconds
    };

    // UI Elements
    private subtitleBar: HTMLDivElement | null = null;
    private fadeTimeout: number | null = null;

    // Scanning state
    private lastScanTime: number = 0;
    private scanInterval: number;
    private currentResult: BarcodeResult | null = null;

    // Result history
    private resultHistory: BarcodeResult[] = [];
    private readonly maxHistorySize: number = 20;

    // Performance metrics
    private metrics = {
        scansPerformed: 0,
        successfulScans: 0,
        failedScans: 0,
        totalScanTime: 0,
    };

    /**
     * Constructor
     */
    constructor(config?: Partial<BarcodeConfig>, subtitleConfig?: Partial<SubtitleBarConfig>) {
        if (config) {
            this.config = { ...this.config, ...config };
        }
        if (subtitleConfig) {
            this.subtitleConfig = { ...this.subtitleConfig, ...subtitleConfig };
        }

        // Calculate scan interval from target FPS
        this.scanInterval = 1000 / this.config.targetFPS;
    }

    /**
     * Initialize the barcode scanner
     */
    async initialize(): Promise<boolean> {
        if (this.isInitialized) {
            console.log('📱 BarcodeManager already initialized');
            return true;
        }

        try {
            console.log('📱 Initializing BarcodeManager...');

            // Create ZXing reader with hints
            const hints = new Map();

            // Set formats if specified
            if (this.config.formats && this.config.formats.length > 0) {
                hints.set(DecodeHintType.POSSIBLE_FORMATS, this.config.formats);
            }

            // Enable try harder mode for more accuracy
            if (this.config.tryHarder) {
                hints.set(DecodeHintType.TRY_HARDER, true);
            }

            this.reader = new BrowserMultiFormatReader(hints);

            // Create subtitle bar UI
            this.createSubtitleBar();

            this.isInitialized = true;
            console.log('✅ BarcodeManager initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize BarcodeManager:', error);
            return false;
        }
    }

    /**
     * Toggle barcode scanning on/off
     */
    async toggle(): Promise<boolean> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        this.isEnabled = !this.isEnabled;

        if (this.isEnabled) {
            console.log('📱 Barcode scanning enabled');
        } else {
            console.log('📱 Barcode scanning disabled');
            this.hideSubtitle();
        }

        return this.isEnabled;
    }

    /**
     * Scan barcode from image element or video frame
     */
    async scanFromImage(
        imageSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
        isRealTime: boolean = false
    ): Promise<BarcodeResult | null> {
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
            const result: Result = await this.reader.decodeFromImageElement(imageSource as any);

            const scanTime = performance.now() - startTime;
            this.metrics.totalScanTime += scanTime;
            this.metrics.successfulScans++;

            // Create barcode result
            const barcodeResult: BarcodeResult = {
                text: result.getText(),
                format: BarcodeFormat[result.getBarcodeFormat()],
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

            // Update subtitle display
            if (barcodeResult.text.length > 0) {
                this.updateSubtitleText(barcodeResult);
            }

            console.log(
                `📱 Barcode detected [${barcodeResult.format}]: ${barcodeResult.text.substring(0, 50)}${barcodeResult.text.length > 50 ? '...' : ''}`
            );

            return barcodeResult;
        } catch (error) {
            // NotFoundException is expected when no barcode is found
            if (!(error instanceof NotFoundException)) {
                this.metrics.failedScans++;
                console.warn('⚠️ Barcode scan error:', error);
            }
            return null;
        }
    }

    /**
     * Scan continuously from video stream (polling-based)
     * Returns interval ID that can be cleared with stopScanning()
     */
    startVideoScanning(
        videoElement: HTMLVideoElement,
        callback: (result: BarcodeResult) => void,
        intervalMs: number = 200
    ): number {
        if (!this.reader || !this.isEnabled) {
            return -1;
        }

        const scanInterval = window.setInterval(async () => {
            try {
                const result = await this.reader!.decodeFromVideoElement(videoElement);

                if (result) {
                    const barcodeResult: BarcodeResult = {
                        text: result.getText(),
                        format: BarcodeFormat[result.getBarcodeFormat()],
                        timestamp: Date.now(),
                        rawBytes: result.getRawBytes(),
                        resultPoints: result.getResultPoints()?.map((point) => ({
                            x: point.getX(),
                            y: point.getY(),
                        })),
                    };

                    this.currentResult = barcodeResult;
                    this.addToHistory(barcodeResult);
                    this.updateSubtitleText(barcodeResult);
                    this.metrics.successfulScans++;

                    callback(barcodeResult);
                }

                this.metrics.scansPerformed++;
            } catch (error) {
                // NotFoundException is expected when no barcode found
            }
        }, intervalMs);

        return scanInterval;
    }

    /**
     * Stop continuous scanning
     */
    stopScanning(): void {
        if (this.reader) {
            this.reader.reset();
            console.log('📱 Barcode scanning stopped');
        }
    }

    /**
     * Create subtitle bar UI element
     */
    private createSubtitleBar(): void {
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
            z-index: 9997;
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            pointer-events: none;
            word-break: break-word;
        `;

        document.body.appendChild(this.subtitleBar);
    }

    /**
     * Update subtitle text with barcode result
     */
    private updateSubtitleText(result: BarcodeResult): void {
        if (!this.subtitleBar) return;

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
    private getFormatIcon(format: string): string {
        // Map format names to icons
        const iconMap: Record<string, string> = {
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
    private hideSubtitle(): void {
        if (this.subtitleBar) {
            this.subtitleBar.style.opacity = '0';
        }
    }

    /**
     * Escape HTML to prevent XSS attacks
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Add result to history
     */
    private addToHistory(result: BarcodeResult): void {
        this.resultHistory.push(result);

        // Limit history size
        if (this.resultHistory.length > this.maxHistorySize) {
            this.resultHistory.shift();
        }
    }

    /**
     * Get result history
     */
    getHistory(): BarcodeResult[] {
        return [...this.resultHistory];
    }

    /**
     * Get current result
     */
    getCurrentResult(): BarcodeResult | null {
        return this.currentResult;
    }

    /**
     * Get performance metrics
     */
    getMetrics(): BarcodeMetrics {
        return {
            scansPerformed: this.metrics.scansPerformed,
            successfulScans: this.metrics.successfulScans,
            failedScans: this.metrics.failedScans,
            avgScanTime:
                this.metrics.scansPerformed > 0
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
    setFormats(formats: BarcodeFormat[]): void {
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
    getSupportedFormats(): string[] {
        return Object.keys(BarcodeFormat).filter((key) => isNaN(Number(key)));
    }

    /**
     * Clear result history
     */
    clearHistory(): void {
        this.resultHistory = [];
        this.currentResult = null;
        console.log('📱 Barcode history cleared');
    }

    /**
     * Cleanup resources
     */
    async cleanup(): Promise<void> {
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
    (window as any).barcodeManager = barcodeManager;
    (window as any).BarcodeManager = BarcodeManager;
}
