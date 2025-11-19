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

    constructor(
        config: Partial<OCRConfig> = {},
        subtitleConfig: Partial<SubtitleBarConfig> = {}
    ) {
        this.config = {
            language: config.language || 'eng',
            targetFPS: config.targetFPS || 1, // 1 FPS for OCR (it's slow)
            minConfidence: config.minConfidence || 60,
            debounceTime: config.debounceTime || 1000,
            ...config,
        };

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
            console.log('OCR Manager already initialized');
            return true;
        }

        try {
            console.log('🔤 Initializing Tesseract OCR worker...');
            console.log(`Language: ${this.config.language}`);

            this.worker = await Tesseract.createWorker(this.config.language, 1, {
                logger: (m: any) => {
                    if (m.status === 'loading tesseract core' || m.status === 'initializing tesseract') {
                        console.log(`📥 OCR: ${m.status}... ${Math.round((m.progress || 0) * 100)}%`);
                    }
                },
            });

            // Create subtitle display bar
            this.createSubtitleBar();

            this.isInitialized = true;
            console.log('✅ OCR Manager initialized');
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
            z-index: 9998;
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
        console.log('✅ OCR subtitle bar created');
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
            console.log('🔤 OCR enabled');
        } else {
            this.hideSubtitleBar();
            console.log('🔤 OCR disabled');
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

            // Filter by confidence
            if (ocrResult.confidence < this.config.minConfidence) {
                console.log(`OCR confidence too low: ${ocrResult.confidence.toFixed(1)}%`);
                this.isProcessing = false;
                return null;
            }

            // Update metrics
            const processTime = performance.now() - processStart;
            this.processCount++;
            this.totalProcessTime += processTime;

            // Cache result
            this.currentResult = ocrResult;
            this.addToHistory(ocrResult);

            // Update subtitle display
            if (ocrResult.text.length > 0) {
                this.updateSubtitleText(ocrResult.text, ocrResult.confidence);
            }

            console.log(`📝 OCR: "${ocrResult.text}" (${ocrResult.confidence.toFixed(1)}% confidence, ${processTime.toFixed(0)}ms)`);

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
