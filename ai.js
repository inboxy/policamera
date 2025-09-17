/**
 * AI Image Recognition Module for PoliCamera
 * Uses Web Worker with TensorFlow.js for non-blocking object detection
 */
class AIRecognitionManager {
    constructor() {
        this.worker = null;
        this.isWorkerSupported = typeof Worker !== 'undefined';
        this.isModelLoaded = false;
        this.isLoading = false;
        this.messageId = 0;
        this.pendingMessages = new Map();
        this.detectionThreshold = 0.4;
        this.maxDetections = 10;
        this.workerFailureCount = 0;
        this.maxWorkerFailures = 3;

        // Performance optimization settings
        this.inputSize = 320; // Reduced from default 416 for faster processing
        this.maxFPS = 30;
        this.skipFrames = 2; // Process every 3rd frame
        this.frameCounter = 0;
        this.lastProcessTime = 0;
        this.targetFrameTime = 1000 / this.maxFPS;

        // Canvas pooling for better memory management
        this.canvasPool = [];
        this.maxPoolSize = 3;

        // Fallback properties for non-worker mode
        this.model = null;
        this.modelUrl = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.2';

        this.initializeWorker();
        this.adjustPerformanceSettings();
    }

    /**
     * Initialize Web Worker for AI processing
     */
    initializeWorker() {
        if (!this.isWorkerSupported) {
            console.warn('Web Workers not supported, falling back to main thread');
            return;
        }

        try {
            this.worker = new Worker('ai-worker.js');

            this.worker.onmessage = (event) => {
                const { id, success, data, error } = event.data;
                const pending = this.pendingMessages.get(id);

                if (pending) {
                    this.pendingMessages.delete(id);
                    if (success) {
                        pending.resolve(data);
                    } else {
                        pending.reject(new Error(error || 'Worker processing failed'));
                    }
                }
            };

            this.worker.onerror = (error) => {
                console.error('AI Worker error:', error);
                // Fallback to main thread
                this.worker = null;
                this.isWorkerSupported = false;
            };

            console.log('AI Worker initialized successfully');
        } catch (error) {
            console.error('Failed to initialize AI Worker:', error);
            this.worker = null;
            this.isWorkerSupported = false;
        }
    }

