/**
 * Depth Prediction Manager for PoliCamera
 * Uses TensorFlow.js with MiDaS model for monocular depth estimation
 */

console.log('🌊 Loading depth.js module...');

class DepthPredictionManager {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.isLoading = false;
        this.isEnabled = false;

        // Performance settings - OPTIMIZED for real-time
        this.inputSize = 128; // Reduced from 256 for 4x faster processing
        this.targetFrameTime = 1000 / 10; // 10 FPS for depth (even more conservative)
        this.lastProcessTime = 0;

        // Visualization settings (OPTIMIZED for performance)
        this.depthOpacity = 0.7; // Increased opacity for better visibility
        this.colorMode = 'distance'; // Green (near) to Red (far) - optimized for distance visualization
        this.showAvgDepth = true; // Show average depth value

        // Dual view mode
        this.dualViewMode = false; // When true, render to separate canvas
        this.depthCanvas = null; // Reference to dedicated depth canvas

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

        // Model URL - Using a publicly available MiDaS TFLite model
        // Note: You'll need to host this model file or use a CDN
        this.modelUrl = 'https://tfhub.dev/intel/lite-model/midas/v2_1_small/1/lite/1';
    }

    /**
     * Check if depth prediction is supported
     */
    isSupported() {
        const supported = typeof tf !== 'undefined';
        if (!supported) {
            console.warn('⚠️ TensorFlow.js not yet available for depth prediction');
        }
        return supported;
    }

    /**
     * Initialize the depth prediction model (LAZY LOADED)
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
        console.log('🌊 Loading depth prediction model (lazy init)...');

        try {
            // Wait for TensorFlow.js to be ready (use existing backend)
            // This might wait if TF.js is still loading
            while (typeof tf === 'undefined') {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            await tf.ready();
            const backend = tf.getBackend();
            console.log(`Using ${backend} backend for depth prediction`);

            // For now, we'll use a custom approach with edge detection
            // A proper implementation would load the actual MiDaS TFLite model
            // This is a placeholder that demonstrates the structure
            console.log('⚠️ Note: Using simplified depth estimation approach');
            console.log('For production, integrate actual MiDaS TFLite model');

            // Initialize preprocessing canvas (only when needed)
            this.preprocessCanvas = document.createElement('canvas');
            this.preprocessCanvas.width = this.inputSize;
            this.preprocessCanvas.height = this.inputSize;

            // Initialize color map canvas
            this.colorMapCanvas = document.createElement('canvas');

            this.isModelLoaded = true;
            this.isLoading = false;

            console.log('✅ Depth prediction initialized (lazy loaded in ' + performance.now() + 'ms)');
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
            // Use canvas-based depth estimation (no TensorFlow.js required)
            const depthMap = await this.estimateDepthSimplified(imageElement);

            // Cache result
            this.lastDepthMap = depthMap;

            return depthMap;

        } catch (error) {
            console.error('Depth prediction failed:', error);
            return null;
        }
    }

    /**
     * Simplified depth estimation using canvas operations (placeholder for actual MiDaS)
     * This creates a depth-like effect using brightness and edge analysis
     */
    async estimateDepthSimplified(imageElement) {
        try {
            const ctx = this.preprocessCanvas.getContext('2d', { willReadFrequently: true });

            // Draw image to preprocessing canvas at model input size
            ctx.drawImage(imageElement, 0, 0, this.inputSize, this.inputSize);

            // Get image data
            const imageData = ctx.getImageData(0, 0, this.inputSize, this.inputSize);
            const data = imageData.data;

            // Create depth map using brightness-based estimation
            // Brighter areas are assumed to be closer (simple heuristic)
            const depthData = new Float32Array(this.inputSize * this.inputSize);

            for (let i = 0; i < data.length; i += 4) {
                const pixelIndex = i / 4;

                // Calculate brightness (luminance)
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

                // Simple depth heuristic: invert brightness for depth-like effect
                // Darker areas = farther, brighter areas = closer
                depthData[pixelIndex] = 255 - brightness;
            }

            // Apply simple blur for smoothing (reduced radius for speed)
            const blurred = this.applyBoxBlur(depthData, this.inputSize, this.inputSize, 2);

            // Create TensorFlow.js tensor from the depth data
            const depthTensor = tf.tensor2d(blurred, [this.inputSize, this.inputSize]);

            return depthTensor;

        } catch (error) {
            console.error('Simplified depth estimation failed:', error);
            return null;
        }
    }

    /**
     * Apply separable box blur for smoothing depth map (OPTIMIZED)
     * Uses two 1D passes instead of 2D kernel for O(n*radius) instead of O(n*radius²)
     */
    applyBoxBlur(data, width, height, radius) {
        // Use separable filter: horizontal pass then vertical pass
        const temp = new Float32Array(data.length);
        const result = new Float32Array(data.length);

        // Horizontal pass
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                let count = 0;

                // Sample horizontal kernel
                for (let kx = -radius; kx <= radius; kx++) {
                    const px = x + kx;
                    if (px >= 0 && px < width) {
                        sum += data[y * width + px];
                        count++;
                    }
                }

                temp[y * width + x] = sum / count;
            }
        }

        // Vertical pass on horizontal-blurred data
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                let count = 0;

                // Sample vertical kernel
                for (let ky = -radius; ky <= radius; ky++) {
                    const py = y + ky;
                    if (py >= 0 && py < height) {
                        sum += temp[py * width + x];
                        count++;
                    }
                }

                result[y * width + x] = sum / count;
            }
        }

        return result;
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
    applyColorMap(value, mode = 'distance') {
        // Normalize value to [0, 1]
        const normalized = value / 255;

        switch (mode) {
            case 'distance':
                return this.distanceColormap(normalized);

            case 'grayscale':
                return [value, value, value];

            case 'turbo':
                return this.turboColormap(normalized);

            case 'plasma':
                return this.plasmaColormap(normalized);

            case 'viridis':
                return this.viridisColormap(normalized);

            default:
                return this.distanceColormap(normalized);
        }
    }

    /**
     * Distance colormap - Green (near) to Red (far)
     * Optimized for depth visualization
     */
    distanceColormap(value) {
        // value: 0 = close (green), 1 = far (red)

        // Light green for near: RGB(144, 238, 144)
        // Yellow-ish middle: RGB(255, 255, 0)
        // Orange middle-far: RGB(255, 165, 0)
        // Dark red for far: RGB(139, 0, 0)

        if (value < 0.33) {
            // Green to Yellow (near to middle-near)
            const t = value / 0.33;
            const r = Math.round(144 + (255 - 144) * t);
            const g = Math.round(238 + (255 - 238) * t);
            const b = Math.round(144 - 144 * t);
            return [r, g, b];
        } else if (value < 0.67) {
            // Yellow to Orange (middle-near to middle-far)
            const t = (value - 0.33) / 0.34;
            const r = 255;
            const g = Math.round(255 - (255 - 165) * t);
            const b = 0;
            return [r, g, b];
        } else {
            // Orange to Dark Red (middle-far to far)
            const t = (value - 0.67) / 0.33;
            const r = Math.round(255 - (255 - 139) * t);
            const g = Math.round(165 - 165 * t);
            const b = 0;
            return [r, g, b];
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
     * Render depth map to canvas with color mapping (OPTIMIZED)
     */
    async renderDepthMap(ctx, depthMap, width, height, opacity = 0.6) {
        if (!depthMap) return;

        try {
            // Resize canvas if needed
            if (this.colorMapCanvas.width !== width || this.colorMapCanvas.height !== height) {
                this.colorMapCanvas.width = width;
                this.colorMapCanvas.height = height;
            }

            const colorCtx = this.colorMapCanvas.getContext('2d', { willReadFrequently: true });

            // Get depth data
            const depthData = await depthMap.data();
            const depthWidth = depthMap.shape[1];
            const depthHeight = depthMap.shape[0];

            // Create or reuse ImageData (OPTIMIZATION)
            if (!this.cachedImageData ||
                this.cachedDepthWidth !== depthWidth ||
                this.cachedDepthHeight !== depthHeight) {
                this.cachedImageData = colorCtx.createImageData(depthWidth, depthHeight);
                this.cachedDepthWidth = depthWidth;
                this.cachedDepthHeight = depthHeight;
            }

            const imageData = this.cachedImageData;
            const data = imageData.data;

            // Apply color mapping (optimized with direct array access)
            for (let i = 0; i < depthData.length; i++) {
                const pixelIndex = i * 4;
                const depthValue = depthData[i];
                const normalized = depthValue / 255;

                // Inline color mapping for distance mode (most common) for speed
                if (this.colorMode === 'distance') {
                    // Optimized inline distance colormap: Green (near) to Red (far)
                    if (normalized < 0.33) {
                        const t = normalized / 0.33;
                        data[pixelIndex] = Math.round(144 + (255 - 144) * t);
                        data[pixelIndex + 1] = Math.round(238 + (255 - 238) * t);
                        data[pixelIndex + 2] = Math.round(144 - 144 * t);
                    } else if (normalized < 0.67) {
                        const t = (normalized - 0.33) / 0.34;
                        data[pixelIndex] = 255;
                        data[pixelIndex + 1] = Math.round(255 - (255 - 165) * t);
                        data[pixelIndex + 2] = 0;
                    } else {
                        const t = (normalized - 0.67) / 0.33;
                        data[pixelIndex] = Math.round(255 - (255 - 139) * t);
                        data[pixelIndex + 1] = Math.round(165 - 165 * t);
                        data[pixelIndex + 2] = 0;
                    }
                } else if (this.colorMode === 'turbo') {
                    // Inline turbo colormap for speed
                    data[pixelIndex] = Math.round(Math.max(0, Math.min(255,
                        34.61 + normalized * (1172.33 - normalized * (10793.56 - normalized * (33300.12 - normalized * (38394.49 - normalized * 14825.05))))
                    )));
                    data[pixelIndex + 1] = Math.round(Math.max(0, Math.min(255,
                        23.31 + normalized * (557.33 + normalized * (1225.33 - normalized * (3574.96 - normalized * (1073.77 + normalized * 707.56))))
                    )));
                    data[pixelIndex + 2] = Math.round(Math.max(0, Math.min(255,
                        27.2 + normalized * (3211.1 - normalized * (15327.97 - normalized * (27814.0 - normalized * (22569.18 - normalized * 6838.66))))
                    )));
                } else {
                    // Fallback to method call for other modes
                    const [r, g, b] = this.applyColorMap(depthValue, this.colorMode);
                    data[pixelIndex] = r;
                    data[pixelIndex + 1] = g;
                    data[pixelIndex + 2] = b;
                }
                data[pixelIndex + 3] = 255; // Full alpha
            }

            // Draw to color map canvas
            colorCtx.putImageData(imageData, 0, 0);

            // Draw scaled to main canvas with opacity
            ctx.globalAlpha = opacity;
            ctx.drawImage(this.colorMapCanvas, 0, 0, width, height);
            ctx.globalAlpha = 1.0;

            // Analyze depth statistics for display
            if (this.showAvgDepth) {
                await this.analyzeDepth(depthMap);
                this.drawDepthStats(ctx, width, height);
            }

            // Draw "DEPTH ACTIVE" indicator in top-right
            this.drawActiveIndicator(ctx, width, height);

        } catch (error) {
            console.error('Failed to render depth map:', error);
        }
    }

    /**
     * Draw depth statistics on canvas
     */
    drawDepthStats(ctx, width, height) {
        const padding = 12;

        // Adjust positioning and size for narrow screens to prevent overlap
        const isNarrowScreen = width < 400;
        const boxWidth = isNarrowScreen ? 160 : 200;
        const boxHeight = isNarrowScreen ? 65 : 75;

        const x = padding;
        const y = isNarrowScreen ? padding + 45 : padding + 50; // Top-left, avoiding "DEPTH ACTIVE" indicator

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

        // Background with border
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        drawRoundedRect(x, y, boxWidth, boxHeight, 8);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(27, 194, 152, 0.8)'; // Turquoise border for depth
        ctx.lineWidth = 2;
        drawRoundedRect(x, y, boxWidth, boxHeight, 8);
        ctx.stroke();

        // Text with responsive font sizes
        const titleFontSize = isNarrowScreen ? 12 : 14;
        const mainFontSize = isNarrowScreen ? 10 : 12;
        const subFontSize = isNarrowScreen ? 9 : 11;

        ctx.font = `bold ${titleFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = '#90EE90'; // Light green color to match near objects

        const avgText = `Avg Depth: ${this.avgDepth.toFixed(1)}`;
        const rangeText = `Range: ${this.minDepth.toFixed(0)}-${this.maxDepth.toFixed(0)}`;
        const modeText = `🟢 Near → 🔴 Far`;

        ctx.fillText('🌊 DEPTH OVERLAY', x + 10, y + 22);
        ctx.font = `${mainFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(avgText, x + 10, y + 42);
        ctx.fillText(rangeText, x + 10, y + 58);
        ctx.font = `${subFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(modeText, x + 10, isNarrowScreen ? y + 58 : y + 72);
    }

    /**
     * Draw active indicator in top-right corner
     */
    drawActiveIndicator(ctx, width, height) {
        const padding = 12;

        // Adjust size for narrow screens
        const isNarrowScreen = width < 400;
        const boxWidth = isNarrowScreen ? 110 : 140;
        const boxHeight = isNarrowScreen ? 28 : 32;

        const x = width - boxWidth - padding;
        const y = padding;

        // Helper function for rounded rectangle
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

        // Gradient background (green to red)
        const gradient = ctx.createLinearGradient(x, y, x + boxWidth, y);
        gradient.addColorStop(0, 'rgba(144, 238, 144, 0.9)'); // Light green
        gradient.addColorStop(0.5, 'rgba(255, 255, 0, 0.9)'); // Yellow
        gradient.addColorStop(1, 'rgba(139, 0, 0, 0.9)'); // Dark red
        ctx.fillStyle = gradient;
        drawRoundedRect(x, y, boxWidth, boxHeight, 6);
        ctx.fill();

        // Text with responsive font size
        const fontSize = isNarrowScreen ? 11 : 13;
        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const text = isNarrowScreen ? '🌊 DEPTH' : '🌊 DEPTH ACTIVE';
        ctx.fillText(text, x + boxWidth / 2, y + boxHeight / 2);

        // Reset text alignment
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    /**
     * Enable/disable dual view mode
     */
    setDualViewMode(enabled, depthCanvasId = 'depthCanvas') {
        this.dualViewMode = enabled;

        if (enabled) {
            this.depthCanvas = document.getElementById(depthCanvasId);
            if (!this.depthCanvas) {
                console.error('Depth canvas not found:', depthCanvasId);
                this.dualViewMode = false;
                return false;
            }
            console.log('🌊 Dual view mode enabled - rendering to separate canvas');
        } else {
            this.depthCanvas = null;
            console.log('🌊 Dual view mode disabled - rendering as overlay');
        }

        return this.dualViewMode;
    }

    /**
     * Render depth map to dedicated canvas (for dual view mode)
     */
    async renderDepthMapToCanvas(depthMap, canvasElement) {
        if (!depthMap || !canvasElement) return;

        try {
            const ctx = canvasElement.getContext('2d', { willReadFrequently: true });
            const width = canvasElement.width;
            const height = canvasElement.height;

            // Resize canvas if needed
            if (this.colorMapCanvas.width !== width || this.colorMapCanvas.height !== height) {
                this.colorMapCanvas.width = width;
                this.colorMapCanvas.height = height;
            }

            const colorCtx = this.colorMapCanvas.getContext('2d', { willReadFrequently: true });

            // Get depth data
            const depthData = await depthMap.data();
            const depthWidth = depthMap.shape[1];
            const depthHeight = depthMap.shape[0];

            // Create or reuse ImageData
            if (!this.cachedImageData ||
                this.cachedDepthWidth !== depthWidth ||
                this.cachedDepthHeight !== depthHeight) {
                this.cachedImageData = colorCtx.createImageData(depthWidth, depthHeight);
                this.cachedDepthWidth = depthWidth;
                this.cachedDepthHeight = depthHeight;
            }

            const imageData = this.cachedImageData;
            const data = imageData.data;

            // Apply color mapping (same as overlay mode)
            for (let i = 0; i < depthData.length; i++) {
                const pixelIndex = i * 4;
                const depthValue = depthData[i];
                const normalized = depthValue / 255;

                // Inline distance colormap
                if (this.colorMode === 'distance') {
                    if (normalized < 0.33) {
                        const t = normalized / 0.33;
                        data[pixelIndex] = Math.round(144 + (255 - 144) * t);
                        data[pixelIndex + 1] = Math.round(238 + (255 - 238) * t);
                        data[pixelIndex + 2] = Math.round(144 - 144 * t);
                    } else if (normalized < 0.67) {
                        const t = (normalized - 0.33) / 0.34;
                        data[pixelIndex] = 255;
                        data[pixelIndex + 1] = Math.round(255 - (255 - 165) * t);
                        data[pixelIndex + 2] = 0;
                    } else {
                        const t = (normalized - 0.67) / 0.33;
                        data[pixelIndex] = Math.round(255 - (255 - 139) * t);
                        data[pixelIndex + 1] = Math.round(165 - 165 * t);
                        data[pixelIndex + 2] = 0;
                    }
                } else {
                    // Fallback to method call for other modes
                    const [r, g, b] = this.applyColorMap(depthValue, this.colorMode);
                    data[pixelIndex] = r;
                    data[pixelIndex + 1] = g;
                    data[pixelIndex + 2] = b;
                }
                data[pixelIndex + 3] = 255; // Full alpha
            }

            // Draw to color map canvas
            colorCtx.putImageData(imageData, 0, 0);

            // Clear canvas and draw scaled depth map
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(this.colorMapCanvas, 0, 0, width, height);

            // Draw depth statistics
            if (this.showAvgDepth) {
                await this.analyzeDepth(depthMap);
                this.drawDepthStats(ctx, width, height);
            }

        } catch (error) {
            console.error('Failed to render depth map to canvas:', error);
        }
    }

    /**
     * Change color mode
     */
    setColorMode(mode) {
        const validModes = ['distance', 'grayscale', 'turbo', 'plasma', 'viridis'];
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
console.log('🌊 Creating depth prediction manager singleton...');
let depthPredictionManager;

try {
    depthPredictionManager = new DepthPredictionManager();
    console.log('✅ Depth prediction manager instance created');
} catch (error) {
    console.error('❌ Failed to create depth prediction manager:', error);
    // Create a dummy object to prevent undefined errors
    depthPredictionManager = {
        isSupported: () => false,
        initializeModel: async () => false,
        toggle: async () => { throw new Error('Depth prediction not available'); },
        predictDepth: async () => null,
        cleanup: () => {}
    };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = depthPredictionManager;
} else {
    window.depthPredictionManager = depthPredictionManager;
    console.log('✅ Depth prediction manager exported to window.depthPredictionManager');
    console.log('Depth manager instance:', depthPredictionManager);
}
