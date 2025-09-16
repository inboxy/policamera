/**
 * AI Web Worker for PoliCamera
 * Handles TensorFlow.js operations in background thread
 */

// Import TensorFlow.js and COCO-SSD in worker context
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js');
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.2/dist/coco-ssd.min.js');

class AIWorker {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.isLoading = false;
        this.detectionThreshold = 0.5;
        this.maxDetections = 20;
    }

    /**
     * Initialize the AI model
     */
    async initializeModel() {
        if (this.isModelLoaded || this.isLoading) {
            return { success: this.isModelLoaded, message: 'Model already loaded or loading' };
        }

        this.isLoading = true;
        console.log('[AI Worker] Loading AI model...');

        try {
            // Set TensorFlow.js backend for worker environment
            await tf.setBackend('cpu');
            await tf.ready();

            // Load the COCO-SSD model
            this.model = await cocoSsd.load();
            this.isModelLoaded = true;

            console.log('[AI Worker] AI model loaded successfully');
            return { success: true, message: 'Model loaded successfully' };

        } catch (error) {
            console.error('[AI Worker] Failed to load AI model:', error);
            this.isModelLoaded = false;
            return { success: false, message: `Model loading failed: ${error.message}` };
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Detect objects in an image
     */
    async detectObjects(imageData, width, height) {
        if (!this.isModelLoaded) {
            const initResult = await this.initializeModel();
            if (!initResult.success) {
                return {
                    success: false,
                    error: 'Model not available',
                    detections: []
                };
            }
        }

        try {
            // Create tensor from image data array
            // Convert ArrayBuffer back to Uint8ClampedArray
            const pixelData = new Uint8ClampedArray(imageData);

            let predictions;

            // Create OffscreenCanvas for worker environment
            if (typeof OffscreenCanvas !== 'undefined') {
                const offscreenCanvas = new OffscreenCanvas(width, height);
                const ctx = offscreenCanvas.getContext('2d');

                // Create ImageData and put it on the canvas
                const imageDataObj = new ImageData(pixelData, width, height);
                ctx.putImageData(imageDataObj, 0, 0);

                // Run detection on OffscreenCanvas
                predictions = await this.model.detect(offscreenCanvas);
            } else {
                // Fallback: create tensor manually
                const tensor = tf.tensor3d(pixelData, [height, width, 4]);

                // Convert RGBA to RGB by slicing the alpha channel
                const rgbTensor = tensor.slice([0, 0, 0], [height, width, 3]);
                tensor.dispose();

                // Run detection on tensor
                predictions = await this.model.detect(rgbTensor);
                rgbTensor.dispose();
            }

            // Filter and format predictions
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

            return {
                success: true,
                detections: filteredPredictions,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error('[AI Worker] Detection failed:', error);
            return {
                success: false,
                error: error.message,
                detections: []
            };
        }
    }

    /**
     * Update detection settings
     */
    updateSettings(settings) {
        if (settings.threshold !== undefined) {
            this.detectionThreshold = Math.max(0, Math.min(1, settings.threshold));
        }
        if (settings.maxDetections !== undefined) {
            this.maxDetections = Math.max(1, Math.min(100, settings.maxDetections));
        }

        return {
            success: true,
            settings: {
                threshold: this.detectionThreshold,
                maxDetections: this.maxDetections
            }
        };
    }

    /**
     * Get model status
     */
    getStatus() {
        return {
            isLoaded: this.isModelLoaded,
            isLoading: this.isLoading,
            threshold: this.detectionThreshold,
            maxDetections: this.maxDetections
        };
    }
}

// Create worker instance
const aiWorker = new AIWorker();

// Handle messages from main thread
self.onmessage = async function(event) {
    const { id, type, data } = event.data;

    try {
        let result;

        switch (type) {
            case 'INIT_MODEL':
                result = await aiWorker.initializeModel();
                break;

            case 'DETECT_OBJECTS':
                const { imageData, width, height } = data;
                result = await aiWorker.detectObjects(imageData, width, height);
                break;

            case 'UPDATE_SETTINGS':
                result = aiWorker.updateSettings(data);
                break;

            case 'GET_STATUS':
                result = aiWorker.getStatus();
                break;

            default:
                result = {
                    success: false,
                    error: `Unknown message type: ${type}`
                };
        }

        // Send result back to main thread
        self.postMessage({
            id: id,
            type: type,
            success: true,
            data: result
        });

    } catch (error) {
        console.error('[AI Worker] Error processing message:', error);

        // Send error back to main thread
        self.postMessage({
            id: id,
            type: type,
            success: false,
            error: error.message
        });
    }
};

// Handle worker errors
self.onerror = function(error) {
    console.error('[AI Worker] Worker error:', error);
};

console.log('[AI Worker] AI Worker initialized and ready');