/**
 * Tests for OCRManager
 */

import { OCRManager, OCRConfig, SubtitleBarConfig } from '../ocr-manager';

// Mock Tesseract - must be before imports due to hoisting
const mockRecognize = jest.fn();
const mockLoadLanguage = jest.fn();
const mockInitialize = jest.fn();
const mockTerminate = jest.fn();

const mockWorker = {
    loadLanguage: mockLoadLanguage,
    initialize: mockInitialize,
    recognize: mockRecognize,
    terminate: mockTerminate,
};

jest.mock('tesseract.js', () => ({
    createWorker: jest.fn(() => Promise.resolve(mockWorker)),
}));

describe('OCRManager', () => {
    let ocrManager: OCRManager;

    beforeEach(() => {
        // Clear mocks
        jest.clearAllMocks();

        // Set up default mock implementations
        mockLoadLanguage.mockResolvedValue(undefined);
        mockInitialize.mockResolvedValue(undefined);
        mockTerminate.mockResolvedValue(undefined);
        mockRecognize.mockResolvedValue({
            data: {
                text: 'Sample OCR Text',
                confidence: 85,
                words: [
                    {
                        text: 'Sample',
                        confidence: 90,
                        bbox: { x0: 0, y0: 0, x1: 50, y1: 20 },
                    },
                    {
                        text: 'OCR',
                        confidence: 80,
                        bbox: { x0: 55, y0: 0, x1: 80, y1: 20 },
                    },
                ],
            },
        });

        // Create new instance for each test
        ocrManager = new OCRManager();

        // Clear any existing subtitle bars from previous tests
        const existingBar = document.getElementById('ocr-subtitle-bar');
        if (existingBar) {
            existingBar.remove();
        }
    });

    afterEach(async () => {
        // Cleanup after each test
        await ocrManager.cleanup();
    });

    describe('Initialization', () => {
        test('should initialize with default config', () => {
            expect(ocrManager).toBeDefined();
        });

        test('should initialize Tesseract worker', async () => {
            const result = await ocrManager.initialize();
            expect(result).toBe(true);
        });

        test('should not re-initialize if already initialized', async () => {
            await ocrManager.initialize();
            const result = await ocrManager.initialize();
            expect(result).toBe(true);
        });

        test('should create subtitle bar on initialization', async () => {
            await ocrManager.initialize();
            const subtitleBar = document.getElementById('ocr-subtitle-bar');
            expect(subtitleBar).toBeTruthy();
        });

        test('should accept custom configuration', () => {
            const customConfig: Partial<OCRConfig> = {
                language: 'fra',
                targetFPS: 2,
                minConfidence: 70,
            };
            const customManager = new OCRManager(customConfig);
            expect(customManager).toBeDefined();
        });
    });

    describe('Toggle Functionality', () => {
        test('should toggle OCR on', async () => {
            const result = await ocrManager.toggle();
            expect(result).toBe(true);
        });

        test('should toggle OCR off', async () => {
            await ocrManager.toggle(); // On
            const result = await ocrManager.toggle(); // Off
            expect(result).toBe(false);
        });

        test('should initialize if not initialized on toggle', async () => {
            const result = await ocrManager.toggle();
            expect(result).toBe(true);
        });
    });

    describe('Text Recognition', () => {
        beforeEach(async () => {
            await ocrManager.initialize();
            await ocrManager.toggle(); // Enable OCR
        });

        test('should recognize text from image', async () => {
            const mockImage = document.createElement('img');
            const result = await ocrManager.recognizeText(mockImage);

            expect(result).toBeTruthy();
            expect(result?.text).toBe('Sample OCR Text');
            expect(result?.confidence).toBeGreaterThan(0);
        });

        test('should return null if OCR is disabled', async () => {
            await ocrManager.toggle(); // Disable (it was enabled by beforeEach)
            const mockImage = document.createElement('img');
            const result = await ocrManager.recognizeText(mockImage);

            expect(result).toBeNull();

            // Re-enable for next tests
            await ocrManager.toggle();
        });

        test('should throttle real-time recognition', async () => {
            // Verify OCR is enabled
            const metrics = ocrManager.getMetrics();
            expect(metrics.isEnabled).toBe(true);
            expect(metrics.isInitialized).toBe(true);

            const mockImage = document.createElement('img');

            // First call should process
            const result1 = await ocrManager.recognizeText(mockImage, true);
            expect(result1).toBeTruthy();

            // Immediate second call should return cached result (within throttle window)
            const result2 = await ocrManager.recognizeText(mockImage, true);
            expect(result2).toBe(result1);
        });

        test('should update subtitle bar with recognized text', async () => {
            const mockImage = document.createElement('img');
            await ocrManager.recognizeText(mockImage);

            const subtitleBar = document.getElementById('ocr-subtitle-bar');
            expect(subtitleBar?.textContent).toContain('Sample OCR Text');
        });

        test('should handle recognition errors gracefully', async () => {
            // Mock error in recognition
            mockRecognize.mockRejectedValueOnce(new Error('Recognition failed'));

            const mockImage = document.createElement('img');
            const result = await ocrManager.recognizeText(mockImage);

            expect(result).toBeNull();
        });
    });

    describe('Result History', () => {
        beforeEach(async () => {
            await ocrManager.initialize();
            await ocrManager.toggle();
        });

        test('should store recognition results in history', async () => {
            const mockImage = document.createElement('img');
            const result = await ocrManager.recognizeText(mockImage);

            // Result should not be null
            expect(result).toBeTruthy();
            expect(result?.text).toBe('Sample OCR Text');

            const history = ocrManager.getHistory();
            expect(history.length).toBe(1);
            expect(history[0].text).toBe('Sample OCR Text');
        });

        test('should limit history size', async () => {
            const mockImage = document.createElement('img');

            // Add more than max history size (10)
            for (let i = 0; i < 15; i++) {
                await ocrManager.recognizeText(mockImage);
                // Add small delay to ensure different timestamps
                await new Promise((resolve) => setTimeout(resolve, 10));
            }

            const history = ocrManager.getHistory();
            expect(history.length).toBeLessThanOrEqual(10);
        });

        test('should get current result', async () => {
            const mockImage = document.createElement('img');
            await ocrManager.recognizeText(mockImage);

            const current = ocrManager.getCurrentResult();
            expect(current).toBeTruthy();
            expect(current?.text).toBe('Sample OCR Text');
        });
    });

    describe('Performance Metrics', () => {
        beforeEach(async () => {
            await ocrManager.initialize();
            await ocrManager.toggle();
        });

        test('should track performance metrics', async () => {
            const mockImage = document.createElement('img');
            await ocrManager.recognizeText(mockImage);

            const metrics = ocrManager.getMetrics();
            expect(metrics.processCount).toBe(1);
            expect(metrics.avgProcessTime).toBeGreaterThan(0);
            expect(metrics.isEnabled).toBe(true);
            expect(metrics.isInitialized).toBe(true);
        });

        test('should calculate average process time', async () => {
            const mockImage = document.createElement('img');

            await ocrManager.recognizeText(mockImage);
            await new Promise((resolve) => setTimeout(resolve, 100));
            await ocrManager.recognizeText(mockImage);

            const metrics = ocrManager.getMetrics();
            expect(metrics.processCount).toBe(2);
            expect(metrics.avgProcessTime).toBeGreaterThan(0);
        });
    });

    describe('Language Management', () => {
        beforeEach(async () => {
            await ocrManager.initialize();
        });

        test('should change language', async () => {
            const result = await ocrManager.setLanguage('fra');
            expect(result).toBe(true);
        });

        test('should handle language change errors', async () => {
            mockWorker.loadLanguage.mockRejectedValueOnce(new Error('Language not found'));

            const result = await ocrManager.setLanguage('invalid');
            expect(result).toBe(false);
        });
    });

    describe('Subtitle Bar', () => {
        beforeEach(async () => {
            await ocrManager.initialize();
        });

        test('should create subtitle bar with correct styles', () => {
            const subtitleBar = document.getElementById('ocr-subtitle-bar');
            expect(subtitleBar).toBeTruthy();
            expect(subtitleBar?.style.position).toBe('fixed');
            expect(subtitleBar?.style.zIndex).toBe('9998');
        });

        test('should position subtitle bar at bottom by default', () => {
            const subtitleBar = document.getElementById('ocr-subtitle-bar');
            expect(subtitleBar?.style.bottom).toBe('0px');
        });

        test('should position subtitle bar at top if configured', async () => {
            // Clean up existing subtitle bar first
            const existing = document.getElementById('ocr-subtitle-bar');
            if (existing) {
                existing.remove();
            }

            const customManager = new OCRManager({}, { position: 'top' });
            await customManager.initialize();

            const subtitleBar = document.getElementById('ocr-subtitle-bar');
            // Check that cssText contains "top: 0" and not "bottom: 0"
            expect(subtitleBar?.style.cssText).toContain('top: 0');
            expect(subtitleBar?.style.cssText).not.toContain('bottom: 0');

            await customManager.cleanup();
        });

        test('should show confidence indicator', async () => {
            await ocrManager.toggle();
            const mockImage = document.createElement('img');
            await ocrManager.recognizeText(mockImage);

            const subtitleBar = document.getElementById('ocr-subtitle-bar');
            expect(subtitleBar?.textContent).toContain('85%');
        });
    });

    describe('Cleanup', () => {
        test('should cleanup all resources', async () => {
            await ocrManager.initialize();
            await ocrManager.toggle();

            await ocrManager.cleanup();

            const metrics = ocrManager.getMetrics();
            expect(metrics.isEnabled).toBe(false);
            expect(metrics.isInitialized).toBe(false);

            const subtitleBar = document.getElementById('ocr-subtitle-bar');
            expect(subtitleBar).toBeNull();
        });

        test('should terminate worker on cleanup', async () => {
            await ocrManager.initialize();

            await ocrManager.cleanup();

            expect(mockWorker.terminate).toHaveBeenCalled();
        });

        test('should clear results on cleanup', async () => {
            await ocrManager.initialize();
            await ocrManager.toggle();

            const mockImage = document.createElement('img');
            await ocrManager.recognizeText(mockImage);

            await ocrManager.cleanup();

            expect(ocrManager.getCurrentResult()).toBeNull();
            expect(ocrManager.getHistory()).toEqual([]);
        });
    });

    describe('XSS Protection', () => {
        beforeEach(async () => {
            await ocrManager.initialize();
            await ocrManager.toggle();
        });

        test('should escape HTML in recognized text', async () => {
            // Mock result with HTML
            mockWorker.recognize.mockResolvedValueOnce({
                data: {
                    text: '<script>alert("xss")</script>',
                    confidence: 85,
                    words: [],
                },
            });

            const mockImage = document.createElement('img');
            await ocrManager.recognizeText(mockImage);

            const subtitleBar = document.getElementById('ocr-subtitle-bar');
            // Should not contain actual script tags
            expect(subtitleBar?.innerHTML).not.toContain('<script>');
            // Should contain escaped version in HTML
            expect(subtitleBar?.innerHTML).toContain('&lt;script&gt;');
        });
    });
});
