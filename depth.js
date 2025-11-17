/**
 * Depth Prediction Manager for PoliCamera
 * Uses TensorFlow.js with MiDaS model for monocular depth estimation
 */
class DepthPredictionManager {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.isLoading = false;
        this.isEnabled = false;

        // Performance settings
        this.inputSize = 256; // MiDaS expects 256x256 input
        this.targetFrameTime = 1000 / 15; // 15 FPS for depth prediction (slower than detection)
        this.lastProcessTime = 0;

        // Visualization settings
        this.depthOpacity = 0.6; // Opacity of depth overlay
        this.colorMode = 'turbo'; // Color scheme: 'grayscale', 'turbo', 'plasma', 'viridis'
        this.showAvgDepth = true; // Show average depth value

        // Cached depth data
        this.lastDepthMap = null;
        this.avgDepth = 0;
        this.minDepth = 0;
        this.maxDepth = 255;

        // Canvas pooling for better memory management
        this.preprocessCanvas = null;
        this.colorMapCanvas = null;

        // Model URL - Using a publicly available MiDaS TFLite model
        // Note: You'll need to host this model file or use a CDN
        this.modelUrl = 'https://tfhub.dev/intel/lite-model/midas/v2_1_small/1/lite/1';
    }

    /**
     * Check if depth prediction is supported
     */
    isSupported() {
        return typeof tf !== 'undefined';
    }

    /**
     * Initialize the depth prediction model
     */
    async initializeModel() {
        if (this.isModelLoaded || this.isLoading) {
            console.log('Depth model already', this.isModelLoaded ? 'loaded' : 'loading');
            return this.isModelLoaded;
        }

        if (!this.isSupported()) {
            console.error('TensorFlow.js not available');
            return false;
        }

        this.isLoading = true;
        console.log('🌊 Loading depth prediction model...');

        try {
            // Set WASM path for TFLite
            await tf.setWasmPaths('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.10.0/dist/');

            // Try to use WASM backend for better performance
            try {
                await tf.setBackend('wasm');
                await tf.ready();
                console.log('Using WASM backend for depth prediction');
            } catch (e) {
                console.warn('WASM backend not available, falling back to WebGL');
                await tf.setBackend('webgl');
                await tf.ready();
            }

            // For now, we'll use a custom approach with MobileNetV2 as a depth estimator
            // A proper implementation would load the actual MiDaS TFLite model
            // This is a placeholder that demonstrates the structure
            console.log('⚠️ Note: Using simplified depth estimation approach');
            console.log('For production, integrate actual MiDaS TFLite model');

            // Initialize preprocessing canvas
            this.preprocessCanvas = document.createElement('canvas');
            this.preprocessCanvas.width = this.inputSize;
            this.preprocessCanvas.height = this.inputSize;

            // Initialize color map canvas
            this.colorMapCanvas = document.createElement('canvas');

            this.isModelLoaded = true;
            this.isLoading = false;

            console.log('✅ Depth prediction initialized');
            return true;

        } catch (error) {
            console.error('❌ Failed to initialize depth prediction:', error);
            this.isLoading = false;
            this.isModelLoaded = false;
            return false;
        }
    }

    /**
     * Toggle depth prediction on/off
     */
    async toggle() {
        if (!this.isModelLoaded) {
            const loaded = await this.initializeModel();
            if (!loaded) {
                throw new Error('Failed to load depth prediction model');
            }
        }

        this.isEnabled = !this.isEnabled;
        console.log('Depth prediction:', this.isEnabled ? 'enabled' : 'disabled');
        return this.isEnabled;
    }

    /**
     * Preprocess image for depth prediction
     */
    preprocessImage(imageElement) {
        const ctx = this.preprocessCanvas.getContext('2d');

        // Draw image to preprocessing canvas at model input size
        ctx.drawImage(imageElement, 0, 0, this.inputSize, this.inputSize);

        // Convert to tensor and normalize
        const imageTensor = tf.browser.fromPixels(this.preprocessCanvas)
            .toFloat()
            .div(255.0); // Normalize to [0, 1]

        // Add batch dimension
        const batchedTensor = imageTensor.expandDims(0);

        // Cleanup
        imageTensor.dispose();

        return batchedTensor;
    }

    /**
     * Predict depth from image (simplified version)
     * In production, this would use actual MiDaS model
     */
    async predictDepth(imageElement, isRealTime = false) {
        if (!this.isModelLoaded) {
            return null;
        }

        // Frame throttling for real-time performance
        if (isRealTime) {
            const currentTime = performance.now();
            if (currentTime - this.lastProcessTime < this.targetFrameTime) {
                return this.lastDepthMap; // Return cached result
            }
            this.lastProcessTime = currentTime;
        }

        try {
            // Preprocess image
            const inputTensor = this.preprocessImage(imageElement);

            // Simplified depth estimation using edge detection and gradient analysis
            // In production, replace this with actual MiDaS model inference
            const depthMap = await this.estimateDepthSimplified(inputTensor);

            // Cleanup
            inputTensor.dispose();

            // Cache result
            this.lastDepthMap = depthMap;

            return depthMap;

        } catch (error) {
            console.error('Depth prediction failed:', error);
            return null;
        }
    }

    /**
     * Simplified depth estimation (placeholder for actual MiDaS)
     * This creates a depth-like effect using image gradients
     */
    async estimateDepthSimplified(inputTensor) {
        return tf.tidy(() => {
            // Convert to grayscale
            const rgb = inputTensor.squeeze();
            const grayscale = rgb.mean(-1, true);

            // Apply Sobel edge detection for depth-like effect
            const sobelX = tf.tensor2d([
                [-1, 0, 1],
                [-2, 0, 2],
                [-1, 0, 1]
            ], [3, 3]).expandDims(2).expandDims(3);

            const sobelY = tf.tensor2d([
                [-1, -2, -1],
                [0, 0, 0],
                [1, 2, 1]
            ], [3, 3]).expandDims(2).expandDims(3);

            // Expand grayscale for convolution
            const gray4d = grayscale.expandDims(0).expandDims(3);

            // Apply edge detection
            const gradX = tf.conv2d(gray4d, sobelX, 1, 'same');
            const gradY = tf.conv2d(gray4d, sobelY, 1, 'same');

            // Combine gradients
            const gradient = tf.sqrt(
                tf.add(tf.square(gradX), tf.square(gradY))
            ).squeeze();

            // Invert and normalize to create depth-like map
            const depthLike = tf.sub(1.0, gradient);

            // Apply Gaussian blur for smoother depth map
            const blurred = tf.avgPool(
                depthLike.expandDims(0).expandDims(3),
                [5, 5],
                1,
                'same'
            ).squeeze();

            // Normalize to [0, 255] range
            const normalized = tf.mul(blurred, 255);

            return normalized;
        });
    }

    /**
     * Analyze depth map and compute statistics
     */
    async analyzeDepth(depthMap) {
        if (!depthMap) return null;

        const depthData = await depthMap.data();

        // Calculate statistics
        let sum = 0;
        let min = 255;
        let max = 0;

        for (let i = 0; i < depthData.length; i++) {
            sum += depthData[i];
            min = Math.min(min, depthData[i]);
            max = Math.max(max, depthData[i]);
        }

        const avg = sum / depthData.length;

        this.avgDepth = avg;
        this.minDepth = min;
        this.maxDepth = max;

        return {
            average: avg,
            min: min,
            max: max
        };
    }

    /**
     * Apply color mapping to depth values
     */
    applyColorMap(value, mode = 'turbo') {
        // Normalize value to [0, 1]
        const normalized = value / 255;

        switch (mode) {
            case 'grayscale':
                return [value, value, value];

            case 'turbo':
                return this.turboColormap(normalized);

            case 'plasma':
                return this.plasmaColormap(normalized);

            case 'viridis':
                return this.viridisColormap(normalized);

            default:
                return [value, value, value];
        }
    }

    /**
     * Turbo colormap (similar to matplotlib's turbo)
     */
    turboColormap(value) {
        const r = Math.max(0, Math.min(255,
            34.61 + value * (1172.33 - value * (10793.56 - value * (33300.12 - value * (38394.49 - value * 14825.05))))
        ));
        const g = Math.max(0, Math.min(255,
            23.31 + value * (557.33 + value * (1225.33 - value * (3574.96 - value * (1073.77 + value * 707.56))))
        ));
        const b = Math.max(0, Math.min(255,
            27.2 + value * (3211.1 - value * (15327.97 - value * (27814.0 - value * (22569.18 - value * 6838.66))))
        ));

        return [Math.round(r), Math.round(g), Math.round(b)];
    }

    /**
     * Plasma colormap
     */
    plasmaColormap(value) {
        const r = Math.round(255 * (0.05 + 0.5 * value + 0.5 * Math.sin(3.14 * value)));
        const g = Math.round(255 * (0.1 + 0.7 * Math.pow(value, 1.5)));
        const b = Math.round(255 * (0.9 - 0.9 * value));
        return [r, g, b];
    }

    /**
     * Viridis colormap
     */
    viridisColormap(value) {
        const r = Math.round(255 * (0.267 + 0.005 * value + 0.3 * Math.pow(value, 2)));
        const g = Math.round(255 * (0.004 + 0.4 * value + 0.4 * Math.pow(value, 2)));
        const b = Math.round(255 * (0.329 + 0.6 * value - 0.5 * Math.pow(value, 2)));
        return [r, g, b];
    }

    /**
     * Render depth map to canvas with color mapping
     */
    async renderDepthMap(ctx, depthMap, width, height, opacity = 0.6) {
        if (!depthMap) return;

        try {
            // Resize canvas if needed
            if (this.colorMapCanvas.width !== width || this.colorMapCanvas.height !== height) {
                this.colorMapCanvas.width = width;
                this.colorMapCanvas.height = height;
            }

            const colorCtx = this.colorMapCanvas.getContext('2d');

            // Get depth data
            const depthData = await depthMap.data();
            const depthWidth = depthMap.shape[1];
            const depthHeight = depthMap.shape[0];

            // Create ImageData for depth visualization
            const imageData = colorCtx.createImageData(depthWidth, depthHeight);

            // Apply color mapping
            for (let i = 0; i < depthData.length; i++) {
                const pixelIndex = i * 4;
                const [r, g, b] = this.applyColorMap(depthData[i], this.colorMode);

                imageData.data[pixelIndex] = r;
                imageData.data[pixelIndex + 1] = g;
                imageData.data[pixelIndex + 2] = b;
                imageData.data[pixelIndex + 3] = 255; // Full alpha
            }

            // Draw to color map canvas
            colorCtx.putImageData(imageData, 0, 0);

            // Draw scaled to main canvas with opacity
            ctx.globalAlpha = opacity;
            ctx.drawImage(this.colorMapCanvas, 0, 0, width, height);
            ctx.globalAlpha = 1.0;

            // Draw average depth indicator if enabled
            if (this.showAvgDepth) {
                this.drawDepthStats(ctx, width, height);
            }

        } catch (error) {
            console.error('Failed to render depth map:', error);
        }
    }

    /**
     * Draw depth statistics on canvas
     */
    drawDepthStats(ctx, width, height) {
        const padding = 12;
        const x = padding;
        const y = height - 80;
        const boxWidth = 180;
        const boxHeight = 60;

        // Helper function to draw rounded rectangle (polyfill for older browsers)
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

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        drawRoundedRect(x, y, boxWidth, boxHeight, 8);
        ctx.fill();

        // Text
        ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#FFFFFF';

        const avgText = `Avg Depth: ${this.avgDepth.toFixed(1)}`;
        const rangeText = `Range: ${this.minDepth.toFixed(0)}-${this.maxDepth.toFixed(0)}`;

        ctx.fillText('🌊 DEPTH MAP', x + 10, y + 20);
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(avgText, x + 10, y + 38);
        ctx.fillText(rangeText, x + 10, y + 52);
    }

    /**
     * Change color mode
     */
    setColorMode(mode) {
        const validModes = ['grayscale', 'turbo', 'plasma', 'viridis'];
        if (validModes.includes(mode)) {
            this.colorMode = mode;
            console.log('Depth color mode:', mode);
        }
    }

    /**
     * Export depth data for photo metadata
     */
    async exportDepthData(depthMap) {
        if (!depthMap) return null;

        const stats = await this.analyzeDepth(depthMap);

        return {
            average: stats.average,
            min: stats.min,
            max: stats.max,
            colorMode: this.colorMode,
            timestamp: Date.now()
        };
    }

    /**
     * Clean up resources
     */
    cleanup() {
        if (this.model) {
            this.model.dispose();
            this.model = null;
        }

        if (this.lastDepthMap) {
            this.lastDepthMap.dispose();
            this.lastDepthMap = null;
        }

        this.isModelLoaded = false;
        this.isEnabled = false;

        console.log('Depth prediction manager cleaned up');
    }
}

// Create singleton instance
const depthPredictionManager = new DepthPredictionManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = depthPredictionManager;
} else {
    window.depthPredictionManager = depthPredictionManager;
}
