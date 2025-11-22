/**
 * Barcode/QR Code Manager for PoliCamera
 * Real-time barcode scanning using ZXing library
 * Supports 1D barcodes and 2D codes (QR, Data Matrix, PDF417, Aztec)
 */
export interface BarcodeConfig {
    targetFPS: number;
    formats?: any[];
    tryHarder?: boolean;
    enabledFormats?: string[];
    debugMode?: boolean;
}
export interface SubtitleBarConfig {
    position: 'top' | 'bottom';
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    fadeTime: number;
}
export interface BarcodeResult {
    text: string;
    format: string;
    timestamp: number;
    rawBytes?: Uint8Array;
    resultPoints?: Array<{
        x: number;
        y: number;
    }>;
}
export interface BarcodeMetrics {
    scansPerformed: number;
    successfulScans: number;
    failedScans: number;
    avgScanTime: number;
    isEnabled: boolean;
    isInitialized: boolean;
    currentFormat: string | null;
    scanQuality: number;
    consecutiveErrors: number;
}
/**
 * BarcodeManager - Manages barcode/QR code scanning functionality
 */
export declare class BarcodeManager {
    private reader;
    private isInitialized;
    private isEnabled;
    private config;
    private subtitleConfig;
    private subtitleBar;
    private fadeTimeout;
    private modal;
    private modalTimeout;
    private overlayCanvas;
    private overlayEnabled;
    private overlayTimeout;
    private lastScanTime;
    private scanInterval;
    private currentResult;
    private scanCanvas;
    private activeScanInterval;
    private lastDetectedText;
    private lastDetectionTime;
    private readonly duplicateDebounceMs;
    private consecutiveErrors;
    private readonly maxConsecutiveErrors;
    private scanQuality;
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
    private resultHistory;
    /**
     * Maximum number of results to keep in history
     * Limited to 20 to prevent memory leaks during extended use
     */
    private readonly maxHistorySize;
    /**
     * LocalStorage key for persisting history
     */
    private readonly storageKey;
    /**
     * Enable/disable automatic persistence
     */
    private persistenceEnabled;
    private metrics;
    private debugMode;
    /**
     * Constructor
     */
    constructor(config?: Partial<BarcodeConfig>, subtitleConfig?: Partial<SubtitleBarConfig>);
    /**
     * Initialize the barcode scanner
     */
    initialize(): Promise<boolean>;
    /**
     * Toggle barcode scanning on/off
     */
    toggle(): Promise<boolean>;
    /**
     * Show scanning indicator
     */
    private showScanningIndicator;
    /**
     * Scan barcode from image element or video frame
     */
    scanFromImage(imageSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement, isRealTime?: boolean): Promise<BarcodeResult | null>;
    /**
     * Scan continuously from video stream (polling-based)
     * Uses canvas buffer to avoid interfering with video display
     * Returns interval ID that can be cleared with stopScanning()
     */
    startVideoScanning(videoElement: HTMLVideoElement, callback: (result: BarcodeResult) => void, intervalMs?: number): number;
    /**
     * Stop continuous scanning
     */
    stopScanning(): void;
    /**
     * Check if this is a duplicate detection (debounce)
     * Prevents rapid re-detection of the same barcode
     */
    private isDuplicateDetection;
    /**
     * Trigger haptic vibration feedback for successful scan
     * Uses Vibration API if available
     */
    private triggerVibration;
    /**
     * Update scan quality metric based on success/failure
     * Uses exponential moving average for smoothing
     */
    private updateScanQuality;
    /**
     * Get current scan quality as percentage
     */
    getScanQuality(): number;
    /**
     * Handle scanner recovery after consecutive errors
     * Attempts to reinitialize the reader
     */
    private handleScannerRecovery;
    /**
     * Create subtitle bar UI element
     */
    private createSubtitleBar;
    /**
     * Create modal for displaying barcode information
     */
    private createModal;
    /**
     * Show modal with barcode result for 2 seconds
     */
    private showModal;
    /**
     * Hide the modal
     */
    private hideModal;
    /**
     * Update subtitle text with barcode result
     */
    private updateSubtitleText;
    /**
     * Get icon for barcode format
     */
    private getFormatIcon;
    /**
     * Hide subtitle bar
     */
    private hideSubtitle;
    /**
     * Escape HTML to prevent XSS attacks
     */
    private escapeHtml;
    /**
     * Set the canvas overlay for drawing barcode bounding boxes
     * This should be called from the main app to provide the detection overlay canvas
     */
    setOverlayCanvas(canvas: HTMLCanvasElement | null): void;
    /**
     * Enable or disable visual overlay of detected barcodes
     */
    setOverlayEnabled(enabled: boolean): void;
    /**
     * Draw barcode bounding box overlay on the canvas
     * Shows where the barcode was detected with a colored box and label
     */
    drawBarcodeOverlay(result: BarcodeResult, videoElement: HTMLVideoElement): void;
    /**
     * Clear the barcode overlay
     */
    clearOverlay(): void;
    /**
     * Get color for barcode format
     * All formats now use yellow/gold color scheme
     */
    private getBarcodeColor;
    /**
     * Draw rounded rectangle
     */
    private drawRoundedRect;
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
    private addToHistory;
    /**
     * Get result history
     */
    getHistory(): BarcodeResult[];
    /**
     * Get current result
     */
    getCurrentResult(): BarcodeResult | null;
    /**
     * Get performance metrics
     */
    getMetrics(): BarcodeMetrics;
    /**
     * Set enabled barcode formats
     */
    setFormats(formats: any[]): void;
    /**
     * Get list of supported formats
     */
    getSupportedFormats(): string[];
    /**
     * Clear result history
     */
    clearHistory(): void;
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
    exportHistory(): string;
    /**
     * Download history as JSON file
     *
     * Triggers a browser download of the scan history.
     * File is named with timestamp for easy organization.
     */
    downloadHistory(): void;
    /**
     * Enable automatic persistence to localStorage
     *
     * When enabled, history is automatically saved after each scan.
     * History is also restored on initialization.
     *
     * @param enabled - Whether to enable persistence
     */
    setPersistence(enabled: boolean): void;
    /**
     * Save current history to localStorage
     *
     * Stores a simplified version of the history (without raw bytes)
     * to reduce storage size.
     */
    private saveHistoryToStorage;
    /**
     * Load history from localStorage
     *
     * Restores previously saved scan results.
     * Only loads if persistence is enabled.
     */
    private loadHistoryFromStorage;
    /**
     * Clear history from both memory and storage
     */
    clearHistoryFromStorage(): void;
    /**
     * Cleanup resources
     */
    cleanup(): Promise<void>;
}
declare const barcodeManager: BarcodeManager;
export default barcodeManager;
//# sourceMappingURL=barcode-manager.d.ts.map