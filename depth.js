/**
 * Depth Prediction Manager for PoliCamera
 * Uses Transformers.js with Depth-Anything V2 for state-of-the-art depth estimation
 */

console.log('🌊 Loading depth.js module...');

class DepthPredictionManager {
    constructor() {
        this.estimator = null; // Transformers.js pipeline
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

        // Model configuration - Using Depth-Anything V2 Small (fast, accurate, SOTA)
        this.modelName = 'Xenova/depth-anything-small';

        // Transformers.js pipeline library
        this.transformers = null;
    }

    /**
     * Check if depth prediction is supported
     */
    isSupported() {
        // Transformers.js works in all modern browsers
        return true;
    }

    /**
     * Initialize the Transformers.js depth prediction pipeline
     */
    async initializeModel() {
        if (this.isModelLoaded || this.isLoading) {
            console.log('Depth model already', this.isModelLoaded ? 'loaded' : 'loading');
            return this.isModelLoaded;
        }

        this.isLoading = true;
        console.log('🌊 Loading Depth-Anything V2 model via Transformers.js...');

        try {
            // Dynamically import Transformers.js (ES modules)
            console.log('📦 Loading Transformers.js library...');

            // Try multiple CDNs in parallel for faster loading
            const cdnUrls = [
                'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2',
                'https://unpkg.com/@huggingface/transformers@3.0.2/dist/transformers.min.js'
            ];

            console.log('📦 Loading Transformers.js from multiple CDNs in parallel...');

            // Create promises for each CDN with timeout
            const importPromises = cdnUrls.map((url, index) => {
                return new Promise(async (resolve, reject) => {
                    try {
                        const timeoutPromise = new Promise((_, timeoutReject) =>
                            setTimeout(() => timeoutReject(new Error(`Timeout loading from ${url}`)), 30000)
                        );

                        const result = await Promise.race([import(url), timeoutPromise]);
                        console.log(`✅ CDN ${index + 1} loaded successfully: ${url}`);
                        resolve({ url, result });
                    } catch (error) {
                        console.warn(`❌ CDN ${index + 1} failed: ${url} - ${error.message}`);
                        reject(error);
                    }
                });
            });

            try {
                // Use Promise.any to get the first successful load
                const { url, result } = await Promise.any(importPromises);
                this.transformers = result;
                console.log('✅ Transformers.js library loaded from:', url);
                console.log('Transformers version:', this.transformers.env?.version || 'unknown');

                // Configure Transformers.js environment for better reliability
                if (this.transformers.env) {
                    // Allow browser cache for models (reduces re-downloads)
                    this.transformers.env.useBrowserCache = true;
                    this.transformers.env.allowLocalModels = true;
                    this.transformers.env.allowRemoteModels = true;

                    // Add retry configuration for fetch requests
                    this.transformers.env.useCustomCache = false;

                    console.log('✅ Transformers.js environment configured for reliability');
                }
            } catch (aggregateError) {
                throw new Error('Failed to load Transformers.js from all CDNs: ' + aggregateError.errors.map(e => e.message).join(', '));
            }

            // Initialize canvases early
            this.preprocessCanvas = document.createElement('canvas');
            this.colorMapCanvas = document.createElement('canvas');

            // Try WASM first (more compatible than WebGPU)
            console.log('📥 Loading Depth-Anything V2 model (first load may take 30-60s)...');
            console.log('ℹ️  Model will be cached in browser for future use');
            console.log('ℹ️  Using WASM backend for maximum compatibility');

            // Helper function to load model with retry logic
            const loadModelWithRetry = async (device, maxRetries = 3) => {
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        console.log(`📥 Attempt ${attempt}/${maxRetries} to load model (${device})...`);

                        const estimator = await this.transformers.pipeline('depth-estimation', this.modelName, {
                            device: device,
                            dtype: 'fp32',
                            progress_callback: (progress) => {
                                if (progress.status === 'progress') {
                                    const percent = Math.round((progress.loaded / progress.total) * 100);
                                    console.log(`⏳ Downloading ${progress.file}: ${percent}%`);
                                } else if (progress.status === 'done') {
                                    console.log(`✅ Downloaded ${progress.file}`);
                                } else if (progress.status === 'initiate') {
                                    console.log(`📦 Starting download: ${progress.file}`);
                                }
                            }
                        });

                        return estimator; // Success!

                    } catch (error) {
                        console.warn(`⚠️ Attempt ${attempt} failed:`, error.message);

                        // Check if it's a 401/403 authentication error
                        if (error.message?.includes('401') || error.message?.includes('Unauthorized') ||
                            error.message?.includes('403') || error.message?.includes('Forbidden')) {
                            console.warn('🔒 Authentication error detected - HuggingFace API may be rate limiting');
                            console.log('💡 This is often temporary. The model will retry on next activation.');
                        }

                        if (attempt < maxRetries) {
                            const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
                            console.log(`⏱️  Retrying in ${delay/1000} seconds...`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        } else {
                            throw error; // Final attempt failed
                        }
                    }
                }
            };

            try {
                this.estimator = await loadModelWithRetry('wasm', 2); // 2 retries for WASM
                this.isModelLoaded = true;
                this.isLoading = false;
                console.log('✅ Depth-Anything V2 model loaded successfully (WASM)');
                return true;

            } catch (wasmError) {
                console.warn('⚠️ WASM loading failed after retries, trying WebGPU...', wasmError.message);

                // Fallback to WebGPU if WASM fails
                try {
                    this.estimator = await loadModelWithRetry('webgpu', 2); // 2 retries for WebGPU
                    this.isModelLoaded = true;
                    this.isLoading = false;
                    console.log('✅ Depth-Anything V2 model loaded successfully (WebGPU)');
                    return true;

                } catch (webgpuError) {
                    console.error('❌ WebGPU also failed after retries:', webgpuError.message);
                    throw new Error(`Both WASM and WebGPU failed. WASM: ${wasmError.message}, WebGPU: ${webgpuError.message}`);
                }
            }

        } catch (error) {
            console.error('❌ Failed to initialize Depth-Anything V2:', error);
            console.error('Error type:', error.constructor.name);
            console.error('Error message:', error.message);

            // Detailed error diagnosis
            if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
                console.error('🔒 HuggingFace API returned 401 Unauthorized');
                console.error('💡 Common causes:');
                console.error('   - HuggingFace rate limiting (temporary)');
                console.error('   - Model may require authentication');
                console.error('   - API service disruption');
                console.error('💡 Solutions:');
                console.error('   1. Wait a few minutes and try again');
                console.error('   2. The model will auto-retry when you click the depth button');
                console.error('   3. Check HuggingFace status: https://status.huggingface.co');
            } else if (error.message?.includes('timeout') || error.message?.includes('network') || error.message?.includes('fetch')) {
                console.error('🌐 Network error detected. Please check your internet connection.');
                console.error('💡 The model files are ~25MB and need to download on first use.');
            } else if (!this.transformers) {
                console.error('📦 Transformers.js library failed to load.');
                console.error('💡 Try refreshing the page or checking your internet connection.');
            }

