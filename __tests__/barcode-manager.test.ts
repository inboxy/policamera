/**
 * Tests for BarcodeManager
 */

import { BarcodeManager, BarcodeConfig, SubtitleBarConfig } from '../barcode-manager';
import { BarcodeFormat } from '@zxing/library';

// Mock ZXing library
jest.mock('@zxing/library', () => {
    const actualModule = jest.requireActual('@zxing/library');

    class MockResult {
        private text: string;
        private format: number;
        private rawBytes: Uint8Array;
        private resultPoints: Array<{ getX: () => number; getY: () => number }>;

        constructor(
            text: string,
            format: number,
            rawBytes?: Uint8Array,
            points?: Array<{ x: number; y: number }>
        ) {
            this.text = text;
            this.format = format;
            this.rawBytes = rawBytes || new Uint8Array([]);
            this.resultPoints =
                points?.map((p) => ({
                    getX: () => p.x,
                    getY: () => p.y,
                })) || [];
        }

        getText() {
            return this.text;
        }
        getBarcodeFormat() {
            return this.format;
        }
        getRawBytes() {
            return this.rawBytes;
        }
        getResultPoints() {
            return this.resultPoints;
        }
    }

    return {
        ...actualModule,
        BrowserMultiFormatReader: jest.fn().mockImplementation(() => ({
            decodeFromImageElement: jest.fn().mockResolvedValue(
                new MockResult('123456789012', actualModule.BarcodeFormat.EAN_13, undefined, [
                    { x: 10, y: 10 },
                    { x: 100, y: 10 },
                ])
            ),
            decodeFromVideoElement: jest.fn(),
            reset: jest.fn(),
        })),
        NotFoundException: class NotFoundException extends Error {
            constructor() {
                super('No barcode found');
                this.name = 'NotFoundException';
            }
        },
    };
});

