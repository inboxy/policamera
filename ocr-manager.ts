/**
 * OCR Manager for PoliCamera
 * Uses Tesseract.js for optical character recognition with subtitle-style display
 */

// Declare global Tesseract from CDN script
declare const Tesseract: {
    createWorker(...args: any[]): Promise<any>;
    Worker: any;
    RecognizeResult: any;
};

export interface OCRConfig {
    language: string;
    targetFPS: number;
    minConfidence: number;
    debounceTime: number;
    debugMode?: boolean;
}

export interface OCRResult {
    text: string;
    confidence: number;
    timestamp: number;
    words: Array<{
        text: string;
        confidence: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
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
export class OCRManager {
    private worker: any | null = null;
    private isInitialized: boolean = false;
    private isEnabled: boolean = false;
    private isProcessing: boolean = false;

    private config: OCRConfig;
    private lastProcessTime: number = 0;
    private targetFrameTime: number;

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
    private currentResult: OCRResult | null = null;
    private resultHistory: OCRResult[] = [];

    /**
     * Maximum number of OCR results to keep in history
     * Limited to 10 (vs 20 for barcodes) due to larger object size
     */
    private maxHistorySize: number = 10;

    /**
     * LocalStorage key for persisting history
     */
    private readonly storageKey: string = 'policamera-ocr-history';

    /**
     * Enable/disable automatic persistence
     */
    private persistenceEnabled: boolean = false;

    // Subtitle display
    private subtitleBar: HTMLDivElement | null = null;
    private subtitleConfig: SubtitleBarConfig;
    private fadeTimeout: number | null = null;

    // Performance metrics
    private processCount: number = 0;
    private totalProcessTime: number = 0;

    // Canvas overlay for drawing text bounding boxes
    private overlayCanvas: HTMLCanvasElement | null = null;
    private overlayEnabled: boolean = true;
    private overlayTimeout: number | null = null;
    private displayResult: OCRResult | null = null; // Result to display on overlay
    private debugMode: boolean = false; // Control console logging for performance

    constructor(
        config: Partial<OCRConfig> = {},
        subtitleConfig: Partial<SubtitleBarConfig> = {}
    ) {
        this.config = {
            language: config.language || 'eng',
            targetFPS: config.targetFPS || 1, // 1 FPS for OCR (it's slow)
            minConfidence: config.minConfidence || 60,
            debounceTime: config.debounceTime || 1000,
            debugMode: config.debugMode || false,
            ...config,
        };

        this.debugMode = this.config.debugMode || false;
        this.targetFrameTime = 1000 / this.config.targetFPS;

        this.subtitleConfig = {
            position: subtitleConfig.position || 'bottom',
            backgroundColor: subtitleConfig.backgroundColor || 'rgba(0, 0, 0, 0.85)',
            textColor: subtitleConfig.textColor || '#FFFFFF',
            fontSize: subtitleConfig.fontSize || 18,
            padding: subtitleConfig.padding || 16,
            maxLines: subtitleConfig.maxLines || 3,
            fadeTime: subtitleConfig.fadeTime || 5000,
            ...subtitleConfig,
        };
    }

    /**
     * Initialize Tesseract worker
     */
    async initialize(): Promise<boolean> {
        if (this.isInitialized) {
            if (this.debugMode) {
                console.log('OCR Manager already initialized');
            }
            return true;
        }

        try {
            if (this.debugMode) {
                console.log('🔤 Initializing Tesseract OCR worker...');
                console.log(`Language: ${this.config.language}`);
            }

            this.worker = await Tesseract.createWorker(this.config.language, 1, {
                logger: (m: any) => {
                    if (this.debugMode && (m.status === 'loading tesseract core' || m.status === 'initializing tesseract')) {
                        console.log(`📥 OCR: ${m.status}... ${Math.round((m.progress || 0) * 100)}%`);
                    }
                },
            });

            // Create subtitle display bar
            this.createSubtitleBar();

            this.isInitialized = true;
            if (this.debugMode) {
                console.log('✅ OCR Manager initialized');
            }
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize OCR:', error);
            this.isInitialized = false;
            return false;
        }
    }

    /**
     * Create subtitle display bar element
     */
    private createSubtitleBar(): void {
        if (this.subtitleBar) {
            return;
        }

        this.subtitleBar = document.createElement('div');
        this.subtitleBar.id = 'ocr-subtitle-bar';
        this.subtitleBar.style.cssText = `
            position: fixed;
            ${this.subtitleConfig.position}: 0;
            left: 0;
            right: 0;
            background: ${this.subtitleConfig.backgroundColor};
            color: ${this.subtitleConfig.textColor};
            font-size: ${this.subtitleConfig.fontSize}px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-weight: 500;
            padding: ${this.subtitleConfig.padding}px;
            text-align: center;
            z-index: 10001;
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
            pointer-events: none;
            display: none;
            line-height: 1.5;
            max-height: ${this.subtitleConfig.maxLines * this.subtitleConfig.fontSize * 1.5}px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        `;

        document.body.appendChild(this.subtitleBar);
        if (this.debugMode) {
            console.log('✅ OCR subtitle bar created');
        }
    }

    /**
     * Toggle OCR on/off
     */
    async toggle(): Promise<boolean> {
        if (!this.isInitialized) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Failed to initialize OCR');
            }
        }

        this.isEnabled = !this.isEnabled;

        if (this.isEnabled) {
            this.showSubtitleBar();
            if (this.debugMode) {
                console.log('🔤 OCR enabled');
            }
        } else {
            this.hideSubtitleBar();
            if (this.debugMode) {
                console.log('🔤 OCR disabled');
            }
        }

        return this.isEnabled;
    }