    /**
     * Send message to worker
     */
    sendWorkerMessage(type, data = {}) {
        return new Promise((resolve, reject) => {
            if (!this.worker) {
                reject(new Error('Worker not available'));
                return;
            }

            const id = ++this.messageId;
            this.pendingMessages.set(id, { resolve, reject });

            this.worker.postMessage({ id, type, data });

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.pendingMessages.has(id)) {
                    this.pendingMessages.delete(id);
                    reject(new Error('Worker timeout'));
                }
            }, 30000);
        });
    }

    /**
     * Initialize the AI model
     * @returns {Promise<boolean>} Success status
     */
    async initializeModel() {
        if (this.isModelLoaded || this.isLoading) {
            return this.isModelLoaded;
        }

        this.isLoading = true;
        console.log('Loading AI model...');

        try {
            if (this.worker) {
                // Use worker
                const result = await this.sendWorkerMessage('INIT_MODEL');
                this.isModelLoaded = result.success;
                return result.success;
            } else {
                // Fallback to main thread
                return await this.initializeModelMainThread();
            }
        } catch (error) {
            console.error('Failed to load AI model:', error);
            this.isModelLoaded = false;
            return false;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Fallback model initialization for main thread
     */
    async initializeModelMainThread() {
        try {
            // Check if TensorFlow.js is available
            if (typeof tf === 'undefined') {
                throw new Error('TensorFlow.js not loaded');
            }

            // Check if COCO-SSD model is available
            if (typeof cocoSsd === 'undefined') {
                throw new Error('COCO-SSD model not loaded');
            }

            // Load the model
            this.model = await cocoSsd.load();
            this.isModelLoaded = true;
            console.log('AI model loaded successfully (main thread)');

            return true;
        } catch (error) {
            console.error('Failed to load AI model on main thread:', error);
            return false;
        }
    }

    /**
     * Detect objects in an image with performance optimizations
     * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} imageElement
     * @param {boolean} isRealTime - Whether this is for real-time processing
     * @returns {Promise<Array>} Array of detection results
     */
    async detectObjects(imageElement, isRealTime = false) {
        if (!this.isModelLoaded) {
            console.warn('AI model not loaded. Attempting to initialize...');
            const loaded = await this.initializeModel();
            if (!loaded) {
                return [];
            }
        }

        // Frame skipping for real-time performance
        if (isRealTime) {
            this.frameCounter++;
            if (this.frameCounter <= this.skipFrames) {
                return []; // Skip this frame
            }
            this.frameCounter = 0;

            // FPS throttling
            const currentTime = performance.now();
            if (currentTime - this.lastProcessTime < this.targetFrameTime) {
                return []; // Too soon, skip this frame
            }
            this.lastProcessTime = currentTime;
        }

        try {
            if (this.worker && this.workerFailureCount < this.maxWorkerFailures) {
                // Use worker for detection
                return await this.detectObjectsWorker(imageElement, isRealTime);
            } else {
                // Fallback to main thread
                return await this.detectObjectsMainThread(imageElement, isRealTime);
            }
        } catch (error) {
            console.error('Object detection failed:', error);
            return [];
        }
    }

    /**
     * Get canvas from pool or create new one
     */
    getCanvas() {
        if (this.canvasPool.length > 0) {
            return this.canvasPool.pop();
        }
        return document.createElement('canvas');
    }

    /**
     * Return canvas to pool
     */
    returnCanvas(canvas) {
        if (this.canvasPool.length < this.maxPoolSize) {
            // Clear canvas and return to pool
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            this.canvasPool.push(canvas);
        }
    }

    /**
     * Detect objects using Web Worker
     */
    async detectObjectsWorker(imageElement, isRealTime = false) {
        const canvas = this.getCanvas();

        try {
            const ctx = canvas.getContext('2d');

            // Handle different element types with size optimization for real-time
            let width, height, sourceWidth, sourceHeight;

            if (imageElement instanceof HTMLCanvasElement) {
                sourceWidth = imageElement.width;
                sourceHeight = imageElement.height;
            } else if (imageElement instanceof HTMLVideoElement) {
                sourceWidth = imageElement.videoWidth;
                sourceHeight = imageElement.videoHeight;

                // Check if video dimensions are valid
                if (sourceWidth === 0 || sourceHeight === 0) {
                    throw new Error('Video not ready - invalid dimensions');
                }
            } else {
                sourceWidth = imageElement.naturalWidth || imageElement.width;
                sourceHeight = imageElement.naturalHeight || imageElement.height;
            }

            // Optimize size for real-time processing
            if (isRealTime && (sourceWidth > this.inputSize || sourceHeight > this.inputSize)) {
                // Scale down for faster processing
                const scale = Math.min(this.inputSize / sourceWidth, this.inputSize / sourceHeight);
                width = Math.floor(sourceWidth * scale);
                height = Math.floor(sourceHeight * scale);
            } else {
                width = sourceWidth;
                height = sourceHeight;
            }

            canvas.width = width;
            canvas.height = height;

            // Draw image with potential scaling
            if (width !== sourceWidth || height !== sourceHeight) {
                ctx.drawImage(imageElement, 0, 0, width, height);
            } else {
                ctx.drawImage(imageElement, 0, 0);
            }

            // Get image data
            const imageData = ctx.getImageData(0, 0, width, height);

            // Send to worker
            const result = await this.sendWorkerMessage('DETECT_OBJECTS', {
                imageData: imageData.data.buffer,
                width: width,
                height: height
            });

            if (result.success) {
                // Scale bounding boxes back to original size if we downscaled
                let detections = result.detections;
                if (width !== sourceWidth || height !== sourceHeight) {
                    const scaleX = sourceWidth / width;
                    const scaleY = sourceHeight / height;

                    detections = detections.map(detection => ({
                        ...detection,
                        bbox: {
                            x: Math.round(detection.bbox.x * scaleX),
                            y: Math.round(detection.bbox.y * scaleY),
                            width: Math.round(detection.bbox.width * scaleX),
                            height: Math.round(detection.bbox.height * scaleY)
                        }
                    }));
                }

                if (!isRealTime) {
                    console.log(`Detected ${detections.length} objects (worker):`, detections);
                }

                // Reset failure count on success
                this.workerFailureCount = 0;
                return detections;
            } else {
                console.error('Worker detection failed:', result.error);
                this.workerFailureCount++;

                if (this.workerFailureCount >= this.maxWorkerFailures) {
                    console.warn('Worker failed too many times, switching to main thread permanently');
                }

                // Fallback to main thread
                return await this.detectObjectsMainThread(imageElement, isRealTime);
            }

        } catch (error) {
            console.error('Worker detection error:', error);
            this.workerFailureCount++;

            if (this.workerFailureCount >= this.maxWorkerFailures) {
                console.warn('Worker failed too many times, switching to main thread permanently');
            }

            // Fallback to main thread
            return await this.detectObjectsMainThread(imageElement, isRealTime);
        } finally {
            // Return canvas to pool
            this.returnCanvas(canvas);
        }
    }

    /**
     * Fallback detection for main thread with optimizations
     */
    async detectObjectsMainThread(imageElement, isRealTime = false) {
        const canvas = isRealTime ? this.getCanvas() : null;

        try {
            let processElement = imageElement;

            // Optimize for real-time by downscaling
            if (isRealTime && canvas) {
                const ctx = canvas.getContext('2d');

                let sourceWidth, sourceHeight;
                if (imageElement instanceof HTMLVideoElement) {
                    sourceWidth = imageElement.videoWidth;
                    sourceHeight = imageElement.videoHeight;
                } else if (imageElement instanceof HTMLCanvasElement) {
                    sourceWidth = imageElement.width;
                    sourceHeight = imageElement.height;
                } else {
                    sourceWidth = imageElement.naturalWidth || imageElement.width;
                    sourceHeight = imageElement.naturalHeight || imageElement.height;
                }

                // Downscale for performance
                if (sourceWidth > this.inputSize || sourceHeight > this.inputSize) {
                    const scale = Math.min(this.inputSize / sourceWidth, this.inputSize / sourceHeight);
                    const width = Math.floor(sourceWidth * scale);
                    const height = Math.floor(sourceHeight * scale);

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(imageElement, 0, 0, width, height);
                    processElement = canvas;
                }
            }

            if (!isRealTime) {
                console.log('Running object detection (main thread)...');
            }

            const predictions = await this.model.detect(processElement);

            // Filter predictions by confidence threshold
            let filteredPredictions = predictions
                .filter(prediction => prediction.score >= this.detectionThreshold)
                .slice(0, this.maxDetections)
                .map(prediction => ({
                    class: prediction.class,
                    confidence: Math.round(prediction.score * 100),
                    bbox: {
                        x: Math.round(prediction.bbox[0]),
                        y: Math.round(prediction.bbox[1]),
                        width: Math.round(prediction.bbox[2]),
                        height: Math.round(prediction.bbox[3])
                    }
                }));

            // Scale bounding boxes back if we downscaled
            if (isRealTime && canvas && processElement === canvas) {
                let sourceWidth, sourceHeight;
                if (imageElement instanceof HTMLVideoElement) {
                    sourceWidth = imageElement.videoWidth;
                    sourceHeight = imageElement.videoHeight;
                } else if (imageElement instanceof HTMLCanvasElement) {
                    sourceWidth = imageElement.width;
                    sourceHeight = imageElement.height;
                } else {
                    sourceWidth = imageElement.naturalWidth || imageElement.width;
                    sourceHeight = imageElement.naturalHeight || imageElement.height;
                }

                const scaleX = sourceWidth / canvas.width;
                const scaleY = sourceHeight / canvas.height;

                filteredPredictions = filteredPredictions.map(prediction => ({
                    ...prediction,
                    bbox: {
                        x: Math.round(prediction.bbox.x * scaleX),
                        y: Math.round(prediction.bbox.y * scaleY),
                        width: Math.round(prediction.bbox.width * scaleX),
                        height: Math.round(prediction.bbox.height * scaleY)
                    }
                }));
            }

            if (!isRealTime) {
                console.log(`Detected ${filteredPredictions.length} objects (main thread):`, filteredPredictions);
            }

            return filteredPredictions;

        } catch (error) {
            console.error('Main thread detection failed:', error);
            return [];
        } finally {
            if (canvas) {
                this.returnCanvas(canvas);
            }
        }
    }

    /**
     * Analyze an image from canvas or data URL
     * @param {HTMLCanvasElement|string} imageSource Canvas element or data URL
     * @returns {Promise<Object>} Analysis results
     */
    async analyzeImage(imageSource) {
        try {
            let imageElement;

            if (typeof imageSource === 'string') {
                // Create image from data URL
                imageElement = await this.createImageFromDataUrl(imageSource);
            } else if (imageSource instanceof HTMLCanvasElement) {
                imageElement = imageSource;
            } else {
                throw new Error('Invalid image source type');
            }

            const detections = await this.detectObjects(imageElement);

            return {
                success: true,
                timestamp: new Date().toISOString(),
                detections: detections,
                summary: this.generateDetectionSummary(detections),
                metadata: {
                    modelUsed: 'COCO-SSD',
                    threshold: this.detectionThreshold,
                    totalDetections: detections.length
                }
            };

        } catch (error) {
            console.error('Image analysis failed:', error);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
                detections: [],
                summary: 'Analysis failed',
                metadata: null
            };
        }
    }

    /**
     * Create an image element from a data URL
     * @param {string} dataUrl
     * @returns {Promise<HTMLImageElement>}
     */
    createImageFromDataUrl(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = dataUrl;
        });
    }

    /**
     * Generate a summary of detected objects
     * @param {Array} detections
     * @returns {string}
     */
    generateDetectionSummary(detections) {
        if (detections.length === 0) {
            return 'No objects detected';
        }

        // Count objects by class
        const objectCounts = {};
        detections.forEach(detection => {
            objectCounts[detection.class] = (objectCounts[detection.class] || 0) + 1;
        });

        // Create summary string
        const summaryParts = Object.entries(objectCounts)
            .sort(([,a], [,b]) => b - a) // Sort by count descending
            .map(([className, count]) =>
                count > 1 ? `${count} ${className}s` : `1 ${className}`
            );

        return summaryParts.join(', ');
    }

    /**
     * Draw detection boxes on canvas
     * @param {HTMLCanvasElement} canvas
     * @param {Array} detections
     */
    drawDetections(canvas, detections) {
        const ctx = canvas.getContext('2d');

        detections.forEach(detection => {
            const { bbox, class: className, confidence } = detection;

            // Draw bounding box
            ctx.strokeStyle = '#B4F222';
            ctx.lineWidth = 2;
            ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);

            // Draw label background
            const label = `${className} (${confidence}%)`;
            ctx.font = '14px Arial';
            const textWidth = ctx.measureText(label).width;

            ctx.fillStyle = 'rgba(180, 242, 34, 0.8)';
            ctx.fillRect(bbox.x, bbox.y - 25, textWidth + 10, 20);

            // Draw label text
            ctx.fillStyle = '#000';
            ctx.fillText(label, bbox.x + 5, bbox.y - 10);
        });
    }

    /**
     * Get model status information
     * @returns {Object}
     */
    getModelStatus() {
        return {
            isLoaded: this.isModelLoaded,
            isLoading: this.isLoading,
            modelUrl: this.modelUrl,
            threshold: this.detectionThreshold,
            maxDetections: this.maxDetections
        };
    }

    /**
     * Update detection settings
     * @param {Object} settings
     */
    async updateSettings(settings) {
        if (settings.threshold !== undefined) {
            this.detectionThreshold = Math.max(0, Math.min(1, settings.threshold));
        }
        if (settings.maxDetections !== undefined) {
            this.maxDetections = Math.max(1, Math.min(100, settings.maxDetections));
        }

        // Update worker settings if available
        if (this.worker) {
            try {
                await this.sendWorkerMessage('UPDATE_SETTINGS', {
                    threshold: this.detectionThreshold,
                    maxDetections: this.maxDetections
                });
            } catch (error) {
                console.warn('Failed to update worker settings:', error);
            }
        }
    }

    /**
     * Check if AI features are supported
     * @returns {boolean}
     */
    isSupported() {
        try {
            return typeof tf !== 'undefined' && typeof cocoSsd !== 'undefined';
        } catch (error) {
            return false;
        }
    }

    /**
     * Get detection statistics
     * @param {Array} detections
     * @returns {Object}
     */
    getDetectionStats(detections) {
        if (detections.length === 0) {
            return {
                totalObjects: 0,
                uniqueClasses: 0,
                averageConfidence: 0,
                highestConfidence: 0,
                mostCommonClass: null
            };
        }

        const confidences = detections.map(d => d.confidence);
        const classes = detections.map(d => d.class);
        const classCounts = {};

        classes.forEach(cls => {
            classCounts[cls] = (classCounts[cls] || 0) + 1;
        });

        const mostCommonClass = Object.entries(classCounts)
            .sort(([,a], [,b]) => b - a)[0][0];

        return {
            totalObjects: detections.length,
            uniqueClasses: Object.keys(classCounts).length,
            averageConfidence: Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length),
            highestConfidence: Math.max(...confidences),
            mostCommonClass: mostCommonClass,
            classBreakdown: classCounts
        };
    }

    /**
     * Clean up resources
     */
    /**
     * Adjust performance settings based on device capabilities
     */
    adjustPerformanceSettings() {
        // Detect device capabilities
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const hasWebGL = !!gl;

        // Estimate device performance based on hardware concurrency and WebGL support
        const cores = navigator.hardwareConcurrency || 4;
        const isHighPerformance = cores >= 8 && hasWebGL;
        const isMediumPerformance = cores >= 4 && hasWebGL;

        if (isHighPerformance) {
            // High-end device: more frequent processing, higher quality
            this.skipFrames = 1; // Process every 2nd frame
            this.inputSize = 416; // Higher resolution
            this.maxDetections = 15;
            this.detectionThreshold = 0.3;
            console.log('High performance mode enabled');
        } else if (isMediumPerformance) {
            // Medium device: balanced settings
            this.skipFrames = 2; // Process every 3rd frame
            this.inputSize = 320; // Medium resolution
            this.maxDetections = 10;
            this.detectionThreshold = 0.4;
            console.log('Medium performance mode enabled');
        } else {
            // Low-end device: maximum optimization
            this.skipFrames = 4; // Process every 5th frame
            this.inputSize = 224; // Lower resolution
            this.maxDetections = 5;
            this.detectionThreshold = 0.5;
            console.log('Low performance mode enabled');
        }

        // Cleanup
        if (gl) {
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
    }

    /**
     * Get current performance statistics
     */
    getPerformanceStats() {
        return {
            inputSize: this.inputSize,
            skipFrames: this.skipFrames,
            maxDetections: this.maxDetections,
            detectionThreshold: this.detectionThreshold,
            isWorkerSupported: this.isWorkerSupported,
            workerFailureCount: this.workerFailureCount
        };
    }

    cleanup() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.pendingMessages.clear();
        this.isModelLoaded = false;
        console.log('AI Recognition Manager cleaned up');
    }
}

// Create singleton instance
const aiRecognitionManager = new AIRecognitionManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = aiRecognitionManager;
} else {
    window.aiRecognitionManager = aiRecognitionManager;
}