            console.log('💡 Depth prediction will remain available - model loads on-demand when activated');

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
     * Warm up (preload) the depth model in the background
     * This downloads and initializes the model without enabling it
     * Call during app startup to avoid delay when user first activates depth
     */
    async warmUp() {
        if (this.isModelLoaded || this.isLoading) {
            console.log('🌊 Depth model already', this.isModelLoaded ? 'loaded' : 'loading');
            return;
        }

        console.log('🌊 Starting depth model warmup (background preload)...');
        console.log('💡 This will download ~25MB of model files on first run');

        // Initialize model in background (non-blocking)
        try {
            const success = await this.initializeModel();
            if (success) {
                console.log('✅ Depth model warmed up and ready to use');
                console.log('💡 Click the depth button to activate');
            } else {
                console.warn('⚠️ Depth model warmup failed - will retry when user activates');
            }
        } catch (error) {
            console.warn('⚠️ Depth model warmup error:', error.message);
            console.log('💡 Model will load on-demand when user clicks depth button');
        }
    }

    /**
     * Predict depth from image using Transformers.js
     */
    async predictDepth(imageElement, isRealTime = false) {
        if (!this.isModelLoaded || !this.estimator) {
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

        let output = null;
        let depthTensor = null;
        const tensorsToCleanup = [];

        try {
            // Dispose previous depth map to prevent memory leak
            if (this.lastDepthMap) {
                try {
                    if (this.lastDepthMap.dispose) {
                        this.lastDepthMap.dispose();
                    }
                } catch (e) {
                    console.warn('Failed to dispose previous depth map:', e);
                }
                this.lastDepthMap = null;
            }

            // Run depth estimation with Transformers.js
            output = await this.estimator(imageElement);

            // Extract depth tensor from output
            // Transformers.js returns { predicted_depth: Tensor, depth: RawImage }
            depthTensor = output.predicted_depth;
            tensorsToCleanup.push(depthTensor);

            // Convert to normalized 0-255 tensor (inverted: white=near, black=far)
            const normalizedDepth = await this.normalizeDepthTensor(depthTensor);

            // Cache result
            this.lastDepthMap = normalizedDepth;

            return normalizedDepth;

        } catch (error) {
            console.error('Depth prediction failed:', error);
            return null;
        } finally {
            // Always cleanup intermediate tensors to prevent memory leaks
            for (const tensor of tensorsToCleanup) {
                if (tensor && tensor !== this.lastDepthMap) {
                    try {
                        // Transformers.js tensors may have different disposal methods
                        if (typeof tensor.dispose === 'function') {
                            tensor.dispose();
                        } else if (typeof tensor.release === 'function') {
                            tensor.release();
                        }
                    } catch (e) {
                        // Ignore disposal errors for intermediate tensors
                        console.warn('Tensor cleanup warning:', e.message);
                    }
                }
            }
        }
    }

    /**
     * Normalize depth tensor to 0-255 range with inversion (white=near, black=far)
     */
    async normalizeDepthTensor(depthTensor) {
        if (!depthTensor) return null;

        try {
            // Get raw depth data
            const depthData = await depthTensor.data();
            const [height, width] = depthTensor.dims.slice(-2);

            // Find min/max for normalization
            let min = Infinity;
            let max = -Infinity;
            for (let i = 0; i < depthData.length; i++) {
                if (depthData[i] < min) min = depthData[i];
                if (depthData[i] > max) max = depthData[i];
            }

            // Create normalized and inverted depth data (white=near, black=far)
            const normalizedData = new Float32Array(depthData.length);
            const range = max - min;

            if (range > 0) {
                for (let i = 0; i < depthData.length; i++) {
                    // Normalize to 0-1
                    const normalized = (depthData[i] - min) / range;
                    // Invert (1 - normalized) so near is bright, far is dark
                    const inverted = 1.0 - normalized;
                    // Scale to 0-255
                    normalizedData[i] = inverted * 255;
                }
            }

            // Create a simple tensor-like object for compatibility
            // (We use TensorFlow.js tf.tensor2d for compatibility with rendering code)
            if (typeof tf !== 'undefined') {
                return tf.tensor2d(normalizedData, [height, width]);
            } else {
                // Fallback: return simple object
                return {
                    data: () => Promise.resolve(normalizedData),
                    shape: [height, width],
                    dispose: () => {} // No-op disposal
                };
            }

        } catch (error) {
            console.error('Failed to normalize depth tensor:', error);
            return null;
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
     * Render depth stats overlay
     */
    renderDepthStats(canvas, stats) {
        if (!canvas || !stats) return;

        const ctx = canvas.getContext('2d');

        // Position stats box in top-left corner
        const boxX = 20;
        const boxY = 80;
        const boxWidth = 180;
        const boxHeight = 80;

        // Draw semi-transparent background
        ctx.fillStyle = 'rgba(20, 21, 20, 0.9)';
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

        // Draw border
        ctx.strokeStyle = 'rgba(180, 242, 34, 0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

        // Draw text
        ctx.fillStyle = '#B4F222';
        ctx.font = 'bold 12px "Doto", monospace';
        ctx.textAlign = 'left';

        ctx.fillText('DEPTH MAP', boxX + 10, boxY + 20);

        ctx.font = '10px "Doto", monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`Avg: ${stats.average.toFixed(1)}`, boxX + 10, boxY + 40);
        ctx.fillText(`Min: ${stats.min.toFixed(1)}`, boxX + 10, boxY + 55);
        ctx.fillText(`Max: ${stats.max.toFixed(1)}`, boxX + 10, boxY + 70);
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        console.log('🧹 Cleaning up depth prediction resources...');

        this.isEnabled = false;
        this.isModelLoaded = false;

        // Wait a frame for any pending operations
        await new Promise(resolve => setTimeout(resolve, 100));

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

        // Note: Transformers.js models are cached by the browser
        // No explicit disposal needed for the pipeline
        this.estimator = null;

        console.log('✅ Depth prediction cleanup complete');
    }
}

// Create global instance
console.log('Creating global depthPredictionManager instance');
window.depthPredictionManager = new DepthPredictionManager();
