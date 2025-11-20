/**
 * OCR Manager for PoliCamera
 * Uses Tesseract.js for optical character recognition with subtitle-style display
 */
export interface OCRConfig {
    language: string;
    targetFPS: number;
    minConfidence: number;
    debounceTime: number;
}
export interface OCRResult {
    text: string;
    confidence: number;
    timestamp: number;
    words: Array<{
        text: string;
        confidence: number;
        bbox: {
            x0: number;
            y0: number;
            x1: number;
            y1: number;
        };
    }>;
}
export interface SubtitleBarConfig {
    position: 'top' | 'bottom';
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    padding: number;
    maxLines: number;
    fadeTime: number;
}
/**
 * OCR Manager class for real-time text recognition
 */
export declare class OCRManager {
    private worker;
    private isInitialized;
    private isEnabled;
    private isProcessing;
    private config;
    private lastProcessTime;
    private targetFrameTime;
    /**
     * OCR result storage
     * Stores the last 10 recognition results in a FIFO queue.
     *
     * Memory Management:
     * - Each OCRResult is ~2KB (text + word-level data with bounding boxes)
     * - Max 10 results = ~20KB memory footprint
     * - Smaller limit than barcode (10 vs 20) due to larger result objects
     * - Prevents unbounded memory growth during continuous OCR processing
     * - Oldest results are automatically removed when limit is reached
     */
    private currentResult;
    private resultHistory;
    /**
     * Maximum number of OCR results to keep in history
     * Limited to 10 (vs 20 for barcodes) due to larger object size
     */
    private maxHistorySize;
    /**
     * LocalStorage key for persisting history
     */
    private readonly storageKey;
    /**
     * Enable/disable automatic persistence
     */
    private persistenceEnabled;
    private subtitleBar;
    private subtitleConfig;
    private fadeTimeout;
    private processCount;
    private totalProcessTime;
    private overlayCanvas;
    private overlayEnabled;
    constructor(config?: Partial<OCRConfig>, subtitleConfig?: Partial<SubtitleBarConfig>);
    /**
     * Initialize Tesseract worker
     */
    initialize(): Promise<boolean>;
    /**
     * Create subtitle display bar element
     */
    private createSubtitleBar;
    /**
     * Toggle OCR on/off
     */
    toggle(): Promise<boolean>;
    /**
     * Process image for OCR
     */
    recognizeText(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement, isRealTime?: boolean): Promise<OCRResult | null>;
    /**
     * Add OCR result to history with automatic FIFO cleanup
     *
     * Implements a circular buffer pattern where oldest items are removed
     * when the history exceeds maxHistorySize (10 items).
     *
     * OCR results are larger than barcode results (~2KB vs ~500 bytes) due to:
     * - Word-level recognition data
     * - Bounding box coordinates for each word
     * - Confidence scores per word
     *
     * This prevents memory leaks during:
     * - Continuous text recognition sessions
     * - Real-time OCR processing
     * - Long-running camera sessions
     *
     * If persistence is enabled, also saves to localStorage.
     *
     * @param result - The OCR result to add to history
     */
    private addToHistory;
    /**
     * Update subtitle bar with recognized text
     */
    private updateSubtitleText;
    /**
     * Show subtitle bar
     */
    private showSubtitleBar;
    /**
     * Hide subtitle bar
     */
    private hideSubtitleBar;
    /**
     * Escape HTML to prevent XSS
     */
    private escapeHtml;
    /**
     * Set the canvas overlay for drawing text bounding boxes
     * This should be called from the main app to provide the detection overlay canvas
     */
    setOverlayCanvas(canvas: HTMLCanvasElement | null): void;
    /**
     * Enable or disable visual overlay of detected text
     */
    setOverlayEnabled(enabled: boolean): void;
    /**
     * Draw OCR results as overlays on the canvas
     * Shows bounding boxes and text labels where text was detected
     */
    drawTextOverlay(result: OCRResult, videoElement: HTMLVideoElement): void;
    /**
     * Clear the overlay canvas
     */
    clearOverlay(): void;
    /**
     * Get recognition history
     */
    getHistory(): OCRResult[];
    /**
     * Get current result
     */
    getCurrentResult(): OCRResult | null;
    /**
     * Get performance metrics
     */
    getMetrics(): {
        processCount: number;
        totalProcessTime: number;
        avgProcessTime: number;
        isEnabled: boolean;
        isInitialized: boolean;
        isProcessing: boolean;
    };
    /**
     * Change language
     */
    setLanguage(language: string): Promise<boolean>;
    /**
     * Export OCR history to JSON format
     *
     * Creates a structured export containing all recognition history with metadata.
     * Useful for:
     * - Text analytics and analysis
     * - Training data collection
     * - Debugging OCR patterns
     * - Backup/restore functionality
     *
     * @returns JSON string containing complete recognition history
     */
    exportHistory(): string;
    /**
     * Download OCR history as JSON file
     *
     * Triggers a browser download of the recognition history.
     * File is named with timestamp for easy organization.
     */
    downloadHistory(): void;
    /**
     * Enable automatic persistence to localStorage
     *
     * When enabled, history is automatically saved after each recognition.
     * History is also restored on initialization.
     *
     * @param enabled - Whether to enable persistence
     */
    setPersistence(enabled: boolean): void;
    /**
     * Save current history to localStorage
     *
     * Stores the recognition history to persist across sessions.
     * Automatically handles storage quota exceeded errors.
     */
    private saveHistoryToStorage;
    /**
     * Load history from localStorage
     *
     * Restores previously saved recognition results.
     * Only loads if persistence is enabled.
     */
    private loadHistoryFromStorage;
    /**
     * Clear recognition history from memory and storage
     */
    clearHistory(): void;
    /**
     * Clear history from both memory and storage
     */
    private clearHistoryFromStorage;
    /**
     * Cleanup resources
     */
    cleanup(): Promise<void>;
}
declare const ocrManager: OCRManager;
export default ocrManager;
//# sourceMappingURL=ocr-manager.d.ts.map