    /**
     * Process image for OCR
     */
    async recognizeText(
        imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
        isRealTime: boolean = false
    ): Promise<OCRResult | null> {
        if (!this.isInitialized || !this.worker || !this.isEnabled) {
            return null;
        }

        // Frame throttling for real-time performance
        if (isRealTime) {
            const currentTime = performance.now();
            if (currentTime - this.lastProcessTime < this.targetFrameTime && this.currentResult !== null) {
                return this.currentResult; // Return cached result
            }

            // Skip if already processing
            if (this.isProcessing) {
                return this.currentResult;
            }

            this.lastProcessTime = currentTime;
        }

        this.isProcessing = true;
        const processStart = performance.now();

        try {
            // Recognize text
            const result: any = await this.worker.recognize(imageElement);

            // Process results
            const ocrResult: OCRResult = {
                text: result.data.text.trim(),
                confidence: result.data.confidence,
                timestamp: Date.now(),
                words: result.data.words.map((word: any) => ({
                    text: word.text,
                    confidence: word.confidence,
                    bbox: word.bbox,
                })),
            };

            // Log detection details for debugging
            if (this.debugMode) {
                console.log(`📝 OCR detected ${ocrResult.words.length} words, overall confidence: ${ocrResult.confidence.toFixed(1)}%`);
                if (ocrResult.words.length > 0 && ocrResult.words[0]) {
                    console.log(`   First word: "${ocrResult.words[0].text}" at confidence ${ocrResult.words[0].confidence.toFixed(1)}%`);
                    console.log(`   Bbox:`, ocrResult.words[0].bbox);
                }
            }

            // Filter words by confidence (not overall result)
            const highConfidenceWords = ocrResult.words.filter(word => word.confidence >= this.config.minConfidence);

            if (highConfidenceWords.length === 0) {
                if (this.debugMode) {
                    console.log(`OCR: No words above ${this.config.minConfidence}% confidence threshold`);
                }
                this.isProcessing = false;
                return null;
            }

            // Update the result to only include high-confidence words
            ocrResult.words = highConfidenceWords;
            if (this.debugMode) {
                console.log(`📝 OCR: Showing ${highConfidenceWords.length} words above confidence threshold`);
            }

            // Update metrics
            const processTime = performance.now() - processStart;
            this.processCount++;
            this.totalProcessTime += processTime;

            // Cache result
            this.currentResult = ocrResult;
            this.addToHistory(ocrResult);

            // Store result for display (will be shown for 2 seconds)
            this.displayResult = ocrResult;

            // Update subtitle display (show even if text is empty to provide feedback)
            if (ocrResult.text.length > 0) {
                this.updateSubtitleText(ocrResult.text, ocrResult.confidence);
            } else if (highConfidenceWords.length > 0) {
                // If we have words but no combined text, show the words
                const wordsText = highConfidenceWords.map(w => w.text).join(' ');
                this.updateSubtitleText(wordsText, ocrResult.confidence);
            }

            // Auto-clear display result after 2 seconds
            if (this.overlayTimeout) {
                clearTimeout(this.overlayTimeout);
            }
            this.overlayTimeout = window.setTimeout(() => {
                this.displayResult = null;
                if (this.debugMode) {
                    console.log('🔤 OCR overlay cleared after 2 seconds');
                }
            }, 2000);

            if (this.debugMode) {
                console.log(`📝 OCR complete: "${ocrResult.text.substring(0, 50)}${ocrResult.text.length > 50 ? '...' : ''}" (${ocrResult.confidence.toFixed(1)}% confidence, ${processTime.toFixed(0)}ms, ${highConfidenceWords.length} words)`);
            }

            this.isProcessing = false;
            return ocrResult;
        } catch (error) {
            console.error('OCR recognition failed:', error);
            this.isProcessing = false;
            return null;
        }
    }

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
    private addToHistory(result: OCRResult): void {
        this.resultHistory.push(result);

        // FIFO cleanup: Remove oldest when exceeding limit
        if (this.resultHistory.length > this.maxHistorySize) {
            this.resultHistory.shift();
        }

        // Save to storage if persistence enabled
        this.saveHistoryToStorage();
    }

