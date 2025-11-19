/**
 * Depth Prediction Manager for PoliCamera
 * Uses lightweight edge-based depth estimation with optional TensorFlow.js enhancement
 * NO external dependencies or CDN loading required
 */

console.log('🌊 Loading depth.js module...');

class DepthPredictionManager {
    constructor() {
        this.isModelLoaded = false;
        this.isLoading = false;
        this.isEnabled = false;

        // Performance settings - OPTIMIZED for real-time
        this.targetFrameTime = 1000 / 10; // 10 FPS for depth
        this.lastProcessTime = 0;

        // Visualization settings
        this.depthOpacity = 0.7;
        this.colorMode = 'inferno';
        this.showAvgDepth = true;

        // Cached depth data
        this.lastDepthMap = null;
        this.avgDepth = 0;
        this.minDepth = 0;
        this.maxDepth = 255;

        // Canvas pooling for better memory management
        this.preprocessCanvas = null;
        this.colorMapCanvas = null;

        // Cached ImageData for rendering optimization
        this.cachedImageData = null;
        this.cachedDepthWidth = 0;
        this.cachedDepthHeight = 0;

        // Processing canvas for edge detection
        this.processingCanvas = document.createElement('canvas');
        this.processingCtx = this.processingCanvas.getContext('2d', { willReadFrequently: true });

        // Depth estimation mode: 'edge' (fast), 'blur' (smooth), 'hybrid' (best quality)
        this.estimationMode = 'hybrid';

        console.log('✅ Depth estimation initialized (no external dependencies)');
        this.isModelLoaded = true; // Always ready since we use client-side processing
    }

    /**
     * Check if depth prediction is supported
     */
    isSupported() {
        // Works in all browsers with canvas support
        return typeof document.createElement('canvas').getContext === 'function';
    }

    /**
     * Initialize the depth estimation
     * No model loading required - using edge-based depth estimation
     */
    async initializeModel() {
        if (this.isModelLoaded) {
            console.log('✅ Depth estimation already ready');
            return true;
        }

        console.log('🌊 Initializing edge-based depth estimation...');

        try {
            // Initialize canvases
            this.preprocessCanvas = document.createElement('canvas');
            this.colorMapCanvas = document.createElement('canvas');
            this.processingCanvas = document.createElement('canvas');
            this.processingCtx = this.processingCanvas.getContext('2d', { willReadFrequently: true });

            this.isModelLoaded = true;
            console.log('✅ Depth estimation ready (edge-based, fast)');
            console.log('💡 No model download required - using client-side algorithms');
            return true;

        } catch (error) {
            console.error('❌ Failed to initialize depth estimation:', error);
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
                throw new Error('Failed to initialize depth estimation');
            }
        }

