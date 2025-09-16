/**
 * AI Image Recognition Module for PoliCamera
 * Uses TensorFlow.js with YOLO model for object detection
 */
class AIRecognitionManager {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.isLoading = false;
        this.modelUrl = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.2';
        this.detectionThreshold = 0.5;
        this.maxDetections = 20;
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
            console.log('AI model loaded successfully');

            return true;

        } catch (error) {
            console.error('Failed to load AI model:', error);
            this.isModelLoaded = false;
            return false;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Detect objects in an image
     * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} imageElement
     * @returns {Promise<Array>} Array of detection results
     */
    async detectObjects(imageElement) {
        if (!this.isModelLoaded) {
            console.warn('AI model not loaded. Attempting to initialize...');
            const loaded = await this.initializeModel();
            if (!loaded) {
                return [];
            }
        }

        try {
            console.log('Running object detection...');
            const predictions = await this.model.detect(imageElement);

            // Filter predictions by confidence threshold
            const filteredPredictions = predictions
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

            console.log(`Detected ${filteredPredictions.length} objects:`, filteredPredictions);
            return filteredPredictions;

        } catch (error) {
            console.error('Object detection failed:', error);
            return [];
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
    updateSettings(settings) {
        if (settings.threshold !== undefined) {
            this.detectionThreshold = Math.max(0, Math.min(1, settings.threshold));
        }
        if (settings.maxDetections !== undefined) {
            this.maxDetections = Math.max(1, Math.min(100, settings.maxDetections));
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
}

// Create singleton instance
const aiRecognitionManager = new AIRecognitionManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = aiRecognitionManager;
} else {
    window.aiRecognitionManager = aiRecognitionManager;
}