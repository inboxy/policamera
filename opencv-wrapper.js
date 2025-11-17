/**
 * OpenCV.js Wrapper for Optimized Computer Vision
 * Provides fast image processing for object detection pipeline
 */

// Global flag for OpenCV readiness
window.isOpenCVReady = false;

// OpenCV ready callback
function opencvReady() {
    if (typeof cv !== 'undefined') {
        window.isOpenCVReady = true;
        console.log('✅ OpenCV.js loaded successfully');

        // Initialize OpenCV wrapper
        if (window.openCVWrapper) {
            window.openCVWrapper.initialize();
        }
    }
}

class OpenCVWrapper {
    constructor() {
        this.isInitialized = false;
        this.matCache = new Map(); // Cache for Mat objects
        this.maxCacheSize = 5;
    }

    /**
     * Initialize OpenCV wrapper
     */
    initialize() {
        if (!window.isOpenCVReady) {
            console.warn('OpenCV.js not ready yet');
            return false;
        }

        this.isInitialized = true;
        console.log('🎨 OpenCV Wrapper initialized');
        return true;
    }

    /**
     * Check if OpenCV is ready
     */
    isReady() {
        return this.isInitialized && window.isOpenCVReady;
    }

    /**
     * Convert image element to OpenCV Mat
     */
    imageToMat(imageElement) {
        if (!this.isReady()) return null;

        try {
            const mat = cv.imread(imageElement);
            return mat;
        } catch (error) {
            console.error('Error converting image to Mat:', error);
            return null;
        }
    }

    /**
     * Convert Mat to canvas
     */
    matToCanvas(mat, canvas) {
        if (!this.isReady() || !mat) return false;

        try {
            cv.imshow(canvas, mat);
            return true;
        } catch (error) {
            console.error('Error converting Mat to canvas:', error);
            return false;
        }
    }

    /**
     * Fast resize using OpenCV (much faster than canvas drawImage)
     */
    fastResize(imageElement, targetWidth, targetHeight, outputCanvas = null) {
        if (!this.isReady()) {
            return this.fallbackResize(imageElement, targetWidth, targetHeight, outputCanvas);
        }

        try {
            // Convert to Mat
            const src = this.imageToMat(imageElement);
            if (!src) {
                return this.fallbackResize(imageElement, targetWidth, targetHeight, outputCanvas);
            }

            // Create destination Mat
            const dst = new cv.Mat();
            const dsize = new cv.Size(targetWidth, targetHeight);

            // Use INTER_LINEAR for speed (INTER_AREA is slower but better quality)
            cv.resize(src, dst, dsize, 0, 0, cv.INTER_LINEAR);

            // Convert back to canvas
            const canvas = outputCanvas || document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            this.matToCanvas(dst, canvas);

            // Cleanup
            src.delete();
            dst.delete();

            return canvas;
        } catch (error) {
            console.error('Error in fastResize:', error);
            return this.fallbackResize(imageElement, targetWidth, targetHeight, outputCanvas);
        }
    }

