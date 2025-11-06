/**
 * Face Detection Manager for PoliCamera
 * Uses TensorFlow.js BlazeFace for fast face detection
 */
class FaceDetectionManager {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.isLoading = false;
        this.isEnabled = false;

        // Performance settings
        this.scoreThreshold = 0.75; // High confidence for face detection
        this.maxFaces = 10; // Detect up to 10 faces
        this.inputSize = 256; // Optimized for speed

        // Frame throttling
        this.lastProcessTime = 0;
        this.targetFrameTime = 1000 / 30; // 30 FPS for face detection

        // Face tracking
        this.lastFaces = [];
        this.faceIdCounter = 0;

        // Landmark indices (BlazeFace provides 6 keypoints)
        this.landmarkNames = [
            'right_eye',
            'left_eye',
            'nose',
            'mouth',
            'right_ear',
            'left_ear'
        ];

        // Colors for visualization
        this.faceColor = '#FF6B6B'; // Red for face boxes
        this.landmarkColor = '#4ECDC4'; // Teal for landmarks
        this.landmarkRadius = 3;
        this.boxWidth = 2;
    }

    /**
     * Check if face detection is supported
     */
    isSupported() {
        return typeof blazeface !== 'undefined' && typeof tf !== 'undefined';
    }

    /**
     * Initialize the face detection model
     */
    async initializeModel() {
        if (this.isModelLoaded || this.isLoading) {
            console.log('Face model already', this.isModelLoaded ? 'loaded' : 'loading');
            return this.isModelLoaded;
        }

        if (!this.isSupported()) {
            console.error('BlazeFace library not available');
            return false;
        }

        this.isLoading = true;
        console.log('👤 Loading face detection model...');

        try {
            // Load BlazeFace model
            this.model = await blazeface.load();
            this.isModelLoaded = true;
            this.isLoading = false;

            console.log('✅ Face detection model loaded successfully');
            return true;

        } catch (error) {
            console.error('❌ Failed to load face detection model:', error);
            this.isLoading = false;
            this.isModelLoaded = false;
            return false;
        }
    }

    /**
     * Enable face detection
     */
    async enable() {
        if (!this.isModelLoaded) {
            const loaded = await this.initializeModel();
            if (!loaded) {
                throw new Error('Failed to load face detection model');
            }
        }
        this.isEnabled = true;
        console.log('✅ Face detection enabled');
    }

    /**
     * Disable face detection
     */
    disable() {
        this.isEnabled = false;
        this.lastFaces = [];
        console.log('⏸️ Face detection disabled');
    }

    /**
     * Toggle face detection
     */
    async toggle() {
        if (this.isEnabled) {
            this.disable();
            return false;
        } else {
            await this.enable();
            return true;
        }
    }

    /**
     * Detect faces in image/video element
     * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} imageElement
     * @param {boolean} isRealTime - Whether this is for real-time processing
     * @returns {Promise<Array>} Array of detected faces
     */
    async detectFaces(imageElement, isRealTime = false) {
        if (!this.isEnabled || !this.isModelLoaded) {
            return [];
        }

        // FPS throttling for real-time mode
        if (isRealTime) {
            const currentTime = performance.now();
            if (currentTime - this.lastProcessTime < this.targetFrameTime) {
                return this.lastFaces; // Return cached faces
            }
            this.lastProcessTime = currentTime;
        }

        try {
            // Detect faces
            const predictions = await this.model.estimateFaces(imageElement, false);

            // Process and filter faces
            const processedFaces = this.processFaces(predictions);
            this.lastFaces = processedFaces;

            return processedFaces;

        } catch (error) {
            console.error('Face detection error:', error);
            return [];
        }
    }

    /**
     * Process and filter detected faces
     */
    processFaces(predictions) {
        if (!predictions || predictions.length === 0) {
            return [];
        }

        return predictions
            .filter(face => {
                // Filter by probability score
                const score = face.probability ? face.probability[0] : 0;
                return score >= this.scoreThreshold;
            })
            .map(face => {
                const score = face.probability ? face.probability[0] : 0;

                // Extract bounding box
                const box = {
                    x: face.topLeft[0],
                    y: face.topLeft[1],
                    width: face.bottomRight[0] - face.topLeft[0],
                    height: face.bottomRight[1] - face.topLeft[1]
                };

                // Extract landmarks if available
                const landmarks = face.landmarks || [];

                return {
                    id: this.faceIdCounter++,
                    score: score,
                    box: box,
                    landmarks: landmarks,
                    topLeft: face.topLeft,
                    bottomRight: face.bottomRight
                };
            });
    }

    /**
     * Draw faces on canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array} faces - Array of detected faces
     * @param {Object} scale - Scale factors {x, y} for coordinate transformation
     */
    drawFaces(ctx, faces, scale = { x: 1, y: 1 }) {
        if (!faces || faces.length === 0) {
            return;
        }

        faces.forEach(face => {
            // Scale coordinates
            const x = face.box.x * scale.x;
            const y = face.box.y * scale.y;
            const width = face.box.width * scale.x;
            const height = face.box.height * scale.y;

            // Draw bounding box with rounded corners
            this.drawFaceBox(ctx, x, y, width, height, face.score);

            // Draw landmarks if available
            if (face.landmarks && face.landmarks.length > 0) {
                this.drawLandmarks(ctx, face.landmarks, scale);
            }
        });
    }

    /**
     * Draw face bounding box
     */
    drawFaceBox(ctx, x, y, width, height, score) {
        // Draw main box
        ctx.strokeStyle = this.faceColor;
        ctx.lineWidth = this.boxWidth;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.strokeRect(x, y, width, height);
        ctx.shadowBlur = 0;

        // Draw corner accents for modern look
        const cornerLength = Math.min(15, width / 5, height / 5);
        ctx.lineWidth = 3;
        ctx.strokeStyle = this.faceColor;

        ctx.beginPath();
        // Top-left
        ctx.moveTo(x, y + cornerLength);
        ctx.lineTo(x, y);
        ctx.lineTo(x + cornerLength, y);

        // Top-right
        ctx.moveTo(x + width - cornerLength, y);
        ctx.lineTo(x + width, y);
        ctx.lineTo(x + width, y + cornerLength);

        // Bottom-left
        ctx.moveTo(x, y + height - cornerLength);
        ctx.lineTo(x, y + height);
        ctx.lineTo(x + cornerLength, y + height);

        // Bottom-right
        ctx.moveTo(x + width - cornerLength, y + height);
        ctx.lineTo(x + width, y + height);
        ctx.lineTo(x + width, y + height - cornerLength);

        ctx.stroke();

        // Draw label
        const label = `Face ${Math.round(score * 100)}%`;
        ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const textMetrics = ctx.measureText(label);
        const textWidth = textMetrics.width;
        const textHeight = 16;
        const padding = 8;

        // Label background
        ctx.fillStyle = this.hexToRGBA(this.faceColor, 0.9);
        const labelX = x;
        const labelY = y - textHeight - 6;

        this.drawRoundedRect(ctx, labelX, labelY, textWidth + padding * 2, textHeight + 4, 4);
        ctx.fill();

        // Label text
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(label, labelX + padding, labelY + textHeight - 3);
    }

    /**
     * Draw facial landmarks
     */
    drawLandmarks(ctx, landmarks, scale) {
        landmarks.forEach((landmark, index) => {
            const x = landmark[0] * scale.x;
            const y = landmark[1] * scale.y;

            // Draw landmark with glow effect
            ctx.fillStyle = this.landmarkColor;
            ctx.shadowColor = this.landmarkColor;
            ctx.shadowBlur = 8;

            ctx.beginPath();
            ctx.arc(x, y, this.landmarkRadius, 0, 2 * Math.PI);
            ctx.fill();

            // Draw inner white dot
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(x, y, this.landmarkRadius / 2, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    /**
     * Helper function to draw rounded rectangle
     */
    drawRoundedRect(ctx, x, y, width, height, radius) {
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
    }

    /**
     * Convert hex color to RGBA
     */
    hexToRGBA(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * Export face data for storage
     * @param {Array} faces - Detected faces
     * @returns {Object} Serializable face data
     */
    exportFaceData(faces) {
        if (!faces || faces.length === 0) {
            return null;
        }

        return {
            faceCount: faces.length,
            faces: faces.map(face => ({
                score: face.score,
                box: face.box,
                landmarks: face.landmarks.map((landmark, index) => ({
                    name: this.landmarkNames[index] || `landmark_${index}`,
                    x: landmark[0],
                    y: landmark[1]
                }))
            })),
            timestamp: Date.now()
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.model) {
            this.model.dispose();
            this.model = null;
        }
        this.isModelLoaded = false;
        this.isEnabled = false;
        this.lastFaces = [];
        console.log('Face detection manager cleaned up');
    }
}

// Create global instance
window.faceDetectionManager = new FaceDetectionManager();