    /**
     * Update subtitle bar with recognized text
     */
    private updateSubtitleText(text: string, confidence: number): void {
        if (!this.subtitleBar || !this.isEnabled) {
            return;
        }

        // Clear previous fade timeout
        if (this.fadeTimeout) {
            clearTimeout(this.fadeTimeout);
        }

        // Update text with confidence indicator
        const confidenceIndicator = confidence >= 90 ? '●' : confidence >= 75 ? '◐' : '○';
        this.subtitleBar.innerHTML = `
            <div style="display: inline-flex; align-items: center; gap: 8px;">
                <span style="opacity: 0.7; font-size: 12px;">${confidenceIndicator} OCR</span>
                <span>${this.escapeHtml(text)}</span>
                <span style="opacity: 0.5; font-size: 12px;">${confidence.toFixed(0)}%</span>
            </div>
        `;

        // Show subtitle
        this.subtitleBar.style.display = 'block';
        this.subtitleBar.style.opacity = '1';

        // Auto-hide after fadeTime
        this.fadeTimeout = window.setTimeout(() => {
            this.hideSubtitleBar();
        }, this.subtitleConfig.fadeTime);
    }

    /**
     * Show subtitle bar
     */
    private showSubtitleBar(): void {
        if (this.subtitleBar) {
            // Show a "scanning" indicator when OCR is enabled but no text detected yet
            this.subtitleBar.innerHTML = `
                <div style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="opacity: 0.7; font-size: 12px;">🔤 OCR</span>
                    <span style="opacity: 0.6;">Scanning for text...</span>
                </div>
            `;
            this.subtitleBar.style.display = 'block';
            requestAnimationFrame(() => {
                if (this.subtitleBar) {
                    this.subtitleBar.style.opacity = '1';
                }
            });
        }
    }

