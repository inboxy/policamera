/**
 * Pose Estimation Manager for PoliCamera
 * Uses TensorFlow.js MoveNet for human pose detection
 */
class PoseEstimationManager {
    constructor() {
        this.detector = null;
        this.isModelLoaded = false;
        this.isLoading = false;
        this.isEnabled = false;

        // Performance settings
        this.maxPoses = 3; // Detect up to 3 people
        this.scoreThreshold = 0.3; // Minimum confidence for keypoints
        this.inputResolution = { width: 256, height: 256 }; // Optimized for speed

        // Frame throttling
        this.lastProcessTime = 0;
        this.targetFrameTime = 1000 / 30; // 30 FPS for pose detection

        // Pose tracking
        this.lastPoses = [];
        this.poseIdCounter = 0;

        // Keypoint connections for skeleton visualization (COCO format)
        this.connections = [
            [0, 1], [0, 2], [1, 3], [2, 4], // Head
            [5, 6], // Shoulders
            [5, 7], [7, 9], // Left arm
            [6, 8], [8, 10], // Right arm
            [5, 11], [6, 12], // Torso
            [11, 12], // Hips
            [11, 13], [13, 15], // Left leg
            [12, 14], [14, 16] // Right leg
        ];

        // Keypoint names (COCO format)
        this.keypointNames = [
            'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
            'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
            'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
            'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
        ];

        // Colors for visualization
        this.keypointColor = '#00FF00'; // Green keypoints
        this.connectionColor = '#00FFFF'; // Cyan connections
        this.keypointRadius = 5;
        this.connectionWidth = 2;
    }

    /**
     * Check if pose detection is supported
     */
    isSupported() {
        return typeof poseDetection !== 'undefined' && typeof tf !== 'undefined';
    }

    /**
     * Initialize the pose detection model
     */
    async initializeModel() {
        if (this.isModelLoaded || this.isLoading) {
            console.log('Pose model already', this.isModelLoaded ? 'loaded' : 'loading');
            return this.isModelLoaded;
        }

        if (!this.isSupported()) {
            console.error('Pose detection libraries not available');
            return false;
        }

        this.isLoading = true;
        console.log('🏃 Loading pose estimation model...');

        try {
            // Create MoveNet detector - Lightning model for speed
            const model = poseDetection.SupportedModels.MoveNet;
            const detectorConfig = {
                modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
                enableSmoothing: true,
                minPoseScore: this.scoreThreshold
            };

            this.detector = await poseDetection.createDetector(model, detectorConfig);
            this.isModelLoaded = true;
            this.isLoading = false;

            console.log('✅ Pose estimation model loaded successfully');
            return true;

        } catch (error) {
            console.error('❌ Failed to load pose estimation model:', error);
            this.isLoading = false;
            this.isModelLoaded = false;
            return false;
        }
    }

    /**
     * Enable pose estimation
     */
    async enable() {
        if (!this.isModelLoaded) {
            const loaded = await this.initializeModel();
            if (!loaded) {
                throw new Error('Failed to load pose estimation model');
            }
        }
        this.isEnabled = true;
        console.log('✅ Pose estimation enabled');
    }

    /**
     * Disable pose estimation
     */
    disable() {
        this.isEnabled = false;
        this.lastPoses = [];
        console.log('⏸️ Pose estimation disabled');
    }

    /**
     * Toggle pose estimation
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
     * Detect poses in image/video element
     * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} imageElement
     * @param {boolean} isRealTime - Whether this is for real-time processing
     * @returns {Promise<Array>} Array of detected poses
     */
    async detectPoses(imageElement, isRealTime = false) {
        if (!this.isEnabled || !this.isModelLoaded) {
            return [];
        }

        // FPS throttling for real-time mode
        if (isRealTime) {
            const currentTime = performance.now();
            if (currentTime - this.lastProcessTime < this.targetFrameTime) {
                return this.lastPoses; // Return cached poses
            }
            this.lastProcessTime = currentTime;
        }

        try {
            // Detect poses
            const poses = await this.detector.estimatePoses(imageElement, {
                maxPoses: this.maxPoses,
                flipHorizontal: false
            });

            // Filter and process poses
            const processedPoses = this.processPoses(poses);
            this.lastPoses = processedPoses;

            return processedPoses;

        } catch (error) {
            console.error('Pose detection error:', error);
            return [];
        }
    }

