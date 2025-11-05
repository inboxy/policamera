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

        // Object tracking and smoothing
        this.trackedObjects = [];
        this.objectIdCounter = 0;
        this.trackingIoUThreshold = 0.3;
        this.minDetectionFrames = 2; // Require object to appear in N frames before displaying
        this.maxMissingFrames = 5; // Remove object if not detected for N frames

        // NMS settings
        this.nmsIoUThreshold = 0.5;
        this.enableNMS = true;

        // Temporal smoothing settings
        this.smoothingAlpha = 0.6; // Higher = more responsive, lower = smoother
        this.enableSmoothing = true;

        // Detection statistics
        this.detectionStats = {
            frameCount: 0,
            totalDetections: 0,
            classCounts: {}
        };

        // Class colors for visualization (Material Design inspired)
        this.classColors = this.initializeClassColors();

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

                // Apply NMS to filter overlapping detections
                detections = this.applyNMS(detections);

                // Apply tracking for real-time detections
                if (isRealTime) {
                    detections = this.trackObjects(detections);
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

            // Apply NMS to filter overlapping detections
            filteredPredictions = this.applyNMS(filteredPredictions);

            // Apply tracking for real-time detections
            if (isRealTime) {
                filteredPredictions = this.trackObjects(filteredPredictions);
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
            const { bbox, class: className, confidence, trackId } = detection;

            // Get color for this class
            const color = this.getClassColor(className);

            // Draw bounding box with shadow for better visibility
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 4;
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);

            // Reset shadow
            ctx.shadowBlur = 0;

            // Draw corner accents for modern look
            const cornerLength = Math.min(20, bbox.width / 4, bbox.height / 4);
            ctx.lineWidth = 4;

            // Top-left corner
            ctx.beginPath();
            ctx.moveTo(bbox.x, bbox.y + cornerLength);
            ctx.lineTo(bbox.x, bbox.y);
            ctx.lineTo(bbox.x + cornerLength, bbox.y);
            ctx.stroke();

            // Top-right corner
            ctx.beginPath();
            ctx.moveTo(bbox.x + bbox.width - cornerLength, bbox.y);
            ctx.lineTo(bbox.x + bbox.width, bbox.y);
            ctx.lineTo(bbox.x + bbox.width, bbox.y + cornerLength);
            ctx.stroke();

            // Bottom-left corner
            ctx.beginPath();
            ctx.moveTo(bbox.x, bbox.y + bbox.height - cornerLength);
            ctx.lineTo(bbox.x, bbox.y + bbox.height);
            ctx.lineTo(bbox.x + cornerLength, bbox.y + bbox.height);
            ctx.stroke();

            // Bottom-right corner
            ctx.beginPath();
            ctx.moveTo(bbox.x + bbox.width - cornerLength, bbox.y + bbox.height);
            ctx.lineTo(bbox.x + bbox.width, bbox.y + bbox.height);
            ctx.lineTo(bbox.x + bbox.width, bbox.y + bbox.height - cornerLength);
            ctx.stroke();

            // Draw label with track ID if available
            const label = trackId ? `${className} #${trackId} (${confidence}%)` : `${className} (${confidence}%)`;
            ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            const textMetrics = ctx.measureText(label);
            const textWidth = textMetrics.width;
            const textHeight = 20;
            const padding = 10;

            // Draw label background with rounded corners
            const labelX = bbox.x;
            const labelY = bbox.y - textHeight - 8;

            // Helper function to draw rounded rectangle
            const drawRoundedRect = (x, y, width, height, radius) => {
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
            };

            // Parse color to RGB
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);

            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
            drawRoundedRect(labelX, labelY, textWidth + padding * 2, textHeight + 4, 6);
            ctx.fill();

            // Draw label text with contrasting color
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            ctx.fillStyle = luminance > 0.5 ? '#000000' : '#FFFFFF';
            ctx.fillText(label, labelX + padding, labelY + textHeight - 2);

            // Draw confidence bar below bounding box
            const barWidth = bbox.width;
            const barHeight = 4;
            const barX = bbox.x;
            const barY = bbox.y + bbox.height + 4;

            // Background bar
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Confidence bar
            ctx.fillStyle = color;
            ctx.fillRect(barX, barY, barWidth * (confidence / 100), barHeight);
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
     * Initialize class colors for different object types
     */
    initializeClassColors() {
        return {
            'person': '#E91E63',      // Pink
            'bicycle': '#2196F3',     // Blue
            'car': '#F44336',         // Red
            'motorcycle': '#FF5722',  // Deep Orange
            'airplane': '#00BCD4',    // Cyan
            'bus': '#FF9800',         // Orange
            'train': '#795548',       // Brown
            'truck': '#FF6F00',       // Dark Orange
            'boat': '#0097A7',        // Dark Cyan
            'traffic light': '#FFEB3B', // Yellow
            'fire hydrant': '#F44336', // Red
            'stop sign': '#C62828',   // Dark Red
            'parking meter': '#9E9E9E', // Grey
            'bench': '#795548',       // Brown
            'bird': '#4CAF50',        // Green
            'cat': '#9C27B0',         // Purple
            'dog': '#673AB7',         // Deep Purple
            'horse': '#A1887F',       // Brown Grey
            'sheep': '#E0E0E0',       // Light Grey
            'cow': '#8D6E63',         // Brown
            'elephant': '#757575',    // Grey
            'bear': '#5D4037',        // Dark Brown
            'zebra': '#212121',       // Almost Black
            'giraffe': '#FDD835',     // Yellow
            'backpack': '#3F51B5',    // Indigo
            'umbrella': '#00ACC1',    // Cyan
            'handbag': '#D81B60',     // Pink
            'tie': '#1976D2',         // Blue
            'suitcase': '#6D4C41',    // Brown
            'frisbee': '#26C6DA',     // Cyan
            'skis': '#0288D1',        // Blue
            'snowboard': '#01579B',   // Dark Blue
            'sports ball': '#FFA726', // Orange
            'kite': '#EC407A',        // Pink
            'baseball bat': '#8D6E63', // Brown
            'baseball glove': '#A1887F', // Brown Grey
            'skateboard': '#EF5350',  // Red
            'surfboard': '#29B6F6',   // Light Blue
            'tennis racket': '#66BB6A', // Green
            'bottle': '#26A69A',      // Teal
            'wine glass': '#AB47BC',  // Purple
            'cup': '#42A5F5',         // Blue
            'fork': '#BDBDBD',        // Grey
            'knife': '#9E9E9E',       // Grey
            'spoon': '#757575',       // Grey
            'bowl': '#78909C',        // Blue Grey
            'banana': '#FDD835',      // Yellow
            'apple': '#EF5350',       // Red
            'sandwich': '#F4E04D',    // Light Yellow
            'orange': '#FF9800',      // Orange
            'broccoli': '#4CAF50',    // Green
            'carrot': '#FF6F00',      // Dark Orange
            'hot dog': '#F4511E',     // Deep Orange
            'pizza': '#FFCA28',       // Amber
            'donut': '#FFAB91',       // Light Orange
            'cake': '#F48FB1',        // Light Pink
            'chair': '#8D6E63',       // Brown
            'couch': '#A1887F',       // Brown Grey
            'potted plant': '#66BB6A', // Green
            'bed': '#90CAF9',         // Light Blue
            'dining table': '#BCAAA4', // Brown Grey
            'toilet': '#E0E0E0',      // Light Grey
            'tv': '#212121',          // Almost Black
            'laptop': '#616161',      // Dark Grey
            'mouse': '#9E9E9E',       // Grey
            'remote': '#424242',      // Dark Grey
            'keyboard': '#757575',    // Grey
            'cell phone': '#1976D2',  // Blue
            'microwave': '#BDBDBD',   // Grey
            'oven': '#424242',        // Dark Grey
            'toaster': '#9E9E9E',     // Grey
            'sink': '#B0BEC5',        // Blue Grey
            'refrigerator': '#ECEFF1', // Light Blue Grey
            'book': '#5C6BC0',        // Indigo
            'clock': '#FFA726',       // Orange
            'vase': '#AB47BC',        // Purple
            'scissors': '#90A4AE',    // Blue Grey
            'teddy bear': '#8D6E63',  // Brown
            'hair drier': '#616161',  // Dark Grey
            'toothbrush': '#26C6DA'   // Cyan
        };
    }

    /**
     * Get color for object class
     */
    getClassColor(className) {
        return this.classColors[className] || '#B4F222'; // Default green
    }

    /**
     * Calculate Intersection over Union (IoU) between two bounding boxes
     */
    calculateIoU(box1, box2) {
        const x1 = Math.max(box1.x, box2.x);
        const y1 = Math.max(box1.y, box2.y);
        const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
        const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

        const intersectionWidth = Math.max(0, x2 - x1);
        const intersectionHeight = Math.max(0, y2 - y1);
        const intersectionArea = intersectionWidth * intersectionHeight;

        const box1Area = box1.width * box1.height;
        const box2Area = box2.width * box2.height;
        const unionArea = box1Area + box2Area - intersectionArea;

        return unionArea > 0 ? intersectionArea / unionArea : 0;
    }

    /**
     * Apply Non-Maximum Suppression to filter overlapping detections
     */
    applyNMS(detections) {
        if (!this.enableNMS || detections.length === 0) {
            return detections;
        }

        // Sort detections by confidence (descending)
        const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
        const keep = [];

        while (sorted.length > 0) {
            const current = sorted.shift();
            keep.push(current);

            // Remove detections that overlap significantly with current
            for (let i = sorted.length - 1; i >= 0; i--) {
                if (sorted[i].class === current.class) {
                    const iou = this.calculateIoU(current.bbox, sorted[i].bbox);
                    if (iou > this.nmsIoUThreshold) {
                        sorted.splice(i, 1);
                    }
                }
            }
        }

        return keep;
    }

    /**
     * Smooth bounding box using exponential moving average
     */
    smoothBoundingBox(newBox, oldBox) {
        if (!this.enableSmoothing || !oldBox) {
            return newBox;
        }

        const alpha = this.smoothingAlpha;
        return {
            x: Math.round(alpha * newBox.x + (1 - alpha) * oldBox.x),
            y: Math.round(alpha * newBox.y + (1 - alpha) * oldBox.y),
            width: Math.round(alpha * newBox.width + (1 - alpha) * oldBox.width),
            height: Math.round(alpha * newBox.height + (1 - alpha) * oldBox.height)
        };
    }

    /**
     * Track objects across frames using IoU matching
     */
    trackObjects(detections) {
        if (detections.length === 0) {
            // Increment missing frame count for all tracked objects
            this.trackedObjects.forEach(obj => obj.missingFrames++);

            // Remove objects that have been missing too long
            this.trackedObjects = this.trackedObjects.filter(
                obj => obj.missingFrames < this.maxMissingFrames
            );

            return [];
        }

        // Match detections to existing tracked objects
        const matchedDetections = [];
        const unmatchedDetections = [...detections];

        // Try to match each tracked object with a detection
        this.trackedObjects.forEach(tracked => {
            let bestMatch = null;
            let bestIoU = 0;
            let bestIndex = -1;

            unmatchedDetections.forEach((detection, index) => {
                if (detection.class === tracked.class) {
                    const iou = this.calculateIoU(tracked.bbox, detection.bbox);
                    if (iou > bestIoU && iou > this.trackingIoUThreshold) {
                        bestMatch = detection;
                        bestIoU = iou;
                        bestIndex = index;
                    }
                }
            });

            if (bestMatch) {
                // Update tracked object with smoothed bounding box
                tracked.bbox = this.smoothBoundingBox(bestMatch.bbox, tracked.bbox);
                tracked.confidence = bestMatch.confidence;
                tracked.framesSeen++;
                tracked.missingFrames = 0;

                matchedDetections.push({
                    ...bestMatch,
                    bbox: tracked.bbox,
                    trackId: tracked.id,
                    framesSeen: tracked.framesSeen
                });

                // Remove matched detection
                unmatchedDetections.splice(bestIndex, 1);
            } else {
                tracked.missingFrames++;
            }
        });

        // Add unmatched detections as new tracked objects
        unmatchedDetections.forEach(detection => {
            this.trackedObjects.push({
                id: ++this.objectIdCounter,
                class: detection.class,
                bbox: detection.bbox,
                confidence: detection.confidence,
                framesSeen: 1,
                missingFrames: 0
            });

            matchedDetections.push({
                ...detection,
                trackId: this.objectIdCounter,
                framesSeen: 1
            });
        });

        // Remove objects that have been missing too long
        this.trackedObjects = this.trackedObjects.filter(
            obj => obj.missingFrames < this.maxMissingFrames
        );

        // Only return detections that have been seen for minimum frames
        const stableDetections = matchedDetections.filter(
            det => det.framesSeen >= this.minDetectionFrames
        );

        // Update statistics
        this.updateDetectionStats(stableDetections);

        return stableDetections;
    }

    /**
     * Update detection statistics
     */
    updateDetectionStats(detections) {
        this.detectionStats.frameCount++;
        this.detectionStats.totalDetections += detections.length;

        detections.forEach(detection => {
            const className = detection.class;
            if (!this.detectionStats.classCounts[className]) {
                this.detectionStats.classCounts[className] = 0;
            }
            this.detectionStats.classCounts[className]++;
        });
    }

    /**
     * Get detection statistics
     */
    getDetectionStatistics() {
        return {
            ...this.detectionStats,
            averageDetectionsPerFrame: this.detectionStats.frameCount > 0
                ? (this.detectionStats.totalDetections / this.detectionStats.frameCount).toFixed(2)
                : 0,
            trackedObjectsCount: this.trackedObjects.length
        };
    }

    /**
     * Reset detection statistics
     */
    resetDetectionStats() {
        this.detectionStats = {
            frameCount: 0,
            totalDetections: 0,
            classCounts: {}
        };
        this.trackedObjects = [];
        this.objectIdCounter = 0;
    }

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

        // Clean up tracking state
        this.trackedObjects = [];
        this.objectIdCounter = 0;
        this.resetDetectionStats();

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