        this.isEnabled = !this.isEnabled;
        console.log('Depth prediction:', this.isEnabled ? 'enabled' : 'disabled');
        return this.isEnabled;
    }

    /**
     * Warm up (preload) - No-op since we don't need to load models
     */
    async warmUp() {
        console.log('🌊 Depth estimation ready (no warmup needed)');
        return this.initializeModel();
    }

    /**
     * Predict depth from image using edge-based depth estimation
     *
     * This uses a hybrid approach:
     * 1. Edge detection (Sobel filters) - identifies object boundaries
     * 2. Gradient magnitude - estimates depth from intensity changes
     * 3. Blur analysis - far objects are typically blurrier
     * 4. Brightness analysis - darker areas often indicate depth
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
            // Dispose previous depth map to prevent memory leak
            if (this.lastDepthMap && this.lastDepthMap.dispose) {
                try {
                    this.lastDepthMap.dispose();
                } catch (e) {
                    console.warn('Failed to dispose previous depth map:', e);
                }
                this.lastDepthMap = null;
            }

            // Get image dimensions
            const width = imageElement.videoWidth || imageElement.width;
            const height = imageElement.videoHeight || imageElement.height;

            // Downsample for performance (depth doesn't need full resolution)
            const targetWidth = 320;
            const targetHeight = Math.floor(height * (targetWidth / width));

            // Set canvas size
            this.processingCanvas.width = targetWidth;
            this.processingCanvas.height = targetHeight;

            // Draw image to processing canvas
            this.processingCtx.drawImage(imageElement, 0, 0, targetWidth, targetHeight);

            // Get image data
            const imageData = this.processingCtx.getImageData(0, 0, targetWidth, targetHeight);

            // Estimate depth based on mode
            let depthData;
            switch (this.estimationMode) {
                case 'edge':
                    depthData = this.estimateDepthFromEdges(imageData);
                    break;
                case 'blur':
                    depthData = this.estimateDepthFromBlur(imageData);
                    break;
                case 'hybrid':
                default:
                    depthData = this.estimateDepthHybrid(imageData);
                    break;
            }

            // Create tensor-like object compatible with rendering code
            const depthMap = this.createDepthTensor(depthData, targetHeight, targetWidth);

            // Cache result
            this.lastDepthMap = depthMap;

            return depthMap;

        } catch (error) {
            console.error('Depth prediction failed:', error);
            return null;
        }
    }

    /**
     * Estimate depth using edge detection (Sobel filters)
     * Objects with strong edges are typically closer
     */
    estimateDepthFromEdges(imageData) {
        const { data, width, height } = imageData;
        const depthData = new Float32Array(width * height);

        // Sobel kernels for edge detection
        const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
        const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

        // Process each pixel
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let gx = 0, gy = 0;

                // Apply Sobel filters
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4;
                        const kernelIdx = (ky + 1) * 3 + (kx + 1);

                        // Use grayscale value (average RGB)
                        const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

                        gx += gray * sobelX[kernelIdx];
                        gy += gray * sobelY[kernelIdx];
                    }
                }

                // Calculate gradient magnitude
                const gradient = Math.sqrt(gx * gx + gy * gy);

                // Normalize and invert (strong edges = near = bright)
                const pixelIdx = y * width + x;
                depthData[pixelIdx] = Math.min(255, gradient * 1.5);
            }
        }

        return depthData;
    }

    /**
     * Estimate depth from local variance (blur analysis)
     * Blurry regions are typically farther away
     */
    estimateDepthFromBlur(imageData) {
        const { data, width, height } = imageData;
        const depthData = new Float32Array(width * height);
        const windowSize = 5; // 5x5 window for variance calculation

        for (let y = windowSize; y < height - windowSize; y++) {
            for (let x = windowSize; x < width - windowSize; x++) {
                let sum = 0;
                let sumSq = 0;
                let count = 0;

                // Calculate local variance
                for (let wy = -windowSize; wy <= windowSize; wy++) {
                    for (let wx = -windowSize; wx <= windowSize; wx++) {
                        const idx = ((y + wy) * width + (x + wx)) * 4;
                        const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

                        sum += gray;
                        sumSq += gray * gray;
                        count++;
                    }
                }

                // Variance = E[X²] - E[X]²
                const mean = sum / count;
                const variance = (sumSq / count) - (mean * mean);

                // Higher variance = sharper = closer
                const pixelIdx = y * width + x;
                depthData[pixelIdx] = Math.min(255, variance * 2);
            }
        }

        return depthData;
    }

    /**
     * Hybrid depth estimation combining multiple cues
     * - Edge strength (object boundaries)
     * - Local variance (blur/sharpness)
     * - Brightness (darker often means farther)
     */
    estimateDepthHybrid(imageData) {
        const { data, width, height } = imageData;
        const depthData = new Float32Array(width * height);

        // Sobel kernels
        const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
        const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

        for (let y = 2; y < height - 2; y++) {
            for (let x = 2; x < width - 2; x++) {
                // 1. Edge detection
                let gx = 0, gy = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4;
                        const kernelIdx = (ky + 1) * 3 + (kx + 1);
                        const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                        gx += gray * sobelX[kernelIdx];
                        gy += gray * sobelY[kernelIdx];
                    }
                }
                const edgeStrength = Math.sqrt(gx * gx + gy * gy);

                // 2. Local variance (sharpness)
                let sum = 0, sumSq = 0, count = 0;
                for (let wy = -2; wy <= 2; wy++) {
                    for (let wx = -2; wx <= 2; wx++) {
                        const idx = ((y + wy) * width + (x + wx)) * 4;
                        const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                        sum += gray;
                        sumSq += gray * gray;
                        count++;
                    }
                }
                const mean = sum / count;
                const variance = (sumSq / count) - (mean * mean);

                // 3. Brightness (darker = farther, inverted for our display)
                const centerIdx = (y * width + x) * 4;
                const brightness = (data[centerIdx] + data[centerIdx + 1] + data[centerIdx + 2]) / 3;

                // Combine cues with weights
                // Edge (40%) + Variance (40%) + Brightness (20%)
                const depthEstimate =
                    (edgeStrength * 0.4) +
                    (variance * 1.5 * 0.4) +
                    (brightness * 0.2);

                const pixelIdx = y * width + x;
                depthData[pixelIdx] = Math.min(255, depthEstimate);
            }
        }

        return depthData;
    }

    /**
     * Create a tensor-like object compatible with TensorFlow.js API
     */
    createDepthTensor(depthData, height, width) {
        // If TensorFlow.js is available, use real tensors
        if (typeof tf !== 'undefined') {
            return tf.tensor2d(depthData, [height, width]);
        } else {
            // Fallback: create compatible object
            return {
                data: () => Promise.resolve(depthData),
                shape: [height, width],
                dims: [height, width],
                dispose: () => {} // No-op disposal for raw arrays
            };
        }
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
     * Export depth data for saving
     */
    async exportDepthData(depthMap) {
        if (!depthMap) return null;

        const stats = await this.analyzeDepth(depthMap);

        return {
            average: stats.average,
            min: stats.min,
            max: stats.max,
            colorMode: this.colorMode,
            estimationMode: this.estimationMode,
        };
    }

    /**
     * Apply color mapping to depth values
     */
    applyColorMap(value, mode = 'inferno') {
        // Normalize value to 0-1 range
        const normalized = value / 255;

        // Apply color map
        switch (mode) {
            case 'inferno':
                return this.infernoColorMap(normalized);
            case 'viridis':
                return this.viridisColorMap(normalized);
            case 'plasma':
                return this.plasmaColorMap(normalized);
            case 'grayscale':
                return [value, value, value];
            default:
                return this.infernoColorMap(normalized);
        }
    }

    /**
     * Inferno color map (perceptually uniform, good for depth)
     */
    infernoColorMap(value) {
        // Simplified inferno colormap
        const r = Math.min(255, Math.max(0, 255 * (1.5 * value - 0.3)));
        const g = Math.min(255, Math.max(0, 255 * (1.5 * value - 0.5)));
        const b = Math.min(255, Math.max(0, 255 * (2.0 * value - 1.0)));
        return [r, g, b];
    }

    /**
     * Viridis color map
     */
    viridisColorMap(value) {
        const r = Math.min(255, Math.max(0, 255 * (0.26 + 1.0 * value)));
        const g = Math.min(255, Math.max(0, 255 * (0.0 + 1.2 * value)));
        const b = Math.min(255, Math.max(0, 255 * (0.33 + 0.8 * value)));
        return [r, g, b];
    }

    /**
     * Plasma color map
     */
    plasmaColorMap(value) {
        const r = Math.min(255, Math.max(0, 255 * (0.5 + 0.8 * value)));
        const g = Math.min(255, Math.max(0, 255 * (0.0 + 1.0 * value * value)));
        const b = Math.min(255, Math.max(0, 255 * (0.5 + 0.5 * value)));
        return [r, g, b];
    }

    /**
     * Render depth map to canvas with color mapping
     */
    async renderDepthMap(canvas, depthMap, opacity = 0.7) {
        if (!canvas || !depthMap) return;

        const ctx = canvas.getContext('2d');
        const depthData = await depthMap.data();
        const [depthHeight, depthWidth] = depthMap.shape || [canvas.height, canvas.width];

        // Resize canvas if needed
        if (canvas.width !== depthWidth || canvas.height !== depthHeight) {
            canvas.width = depthWidth;
            canvas.height = depthHeight;
        }

        // Create or reuse ImageData
        if (!this.cachedImageData ||
            this.cachedDepthWidth !== depthWidth ||
            this.cachedDepthHeight !== depthHeight) {
            this.cachedImageData = ctx.createImageData(depthWidth, depthHeight);
            this.cachedDepthWidth = depthWidth;
            this.cachedDepthHeight = depthHeight;
        }

        const imageData = this.cachedImageData;
        const data = imageData.data;

        // Apply color mapping to each pixel
        for (let i = 0; i < depthData.length; i++) {
            const pixelIndex = i * 4;
            const depthValue = depthData[i];

            // Apply color map
            const [r, g, b] = this.applyColorMap(depthValue, this.colorMode);

            data[pixelIndex] = r;
            data[pixelIndex + 1] = g;
            data[pixelIndex + 2] = b;
            data[pixelIndex + 3] = opacity * 255;
        }

        // Render to canvas
        ctx.putImageData(imageData, 0, 0);
    }

    /**
     * Render picture-in-picture depth view (top-left corner)
     */
    async renderPictureInPicture(overlayCtx, depthMap, overlayWidth, overlayHeight) {
        if (!overlayCtx || !depthMap) return;

        const pipSize = 0.15; // 15% of overlay size
        const pipWidth = Math.floor(overlayWidth * pipSize);
        const pipHeight = Math.floor(overlayHeight * pipSize);
        const pipX = 10;
        const pipY = 10;

        // Get depth data
        const depthData = await depthMap.data();
        const [depthHeight, depthWidth] = depthMap.shape;

        // Create temporary canvas for depth rendering
        if (!this.colorMapCanvas) {
            this.colorMapCanvas = document.createElement('canvas');
        }
        this.colorMapCanvas.width = depthWidth;
        this.colorMapCanvas.height = depthHeight;

        const tempCtx = this.colorMapCanvas.getContext('2d');
        const imageData = tempCtx.createImageData(depthWidth, depthHeight);
        const data = imageData.data;

        // Render depth with color mapping
        for (let i = 0; i < depthData.length; i++) {
            const pixelIndex = i * 4;
            const [r, g, b] = this.applyColorMap(depthData[i], this.colorMode);
            data[pixelIndex] = r;
            data[pixelIndex + 1] = g;
            data[pixelIndex + 2] = b;
            data[pixelIndex + 3] = 255;
        }

        tempCtx.putImageData(imageData, 0, 0);

        // Draw PiP background
        overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        overlayCtx.fillRect(pipX, pipY, pipWidth, pipHeight);

        // Draw scaled depth map
        overlayCtx.drawImage(this.colorMapCanvas, pipX, pipY, pipWidth, pipHeight);

        // Draw border
        overlayCtx.strokeStyle = 'rgba(180, 242, 34, 0.8)';
        overlayCtx.lineWidth = 2;
        overlayCtx.strokeRect(pipX, pipY, pipWidth, pipHeight);

        // Draw label
        overlayCtx.fillStyle = 'rgba(180, 242, 34, 0.9)';
        overlayCtx.font = 'bold 10px monospace';
        overlayCtx.fillText('DEPTH', pipX + 5, pipY + 15);
    }

    /**
     * Render depth stats overlay
     */
    renderDepthStats(canvas, stats) {
        if (!canvas || !stats) return;

        const ctx = canvas.getContext('2d');

        // Position stats box in top-left corner
        const boxX = 20;
        const boxY = 80;
        const boxWidth = 180;
        const boxHeight = 100;

        // Draw semi-transparent background
        ctx.fillStyle = 'rgba(20, 21, 20, 0.9)';
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

        // Draw border
        ctx.strokeStyle = 'rgba(180, 242, 34, 0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

        // Draw text
        ctx.fillStyle = '#B4F222';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';

        ctx.fillText('DEPTH MAP', boxX + 10, boxY + 20);

        ctx.font = '10px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`Mode: ${this.estimationMode}`, boxX + 10, boxY + 40);
        ctx.fillText(`Avg: ${stats.average.toFixed(1)}`, boxX + 10, boxY + 55);
        ctx.fillText(`Min: ${stats.min.toFixed(1)}`, boxX + 10, boxY + 70);
        ctx.fillText(`Max: ${stats.max.toFixed(1)}`, boxX + 10, boxY + 85);
    }

    /**
     * Set depth estimation mode
     * @param mode - 'edge', 'blur', or 'hybrid'
     */
    setEstimationMode(mode) {
        if (['edge', 'blur', 'hybrid'].includes(mode)) {
            this.estimationMode = mode;
            console.log(`🌊 Depth estimation mode: ${mode}`);
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        console.log('🧹 Cleaning up depth prediction resources...');

        this.isEnabled = false;

        // Dispose last depth map
        if (this.lastDepthMap) {
            try {
                if (this.lastDepthMap.dispose) {
                    this.lastDepthMap.dispose();
                }
            } catch (error) {
                console.warn('Error disposing depth map:', error);
            }
            this.lastDepthMap = null;
        }

        // Clear cached data
        this.cachedImageData = null;
        this.cachedDepthWidth = 0;
        this.cachedDepthHeight = 0;

        console.log('✅ Depth prediction cleanup complete');
    }
}

// Create global instance
console.log('Creating global depthPredictionManager instance');
window.depthPredictionManager = new DepthPredictionManager();