    /**
     * Process and filter detected poses
     */
    processPoses(poses) {
        if (!poses || poses.length === 0) {
            return [];
        }

        return poses
            .filter(pose => pose.score && pose.score >= this.scoreThreshold)
            .map(pose => {
                // Filter keypoints by score
                const validKeypoints = pose.keypoints.filter(kp => kp.score >= this.scoreThreshold);

                return {
                    id: this.poseIdCounter++,
                    score: pose.score,
                    keypoints: validKeypoints,
                    box: pose.box || this.calculateBoundingBox(validKeypoints)
                };
            });
    }

    /**
     * Calculate bounding box from keypoints
     */
    calculateBoundingBox(keypoints) {
        if (keypoints.length === 0) {
            return null;
        }

        const xs = keypoints.map(kp => kp.x);
        const ys = keypoints.map(kp => kp.y);

        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);

        return {
            xMin: minX,
            yMin: minY,
            xMax: maxX,
            yMax: maxY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * Draw poses on canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array} poses - Array of detected poses
     * @param {Object} scale - Scale factors {x, y} for coordinate transformation
     */
    drawPoses(ctx, poses, scale = { x: 1, y: 1 }) {
        if (!poses || poses.length === 0) {
            return;
        }

        poses.forEach(pose => {
            // Draw skeleton connections first (so they appear behind keypoints)
            this.drawSkeleton(ctx, pose.keypoints, scale);

            // Draw keypoints
            this.drawKeypoints(ctx, pose.keypoints, scale);

            // Draw bounding box and score
            if (pose.box) {
                this.drawBoundingBox(ctx, pose.box, pose.score, scale);
            }
        });
    }

    /**
     * Draw skeleton connections
     */
    drawSkeleton(ctx, keypoints, scale) {
        ctx.strokeStyle = this.connectionColor;
        ctx.lineWidth = this.connectionWidth;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 3;

        this.connections.forEach(([i, j]) => {
            const kp1 = keypoints[i];
            const kp2 = keypoints[j];

            // Only draw if both keypoints are valid
            if (kp1 && kp2 && kp1.score >= this.scoreThreshold && kp2.score >= this.scoreThreshold) {
                ctx.beginPath();
                ctx.moveTo(kp1.x * scale.x, kp1.y * scale.y);
                ctx.lineTo(kp2.x * scale.x, kp2.y * scale.y);
                ctx.stroke();
            }
        });

        ctx.shadowBlur = 0;
    }

    /**
     * Draw keypoints
     */
    drawKeypoints(ctx, keypoints, scale) {
        keypoints.forEach(kp => {
            if (kp.score >= this.scoreThreshold) {
                const x = kp.x * scale.x;
                const y = kp.y * scale.y;

                // Draw keypoint with glow effect
                ctx.fillStyle = this.keypointColor;
                ctx.shadowColor = this.keypointColor;
                ctx.shadowBlur = 10;

                ctx.beginPath();
                ctx.arc(x, y, this.keypointRadius, 0, 2 * Math.PI);
                ctx.fill();

                // Draw inner white dot
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(x, y, this.keypointRadius / 2, 0, 2 * Math.PI);
                ctx.fill();
            }
        });
    }

    /**
     * Draw bounding box around detected person
     */
    drawBoundingBox(ctx, box, score, scale) {
        const x = box.xMin * scale.x;
        const y = box.yMin * scale.y;
        const width = box.width * scale.x;
        const height = box.height * scale.y;

        // Draw box
        ctx.strokeStyle = this.keypointColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(x, y, width, height);
        ctx.setLineDash([]);

        // Draw label
        const label = `Person ${Math.round(score * 100)}%`;
        ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const textMetrics = ctx.measureText(label);
        const textWidth = textMetrics.width;
        const textHeight = 16;

        // Background
        ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.fillRect(x, y - textHeight - 4, textWidth + 12, textHeight + 4);

        // Text
        ctx.fillStyle = '#000000';
        ctx.fillText(label, x + 6, y - 6);
    }

    /**
     * Export pose data for storage
     * @param {Array} poses - Detected poses
     * @returns {Object} Serializable pose data
     */
    exportPoseData(poses) {
        if (!poses || poses.length === 0) {
            return null;
        }

        return {
            poseCount: poses.length,
            poses: poses.map(pose => ({
                score: pose.score,
                keypoints: pose.keypoints.map(kp => ({
                    name: this.keypointNames[kp.name] || kp.name,
                    x: kp.x,
                    y: kp.y,
                    score: kp.score
                })),
                box: pose.box
            })),
            timestamp: Date.now()
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.detector) {
            this.detector.dispose();
            this.detector = null;
        }
        this.isModelLoaded = false;
        this.isEnabled = false;
        this.lastPoses = [];
        console.log('Pose estimation manager cleaned up');
    }
}

// Create global instance
const poseEstimationManager = new PoseEstimationManager();