describe('BarcodeManager', () => {
    let barcodeManager: BarcodeManager;

    beforeEach(() => {
        // Clear mocks
        jest.clearAllMocks();

        // Create new instance for each test
        barcodeManager = new BarcodeManager();

        // Clear any existing subtitle bars from previous tests
        const existingBar = document.getElementById('barcode-subtitle-bar');
        if (existingBar) {
            existingBar.remove();
        }
    });

    afterEach(async () => {
        // Cleanup after each test
        await barcodeManager.cleanup();
    });

    describe('Initialization', () => {
        test('should initialize with default config', () => {
            expect(barcodeManager).toBeDefined();
        });

        test('should initialize ZXing reader', async () => {
            const result = await barcodeManager.initialize();
            expect(result).toBe(true);
        });

        test('should not re-initialize if already initialized', async () => {
            await barcodeManager.initialize();
            const result = await barcodeManager.initialize();
            expect(result).toBe(true);
        });

        test('should create subtitle bar on initialization', async () => {
            await barcodeManager.initialize();
            const subtitleBar = document.getElementById('barcode-subtitle-bar');
            expect(subtitleBar).toBeTruthy();
        });

        test('should accept custom configuration', () => {
            const customConfig: Partial<BarcodeConfig> = {
                targetFPS: 10,
                tryHarder: false,
            };
            const customManager = new BarcodeManager(customConfig);
            expect(customManager).toBeDefined();
        });

        test('should accept custom subtitle configuration', async () => {
            const customSubtitleConfig: Partial<SubtitleBarConfig> = {
                position: 'top',
                fontSize: 20,
                backgroundColor: 'rgba(255, 0, 0, 0.9)',
            };
            const customManager = new BarcodeManager({}, customSubtitleConfig);
            await customManager.initialize();

            const subtitleBar = document.getElementById('barcode-subtitle-bar');
            expect(subtitleBar?.style.top).toBe('0px');
            expect(subtitleBar?.style.fontSize).toBe('20px');

            await customManager.cleanup();
        });
    });

    describe('Toggle Functionality', () => {
        test('should toggle barcode scanner on', async () => {
            const result = await barcodeManager.toggle();
            expect(result).toBe(true);
        });

        test('should toggle barcode scanner off', async () => {
            await barcodeManager.toggle(); // On
            const result = await barcodeManager.toggle(); // Off
            expect(result).toBe(false);
        });

        test('should initialize if not initialized on toggle', async () => {
            const result = await barcodeManager.toggle();
            expect(result).toBe(true);
        });
    });

    describe('Barcode Scanning', () => {
        beforeEach(async () => {
            await barcodeManager.initialize();
            await barcodeManager.toggle(); // Enable scanning
        });

        test('should scan barcode from image', async () => {
            const mockImage = document.createElement('img');
            const result = await barcodeManager.scanFromImage(mockImage);

            expect(result).toBeTruthy();
            expect(result?.text).toBe('123456789012');
            expect(result?.format).toBe('EAN_13');
        });

        test('should return null if scanner is disabled', async () => {
            await barcodeManager.toggle(); // Disable
            const mockImage = document.createElement('img');
            const result = await barcodeManager.scanFromImage(mockImage);

            expect(result).toBeNull();
        });

        test('should throttle real-time scanning', async () => {
            const mockImage = document.createElement('img');

            // First call should process
            const result1 = await barcodeManager.scanFromImage(mockImage, true);
            expect(result1).toBeTruthy();

            // Immediate second call should return cached result
            const result2 = await barcodeManager.scanFromImage(mockImage, true);
            expect(result2).toBe(result1);
        });

        test('should update subtitle bar with scanned barcode', async () => {
            const mockImage = document.createElement('img');
            await barcodeManager.scanFromImage(mockImage);

            const subtitleBar = document.getElementById('barcode-subtitle-bar');
            expect(subtitleBar?.textContent).toContain('123456789012');
            expect(subtitleBar?.textContent).toContain('EAN_13');
        });

        test('should include result points in scan result', async () => {
            const mockImage = document.createElement('img');
            const result = await barcodeManager.scanFromImage(mockImage);

            expect(result?.resultPoints).toBeDefined();
            expect(result?.resultPoints?.length).toBeGreaterThan(0);
            expect(result?.resultPoints?.[0]).toHaveProperty('x');
            expect(result?.resultPoints?.[0]).toHaveProperty('y');
        });

        test('should handle scan errors gracefully', async () => {
            const { BrowserMultiFormatReader, NotFoundException } = require('@zxing/library');
            const mockReader =
                BrowserMultiFormatReader.mock.results[BrowserMultiFormatReader.mock.results.length - 1]
                    .value;
            mockReader.decodeFromImageElement.mockRejectedValueOnce(new NotFoundException());

            const mockImage = document.createElement('img');
            const result = await barcodeManager.scanFromImage(mockImage);

            expect(result).toBeNull();
        });

        test('should scan from video element', async () => {
            const mockVideo = document.createElement('video');
            const callback = jest.fn();

            await barcodeManager.scanFromVideo(mockVideo, callback);

            // Video scanning is continuous, so we just verify it was called
            const { BrowserMultiFormatReader } = require('@zxing/library');
            const mockReader =
                BrowserMultiFormatReader.mock.results[BrowserMultiFormatReader.mock.results.length - 1]
                    .value;
            expect(mockReader.decodeFromVideoElement).toHaveBeenCalled();
        });

        test('should stop scanning', async () => {
            barcodeManager.stopScanning();

            const { BrowserMultiFormatReader } = require('@zxing/library');
            const mockReader =
                BrowserMultiFormatReader.mock.results[BrowserMultiFormatReader.mock.results.length - 1]
                    .value;
            expect(mockReader.reset).toHaveBeenCalled();
        });
    });

    describe('Result History', () => {
        beforeEach(async () => {
            await barcodeManager.initialize();
            await barcodeManager.toggle();
        });

        test('should store scan results in history', async () => {
            const mockImage = document.createElement('img');
            await barcodeManager.scanFromImage(mockImage);

            const history = barcodeManager.getHistory();
            expect(history.length).toBe(1);
            expect(history[0].text).toBe('123456789012');
            expect(history[0].format).toBe('EAN_13');
        });

        test('should limit history size to 20', async () => {
            const mockImage = document.createElement('img');

            // Add more than max history size (20)
            for (let i = 0; i < 25; i++) {
                await barcodeManager.scanFromImage(mockImage);
                // Add small delay to ensure different timestamps
                await new Promise((resolve) => setTimeout(resolve, 10));
            }

            const history = barcodeManager.getHistory();
            expect(history.length).toBeLessThanOrEqual(20);
        });

        test('should get current result', async () => {
            const mockImage = document.createElement('img');
            await barcodeManager.scanFromImage(mockImage);

            const current = barcodeManager.getCurrentResult();
            expect(current).toBeTruthy();
            expect(current?.text).toBe('123456789012');
        });

        test('should clear history', async () => {
            const mockImage = document.createElement('img');
            await barcodeManager.scanFromImage(mockImage);

            barcodeManager.clearHistory();

            expect(barcodeManager.getHistory()).toEqual([]);
            expect(barcodeManager.getCurrentResult()).toBeNull();
        });
    });

    describe('Performance Metrics', () => {
        beforeEach(async () => {
            await barcodeManager.initialize();
            await barcodeManager.toggle();
        });

        test('should track performance metrics', async () => {
            const mockImage = document.createElement('img');
            await barcodeManager.scanFromImage(mockImage);

            const metrics = barcodeManager.getMetrics();
            expect(metrics.scansPerformed).toBe(1);
            expect(metrics.successfulScans).toBe(1);
            expect(metrics.isEnabled).toBe(true);
            expect(metrics.isInitialized).toBe(true);
        });

        test('should calculate average scan time', async () => {
            const mockImage = document.createElement('img');

            await barcodeManager.scanFromImage(mockImage);
            await new Promise((resolve) => setTimeout(resolve, 100));
            await barcodeManager.scanFromImage(mockImage);

            const metrics = barcodeManager.getMetrics();
            expect(metrics.scansPerformed).toBe(2);
            expect(metrics.avgScanTime).toBeGreaterThan(0);
        });

        test('should track current format', async () => {
            const mockImage = document.createElement('img');
            await barcodeManager.scanFromImage(mockImage);

            const metrics = barcodeManager.getMetrics();
            expect(metrics.currentFormat).toBe('EAN_13');
        });
    });

    describe('Format Management', () => {
        test('should get list of supported formats', () => {
            const formats = barcodeManager.getSupportedFormats();
            expect(formats).toContain('QR_CODE');
            expect(formats).toContain('EAN_13');
            expect(formats).toContain('CODE_128');
            expect(formats.length).toBeGreaterThan(0);
        });

        test('should set specific formats', () => {
            const formats = [BarcodeFormat.QR_CODE, BarcodeFormat.EAN_13];
            barcodeManager.setFormats(formats);
            expect(barcodeManager).toBeDefined();
        });
    });

    describe('Subtitle Bar', () => {
        beforeEach(async () => {
            await barcodeManager.initialize();
        });

        test('should create subtitle bar with correct styles', () => {
            const subtitleBar = document.getElementById('barcode-subtitle-bar');
            expect(subtitleBar).toBeTruthy();
            expect(subtitleBar?.style.position).toBe('fixed');
            expect(subtitleBar?.style.zIndex).toBe('9997');
        });

        test('should position subtitle bar at bottom by default', () => {
            const subtitleBar = document.getElementById('barcode-subtitle-bar');
            expect(subtitleBar?.style.bottom).toBe('0px');
        });

        test('should position subtitle bar at top if configured', async () => {
            const customManager = new BarcodeManager({}, { position: 'top' });
            await customManager.initialize();

            const subtitleBar = document.getElementById('barcode-subtitle-bar');
            expect(subtitleBar?.style.top).toBe('0px');

            await customManager.cleanup();
        });

        test('should show format icon in subtitle', async () => {
            await barcodeManager.toggle();
            const mockImage = document.createElement('img');
            await barcodeManager.scanFromImage(mockImage);

            const subtitleBar = document.getElementById('barcode-subtitle-bar');
            // Should contain an emoji icon
            expect(subtitleBar?.innerHTML).toMatch(/[\u{1F300}-\u{1F9FF}]/u);
        });

        test('should truncate long barcode text', async () => {
            const { BrowserMultiFormatReader } = require('@zxing/library');
            const { BarcodeFormat } = require('@zxing/library');

            class MockLongResult {
                getText() {
                    return 'A'.repeat(150); // 150 character barcode
                }
                getBarcodeFormat() {
                    return BarcodeFormat.CODE_128;
                }
                getRawBytes() {
                    return new Uint8Array([]);
                }
                getResultPoints() {
                    return [];
                }
            }

            const mockReader =
                BrowserMultiFormatReader.mock.results[BrowserMultiFormatReader.mock.results.length - 1]
                    .value;
            mockReader.decodeFromImageElement.mockResolvedValueOnce(new MockLongResult());

            await barcodeManager.toggle();
            const mockImage = document.createElement('img');
            await barcodeManager.scanFromImage(mockImage);

            const subtitleBar = document.getElementById('barcode-subtitle-bar');
            expect(subtitleBar?.textContent).toContain('...');
        });
    });

    describe('XSS Protection', () => {
        beforeEach(async () => {
            await barcodeManager.initialize();
            await barcodeManager.toggle();
        });

        test('should escape HTML in barcode data', async () => {
            const { BrowserMultiFormatReader } = require('@zxing/library');
            const { BarcodeFormat } = require('@zxing/library');

            class MockXSSResult {
                getText() {
                    return '<script>alert("xss")</script>';
                }
                getBarcodeFormat() {
                    return BarcodeFormat.QR_CODE;
                }
                getRawBytes() {
                    return new Uint8Array([]);
                }
                getResultPoints() {
                    return [];
                }
            }

            const mockReader =
                BrowserMultiFormatReader.mock.results[BrowserMultiFormatReader.mock.results.length - 1]
                    .value;
            mockReader.decodeFromImageElement.mockResolvedValueOnce(new MockXSSResult());

            const mockImage = document.createElement('img');
            await barcodeManager.scanFromImage(mockImage);

            const subtitleBar = document.getElementById('barcode-subtitle-bar');
            // Should not contain actual script tags
            expect(subtitleBar?.innerHTML).not.toContain('<script>');
            // Should contain escaped version in innerHTML
            expect(subtitleBar?.innerHTML).toContain('&lt;script&gt;');
        });
    });

    describe('Cleanup', () => {
        test('should cleanup all resources', async () => {
            await barcodeManager.initialize();
            await barcodeManager.toggle();

            await barcodeManager.cleanup();

            const metrics = barcodeManager.getMetrics();
            expect(metrics.isEnabled).toBe(false);
            expect(metrics.isInitialized).toBe(false);

            const subtitleBar = document.getElementById('barcode-subtitle-bar');
            expect(subtitleBar).toBeNull();
        });

        test('should reset reader on cleanup', async () => {
            await barcodeManager.initialize();
            const { BrowserMultiFormatReader } = require('@zxing/library');

            await barcodeManager.cleanup();

            const mockReader =
                BrowserMultiFormatReader.mock.results[BrowserMultiFormatReader.mock.results.length - 1]
                    .value;
            expect(mockReader.reset).toHaveBeenCalled();
        });

        test('should clear results on cleanup', async () => {
            await barcodeManager.initialize();
            await barcodeManager.toggle();

            const mockImage = document.createElement('img');
            await barcodeManager.scanFromImage(mockImage);

            await barcodeManager.cleanup();

            expect(barcodeManager.getCurrentResult()).toBeNull();
            expect(barcodeManager.getHistory()).toEqual([]);
        });
    });

    describe('Different Barcode Formats', () => {
        beforeEach(async () => {
            await barcodeManager.initialize();
            await barcodeManager.toggle();
        });

        test('should detect QR codes', async () => {
            const { BrowserMultiFormatReader } = require('@zxing/library');
            const { BarcodeFormat } = require('@zxing/library');

            class MockQRResult {
                getText() {
                    return 'https://example.com';
                }
                getBarcodeFormat() {
                    return BarcodeFormat.QR_CODE;
                }
                getRawBytes() {
                    return new Uint8Array([]);
                }
                getResultPoints() {
                    return [];
                }
            }

            const mockReader =
                BrowserMultiFormatReader.mock.results[BrowserMultiFormatReader.mock.results.length - 1]
                    .value;
            mockReader.decodeFromImageElement.mockResolvedValueOnce(new MockQRResult());

            const mockImage = document.createElement('img');
            const result = await barcodeManager.scanFromImage(mockImage);

            expect(result?.format).toBe('QR_CODE');
            expect(result?.text).toBe('https://example.com');
        });

        test('should detect Data Matrix codes', async () => {
            const { BrowserMultiFormatReader } = require('@zxing/library');
            const { BarcodeFormat } = require('@zxing/library');

            class MockDataMatrixResult {
                getText() {
                    return 'DM12345';
                }
                getBarcodeFormat() {
                    return BarcodeFormat.DATA_MATRIX;
                }
                getRawBytes() {
                    return new Uint8Array([]);
                }
                getResultPoints() {
                    return [];
                }
            }

            const mockReader =
                BrowserMultiFormatReader.mock.results[BrowserMultiFormatReader.mock.results.length - 1]
                    .value;
            mockReader.decodeFromImageElement.mockResolvedValueOnce(new MockDataMatrixResult());

            const mockImage = document.createElement('img');
            const result = await barcodeManager.scanFromImage(mockImage);

            expect(result?.format).toBe('DATA_MATRIX');
        });
    });
});