    /**
     * Hide subtitle bar
     */
    private hideSubtitleBar(): void {
        if (this.subtitleBar) {
            this.subtitleBar.style.opacity = '0';
            setTimeout(() => {
                if (this.subtitleBar && !this.isEnabled) {
                    this.subtitleBar.style.display = 'none';
                }
            }, 300);
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Set the canvas overlay for drawing text bounding boxes
     * This should be called from the main app to provide the detection overlay canvas
     */
    setOverlayCanvas(canvas: HTMLCanvasElement | null): void {
        this.overlayCanvas = canvas;
    }

    /**
     * Enable or disable visual overlay of detected text
     */
    setOverlayEnabled(enabled: boolean): void {
        this.overlayEnabled = enabled;
    }

    /**
     * Draw OCR results as overlays on the canvas
     * Shows bounding boxes and text labels where text was detected
     */
    drawTextOverlay(result: OCRResult, videoElement: HTMLVideoElement): void {
        if (!this.overlayCanvas || !this.overlayEnabled || !result.words || result.words.length === 0) {
            if (this.debugMode) {
                console.log('🔤 OCR overlay skipped: canvas=', !!this.overlayCanvas, 'enabled=', this.overlayEnabled, 'words=', result.words?.length);
            }
            return;
        }

        const ctx = this.overlayCanvas.getContext('2d');
        if (!ctx) {
            if (this.debugMode) {
                console.log('🔤 OCR overlay skipped: no canvas context');
            }
            return;
        }

        if (this.debugMode) {
            console.log(`🔤 Drawing OCR overlay for ${result.words.length} words on canvas ${this.overlayCanvas.width}x${this.overlayCanvas.height}`);
        }

        // Calculate scale factors between video and canvas
        const scaleX = this.overlayCanvas.width / videoElement.videoWidth;
        const scaleY = this.overlayCanvas.height / videoElement.videoHeight;

        console.log(`🔤 Scale factors: scaleX=${scaleX.toFixed(2)}, scaleY=${scaleY.toFixed(2)}`);

        let wordsDrawn = 0;

        // Draw each word with its bounding box
        result.words.forEach((word, index) => {
            // Skip low confidence words (already filtered, but double check)
            if (word.confidence < this.config.minConfidence) {
                return;
            }

            const bbox = word.bbox;

            // Validate bbox structure
            if (!bbox || typeof bbox.x0 !== 'number' || typeof bbox.y0 !== 'number') {
                console.warn(`⚠️ Invalid bbox for word "${word.text}":`, bbox);
                return;
            }

            // Scale bounding box coordinates to canvas size
            const x = bbox.x0 * scaleX;
            const y = bbox.y0 * scaleY;
            const width = (bbox.x1 - bbox.x0) * scaleX;
            const height = (bbox.y1 - bbox.y0) * scaleY;

            if (index === 0) {
                console.log(`🔤 First word "${word.text}": bbox[${bbox.x0},${bbox.y0},${bbox.x1},${bbox.y1}] -> canvas[${x.toFixed(0)},${y.toFixed(0)},${width.toFixed(0)}x${height.toFixed(0)}]`);
            }

            // Skip if box is too small or invalid
            if (!this.overlayCanvas || width < 5 || height < 5 || width > this.overlayCanvas.width || height > this.overlayCanvas.height) {
                console.warn(`⚠️ Invalid box size for "${word.text}": ${width}x${height}`);
                return;
            }

            // Draw bounding box with confidence-based color
            const confidence = word.confidence;
            let strokeColor: string;
            if (confidence >= 90) {
                strokeColor = '#00FF00'; // Green for high confidence
            } else if (confidence >= 75) {
                strokeColor = '#FFFF00'; // Yellow for medium confidence
            } else {
                strokeColor = '#FF8800'; // Orange for lower confidence
            }

            // Draw box with glow effect
            ctx.shadowColor = strokeColor;
            ctx.shadowBlur = 8;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, width, height);
            ctx.shadowBlur = 0;

            // Draw semi-transparent background for text label
            const textPadding = 6;
            const fontSize = Math.max(14, Math.min(24, height * 0.8));
            ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

            // Measure text width
            const textMetrics = ctx.measureText(word.text);
            const textWidth = textMetrics.width;
            const textHeight = fontSize;

            // Position label above the box
            const labelX = x;
            const labelY = Math.max(textHeight + textPadding * 2, y - 4);

            // Draw background for text with gradient
            const gradient = ctx.createLinearGradient(labelX, labelY - textHeight - textPadding, labelX, labelY);
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
            gradient.addColorStop(1, 'rgba(20, 20, 20, 0.95)');
            ctx.fillStyle = gradient;
            ctx.fillRect(labelX - textPadding, labelY - textHeight - textPadding, textWidth + textPadding * 2, textHeight + textPadding * 2);

            // Draw text label border
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(labelX - textPadding, labelY - textHeight - textPadding, textWidth + textPadding * 2, textHeight + textPadding * 2);

            // Draw text
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(word.text, labelX, labelY - textPadding);

            wordsDrawn++;
        });

        console.log(`✅ OCR overlay complete: drew ${wordsDrawn} words`);
    }

    /**
     * Clear the overlay canvas
     */
    clearOverlay(): void {
        // Clear the display result so it won't be redrawn
        this.displayResult = null;
        if (this.overlayTimeout) {
            clearTimeout(this.overlayTimeout);
            this.overlayTimeout = null;
        }
    }

    /**
     * Get the current result to display (may be null if timeout expired)
     */
    getDisplayResult(): OCRResult | null {
        return this.displayResult;
    }

    /**
     * Get recognition history
     */
    getHistory(): OCRResult[] {
        return [...this.resultHistory];
    }

    /**
     * Get current result
     */
    getCurrentResult(): OCRResult | null {
        return this.currentResult;
    }

    /**
     * Get performance metrics
     */
    getMetrics() {
        const avgProcessTime = this.processCount > 0 ? this.totalProcessTime / this.processCount : 0;

        return {
            processCount: this.processCount,
            totalProcessTime: this.totalProcessTime,
            avgProcessTime: avgProcessTime,
            isEnabled: this.isEnabled,
            isInitialized: this.isInitialized,
            isProcessing: this.isProcessing,
        };
    }

    /**
     * Change language
     */
    async setLanguage(language: string): Promise<boolean> {
        if (!this.isInitialized || !this.worker) {
            return false;
        }

        try {
            console.log(`🔤 Changing OCR language to: ${language}`);
            await (this.worker as any).loadLanguage(language);
            await (this.worker as any).initialize(language);
            this.config.language = language;
            console.log('✅ OCR language changed');
            return true;
        } catch (error) {
            console.error('Failed to change OCR language:', error);
            return false;
        }
    }

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
    exportHistory(): string {
        const exportData = {
            exportVersion: '1.0',
            timestamp: new Date().toISOString(),
            device: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
            },
            ocr: {
                language: this.config.language,
                maxHistorySize: this.maxHistorySize,
                currentHistorySize: this.resultHistory.length,
                targetFPS: this.config.targetFPS,
                minConfidence: this.config.minConfidence,
            },
            metrics: this.getMetrics(),
            history: this.resultHistory.map(result => ({
                text: result.text,
                confidence: result.confidence,
                timestamp: result.timestamp,
                timestampISO: new Date(result.timestamp).toISOString(),
                wordCount: result.words.length,
                words: result.words.map(word => ({
                    text: word.text,
                    confidence: word.confidence,
                    bbox: word.bbox,
                })),
            })),
        };

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Download OCR history as JSON file
     *
     * Triggers a browser download of the recognition history.
     * File is named with timestamp for easy organization.
     */
    downloadHistory(): void {
        try {
            const jsonData = this.exportHistory();
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `ocr-history-${Date.now()}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            console.log('📥 OCR history downloaded');
        } catch (error) {
            console.error('Failed to download OCR history:', error);
        }
    }

    /**
     * Enable automatic persistence to localStorage
     *
     * When enabled, history is automatically saved after each recognition.
     * History is also restored on initialization.
     *
     * @param enabled - Whether to enable persistence
     */
    setPersistence(enabled: boolean): void {
        this.persistenceEnabled = enabled;
        console.log(`🔤 OCR history persistence ${enabled ? 'enabled' : 'disabled'}`);

        if (enabled) {
            // Load existing history
            this.loadHistoryFromStorage();
        }
    }

    /**
     * Save current history to localStorage
     *
     * Stores the recognition history to persist across sessions.
     * Automatically handles storage quota exceeded errors.
     */
    private saveHistoryToStorage(): void {
        if (!this.persistenceEnabled) return;

        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.resultHistory));
        } catch (error) {
            console.warn('Failed to save OCR history to storage:', error);
            // Disable persistence if storage is full
            if (error instanceof Error && error.name === 'QuotaExceededError') {
                this.persistenceEnabled = false;
                console.warn('Storage quota exceeded - OCR persistence disabled');
            }
        }
    }

    /**
     * Load history from localStorage
     *
     * Restores previously saved recognition results.
     * Only loads if persistence is enabled.
     */
    private loadHistoryFromStorage(): void {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return;

            const history = JSON.parse(stored) as OCRResult[];
            // Validate and restore history
            if (Array.isArray(history)) {
                this.resultHistory = history.slice(-this.maxHistorySize);
                console.log(`🔤 Loaded ${this.resultHistory.length} OCR results from storage`);
            }
        } catch (error) {
            console.warn('Failed to load OCR history from storage:', error);
        }
    }

    /**
     * Clear recognition history from memory and storage
     */
    clearHistory(): void {
        this.resultHistory = [];
        this.currentResult = null;
        this.clearHistoryFromStorage();
        console.log('🔤 OCR history cleared');
    }

    /**
     * Clear history from both memory and storage
     */
    private clearHistoryFromStorage(): void {
        try {
            localStorage.removeItem(this.storageKey);
            console.log('🔤 OCR history cleared from storage');
        } catch (error) {
            console.warn('Failed to clear OCR storage:', error);
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup(): Promise<void> {
        console.log('🧹 Cleaning up OCR resources...');

        this.isEnabled = false;
        this.isProcessing = false;

        if (this.fadeTimeout) {
            clearTimeout(this.fadeTimeout);
        }

        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }

        if (this.subtitleBar) {
            this.subtitleBar.remove();
            this.subtitleBar = null;
        }

        this.currentResult = null;
        this.resultHistory = [];
        this.isInitialized = false;
        this.lastProcessTime = 0;

        console.log('✅ OCR cleanup complete');
    }
}

// Create global instance
const ocrManager = new OCRManager();

// Export for modules
export default ocrManager;

// Add to window for non-module usage
if (typeof window !== 'undefined') {
    (window as any).ocrManager = ocrManager;
    (window as any).OCRManager = OCRManager;
}
