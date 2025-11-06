/**
 * YOLOv8 Object Detection using ONNX Runtime Web
 * Ultra-fast single-frame detection optimized for real-time performance
 */
class YOLOv8Detector {
    constructor() {
        this.session = null;
        this.isLoaded = false;
        this.isLoading = false;

        // Model configuration
        // Using YOLOv8n (nano) for ultra-fast detection
        this.modelUrl = 'https://huggingface.co/Xenova/yolov8n/resolve/main/onnx/model.onnx';
        this.inputSize = 640; // YOLOv8 standard input size (can be adjusted)
        this.confidenceThreshold = 0.3; // Adjusted for better detection
        this.iouThreshold = 0.45;

        // COCO class names (80 classes)
        this.classNames = [
            'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
            'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
            'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
            'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
            'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
            'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
            'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
            'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
            'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator',
            'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
        ];
    }

    /**
     * Set input size for detection
     */
    setInputSize(size) {
        this.inputSize = size;
    }

    /**
     * Load YOLOv8 ONNX model
     */
    async loadModel() {
        if (this.isLoaded || this.isLoading) {
            return this.isLoaded;
        }

        this.isLoading = true;
        console.log('🚀 Loading YOLOv8 model...');

        try {
            // Configure ONNX Runtime for WebGL (fastest)
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/';

            // Create session with WebGL execution provider for GPU acceleration
            this.session = await ort.InferenceSession.create(this.modelUrl, {
                executionProviders: ['webgl', 'wasm'],
                graphOptimizationLevel: 'all'
            });

            this.isLoaded = true;
            console.log('✅ YOLOv8 model loaded successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to load YOLOv8 model:', error);
            this.isLoaded = false;
            return false;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Preprocess image for YOLOv8
     * Converts to [1, 3, 640, 640] tensor with normalized values
     */
    preprocessImage(imageElement, targetSize = this.inputSize) {
        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');

        // Draw and resize image
        ctx.drawImage(imageElement, 0, 0, targetSize, targetSize);
        const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
        const pixels = imageData.data;

        // Convert to float32 array [1, 3, H, W] format with normalization
        const float32Data = new Float32Array(3 * targetSize * targetSize);

        // YOLO expects RGB format normalized to [0, 1]
        for (let i = 0; i < pixels.length; i += 4) {
            const pixelIndex = i / 4;
            const row = Math.floor(pixelIndex / targetSize);
            const col = pixelIndex % targetSize;

            // R channel
            float32Data[0 * targetSize * targetSize + row * targetSize + col] = pixels[i] / 255;
            // G channel
            float32Data[1 * targetSize * targetSize + row * targetSize + col] = pixels[i + 1] / 255;
            // B channel
            float32Data[2 * targetSize * targetSize + row * targetSize + col] = pixels[i + 2] / 255;
        }

        return {
            tensor: new ort.Tensor('float32', float32Data, [1, 3, targetSize, targetSize]),
            originalWidth: imageElement.videoWidth || imageElement.width,
            originalHeight: imageElement.videoHeight || imageElement.height
        };
    }

    /**
     * Non-Maximum Suppression
     */
    nms(boxes, iouThreshold) {
        // Sort by confidence
        boxes.sort((a, b) => b.confidence - a.confidence);

        const selected = [];
        const suppressed = new Set();

        for (let i = 0; i < boxes.length; i++) {
            if (suppressed.has(i)) continue;

            selected.push(boxes[i]);

            for (let j = i + 1; j < boxes.length; j++) {
                if (suppressed.has(j)) continue;

                if (boxes[i].class === boxes[j].class) {
                    const iou = this.calculateIoU(boxes[i].bbox, boxes[j].bbox);
                    if (iou > iouThreshold) {
                        suppressed.add(j);
                    }
                }
            }
        }

        return selected;
    }

    /**
     * Calculate Intersection over Union
     */
    calculateIoU(box1, box2) {
        const x1 = Math.max(box1.x, box2.x);
        const y1 = Math.max(box1.y, box2.y);
        const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
        const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

        const intersectionArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        const box1Area = box1.width * box1.height;
        const box2Area = box2.width * box2.height;
        const unionArea = box1Area + box2Area - intersectionArea;

        return intersectionArea / unionArea;
    }

    /**
     * Post-process YOLOv8 output
     * Output format: [1, 84, 8400] where 84 = 4 bbox coords + 80 class scores
     */
    postProcess(output, originalWidth, originalHeight) {
        const [batchSize, numChannels, numPredictions] = output.dims;
        const outputData = output.data;

        const detections = [];
        const scale = this.inputSize / Math.max(originalWidth, originalHeight);

        // YOLOv8 output is [batch, 84, 8400]
        // 84 channels: [x, y, w, h, class1_score, class2_score, ..., class80_score]
        for (let i = 0; i < numPredictions; i++) {
            // Get bounding box coordinates
            const x = outputData[i];
            const y = outputData[numPredictions + i];
            const w = outputData[2 * numPredictions + i];
            const h = outputData[3 * numPredictions + i];

            // Find best class and confidence
            let maxScore = 0;
            let maxClass = 0;

            for (let c = 0; c < 80; c++) {
                const score = outputData[(4 + c) * numPredictions + i];
                if (score > maxScore) {
                    maxScore = score;
                    maxClass = c;
                }
            }

            // Filter by confidence
            if (maxScore > this.confidenceThreshold) {
                // Convert from center format to corner format
                // Scale back to original image size
                const x1 = Math.round((x - w / 2) / scale);
                const y1 = Math.round((y - h / 2) / scale);
                const width = Math.round(w / scale);
                const height = Math.round(h / scale);

                detections.push({
                    class: this.classNames[maxClass],
                    confidence: Math.round(maxScore * 100),
                    bbox: {
                        x: Math.max(0, x1),
                        y: Math.max(0, y1),
                        width: Math.min(width, originalWidth - x1),
                        height: Math.min(height, originalHeight - y1)
                    }
                });
            }
        }

        // Apply NMS
        return this.nms(detections, this.iouThreshold);
    }

    /**
     * Detect objects in image
     */
    async detect(imageElement) {
        if (!this.isLoaded) {
            console.warn('YOLOv8 model not loaded');
            return [];
        }

        try {
            // Preprocess
            const { tensor, originalWidth, originalHeight } = this.preprocessImage(imageElement);

            // Run inference
            const feeds = { images: tensor };
            const results = await this.session.run(feeds);

            // Get output tensor (name might vary, typically 'output0' or 'output')
            const output = results[Object.keys(results)[0]];

            // Post-process
            const detections = this.postProcess(output, originalWidth, originalHeight);

            return detections;
        } catch (error) {
            console.error('YOLOv8 detection error:', error);
            return [];
        }
    }

    /**
     * Cleanup
     */
    async dispose() {
        if (this.session) {
            this.session = null;
            this.isLoaded = false;
            console.log('YOLOv8 detector disposed');
        }
    }
}

// Create global instance
window.yolov8Detector = new YOLOv8Detector();
