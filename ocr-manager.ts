/**
 * OCR Manager for PoliCamera
 * Uses Tesseract.js for optical character recognition with subtitle-style display
 */

import { createWorker, Worker, RecognizeResult } from 'tesseract.js';

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
    private worker: Worker | null = null;
    private isInitialized: boolean = false;
    private isEnabled: boolean = false;
    private isProcessing: boolean = false;

    private config: OCRConfig;
    private lastProcessTime: number = 0;
    private targetFrameTime: number;

    // OCR results
    private currentResult: OCRResult | null = null;
    private resultHistory: OCRResult[] = [];
    private maxHistorySize: number = 10;

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

            this.worker = await createWorker(this.config.language, 1, {
                logger: (m) => {
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
            if (currentTime - this.lastProcessTime < this.targetFrameTime) {
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
            const result: RecognizeResult = await this.worker.recognize(imageElement);

            // Process results
            const ocrResult: OCRResult = {
                text: result.data.text.trim(),
                confidence: result.data.confidence,
                timestamp: Date.now(),
                words: result.data.words.map((word) => ({
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
     * Add result to history
     */
    private addToHistory(result: OCRResult): void {
        this.resultHistory.push(result);

        if (this.resultHistory.length > this.maxHistorySize) {
            this.resultHistory.shift();
        }
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
            await this.worker.loadLanguage(language);
            await this.worker.initialize(language);
            this.config.language = language;
            console.log('✅ OCR language changed');
            return true;
        } catch (error) {
            console.error('Failed to change OCR language:', error);
            return false;
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