    /**
     * Fallback resize using canvas (if OpenCV fails)
     */
    fallbackResize(imageElement, targetWidth, targetHeight, outputCanvas = null) {
        const canvas = outputCanvas || document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageElement, 0, 0, targetWidth, targetHeight);
        return canvas;
    }

    /**
     * Convert to grayscale (much faster than JavaScript loops)
     */
    toGrayscale(imageElement, outputCanvas = null) {
        if (!this.isReady()) {
            return this.fallbackGrayscale(imageElement, outputCanvas);
        }

        try {
            const src = this.imageToMat(imageElement);
            if (!src) {
                return this.fallbackGrayscale(imageElement, outputCanvas);
            }

            const dst = new cv.Mat();

            // Convert to grayscale
            cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);

            // Convert back to RGBA for display
            const rgba = new cv.Mat();
            cv.cvtColor(dst, rgba, cv.COLOR_GRAY2RGBA);

            // Output to canvas
            const canvas = outputCanvas || document.createElement('canvas');
            canvas.width = src.cols;
            canvas.height = src.rows;
            this.matToCanvas(rgba, canvas);

            // Cleanup
            src.delete();
            dst.delete();
            rgba.delete();

            return canvas;
        } catch (error) {
            console.error('Error in toGrayscale:', error);
            return this.fallbackGrayscale(imageElement, outputCanvas);
        }
    }

    /**
     * Fallback grayscale conversion
     */
    fallbackGrayscale(imageElement, outputCanvas = null) {
        const canvas = outputCanvas || document.createElement('canvas');
        const width = imageElement.videoWidth || imageElement.width;
        const height = imageElement.videoHeight || imageElement.height;

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageElement, 0, 0);

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    /**
     * Resize and convert to grayscale in one operation (optimized)
     */
    resizeAndGrayscale(imageElement, targetWidth, targetHeight, outputCanvas = null) {
        if (!this.isReady()) {
            const resized = this.fallbackResize(imageElement, targetWidth, targetHeight);
            return this.fallbackGrayscale(resized, outputCanvas);
        }

        try {
            const src = this.imageToMat(imageElement);
            if (!src) {
                const resized = this.fallbackResize(imageElement, targetWidth, targetHeight);
                return this.fallbackGrayscale(resized, outputCanvas);
            }

            // Resize first
            const resized = new cv.Mat();
            const dsize = new cv.Size(targetWidth, targetHeight);
            cv.resize(src, resized, dsize, 0, 0, cv.INTER_LINEAR);

            // Convert to grayscale
            const gray = new cv.Mat();
            cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY);

            // Convert back to RGBA
            const rgba = new cv.Mat();
            cv.cvtColor(gray, rgba, cv.COLOR_GRAY2RGBA);

            // Output to canvas
            const canvas = outputCanvas || document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            this.matToCanvas(rgba, canvas);

            // Cleanup
            src.delete();
            resized.delete();
            gray.delete();
            rgba.delete();

            return canvas;
        } catch (error) {
            console.error('Error in resizeAndGrayscale:', error);
            const resized = this.fallbackResize(imageElement, targetWidth, targetHeight);
            return this.fallbackGrayscale(resized, outputCanvas);
        }
    }

    /**
     * Apply Gaussian blur for noise reduction
     */
    gaussianBlur(imageElement, kernelSize = 5, outputCanvas = null) {
        if (!this.isReady()) {
            return imageElement;
        }

        try {
            const src = this.imageToMat(imageElement);
            if (!src) return imageElement;

            const dst = new cv.Mat();
            const ksize = new cv.Size(kernelSize, kernelSize);
            cv.GaussianBlur(src, dst, ksize, 0, 0, cv.BORDER_DEFAULT);

            const canvas = outputCanvas || document.createElement('canvas');
            canvas.width = src.cols;
            canvas.height = src.rows;
            this.matToCanvas(dst, canvas);

            src.delete();
            dst.delete();

            return canvas;
        } catch (error) {
            console.error('Error in gaussianBlur:', error);
            return imageElement;
        }
    }

    /**
     * Enhance contrast using histogram equalization
     */
    enhanceContrast(imageElement, outputCanvas = null) {
        if (!this.isReady()) {
            return imageElement;
        }

        try {
            const src = this.imageToMat(imageElement);
            if (!src) return imageElement;

            // Convert to grayscale
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // Apply histogram equalization
            const equalized = new cv.Mat();
            cv.equalizeHist(gray, equalized);

            // Convert back to RGBA
            const rgba = new cv.Mat();
            cv.cvtColor(equalized, rgba, cv.COLOR_GRAY2RGBA);

            const canvas = outputCanvas || document.createElement('canvas');
            canvas.width = src.cols;
            canvas.height = src.rows;
            this.matToCanvas(rgba, canvas);

            src.delete();
            gray.delete();
            equalized.delete();
            rgba.delete();

            return canvas;
        } catch (error) {
            console.error('Error in enhanceContrast:', error);
            return imageElement;
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        // Clear mat cache
        this.matCache.forEach(mat => {
            try {
                mat.delete();
            } catch (e) {
                // Ignore cleanup errors
            }
        });
        this.matCache.clear();
        console.log('OpenCV Wrapper cleaned up');
    }
}

// Create global instance
window.openCVWrapper = new OpenCVWrapper();

// Try to initialize if OpenCV is already loaded
if (window.isOpenCVReady) {
    window.openCVWrapper.initialize();
}
