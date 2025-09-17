class ImageStitcher {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.images = [];
        this.overlaps = [];
        this.debugMode = false;
    }

    async loadImages(imageSources) {
        this.images = [];

        if (!imageSources || !Array.isArray(imageSources)) {
            throw new Error('Invalid image sources provided');
        }

        const loadPromises = imageSources.map(async (src, index) => {
            try {
                return await this.loadImage(src);
            } catch (error) {
                console.error(`Failed to load image at index ${index}:`, error);
                return null; // Return null for failed loads
            }
        });

        const loadedImages = await Promise.all(loadPromises);

        // Filter out null images from failed loads
        this.images = loadedImages.filter(img => img !== null);

        if (this.images.length === 0) {
            throw new Error('No images were successfully loaded');
        }

        console.log(`Successfully loaded ${this.images.length} out of ${imageSources.length} images`);
        return this.images;
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;

            if (typeof src === 'string') {
                img.src = src;
            } else if (src instanceof File) {
                const reader = new FileReader();
                reader.onload = e => img.src = e.target.result;
                reader.readAsDataURL(src);
            } else if (src instanceof HTMLImageElement) {
                resolve(src);
            } else if (src instanceof HTMLCanvasElement) {
                img.src = src.toDataURL();
            }
        });
    }

    async stitchImages(imageSources, options = {}) {
        const {
            method = 'auto',
            quality = 0.9,
            format = 'image/jpeg',
            blendWidth = 50,
            matchThreshold = 0.7
        } = options;

        await this.loadImages(imageSources);

        if (this.images.length === 0) {
            throw new Error('No images to stitch');
        }

        if (this.images.length === 1) {
            return this.images[0].src;
        }

        // Detect overlaps between all image pairs
        await this.detectAllOverlaps(matchThreshold);

        // Determine optimal stitching method based on detected overlaps
        const stitchMethod = method === 'auto' ? this.determineOptimalMethod() : method;

        switch (stitchMethod) {
            case 'horizontal':
                return this.stitchHorizontalOverlap(blendWidth, quality, format);
            case 'vertical':
                return this.stitchVerticalOverlap(blendWidth, quality, format);
            case 'panoramic':
                return this.stitchPanoramic(blendWidth, quality, format);
            case 'grid':
                return this.stitchGrid(quality, format);
            default:
                return this.stitchHorizontalOverlap(blendWidth, quality, format);
        }
    }

    async detectAllOverlaps(threshold = 0.7) {
        this.overlaps = [];

        for (let i = 0; i < this.images.length - 1; i++) {
            for (let j = i + 1; j < this.images.length; j++) {
                const overlap = await this.detectOverlapBetweenImages(
                    this.images[i],
                    this.images[j],
                    threshold
                );

                if (overlap.confidence > threshold) {
                    this.overlaps.push({
                        img1Index: i,
                        img2Index: j,
                        ...overlap
                    });
                }
            }
        }
    }

    async detectOverlapBetweenImages(img1, img2, threshold = 0.7) {
        const canvas1 = document.createElement('canvas');
        const canvas2 = document.createElement('canvas');
        const ctx1 = canvas1.getContext('2d');
        const ctx2 = canvas2.getContext('2d');

        canvas1.width = img1.width;
        canvas1.height = img1.height;
        canvas2.width = img2.width;
        canvas2.height = img2.height;

        ctx1.drawImage(img1, 0, 0);
        ctx2.drawImage(img2, 0, 0);

        const imageData1 = ctx1.getImageData(0, 0, img1.width, img1.height);
        const imageData2 = ctx2.getImageData(0, 0, img2.width, img2.height);

        // Test different overlap configurations
        const horizontalOverlap = this.findHorizontalOverlap(imageData1, imageData2);
        const verticalOverlap = this.findVerticalOverlap(imageData1, imageData2);

        // Return the best overlap configuration
        if (horizontalOverlap.confidence > verticalOverlap.confidence) {
            return {
                type: 'horizontal',
                ...horizontalOverlap
            };
        } else {
            return {
                type: 'vertical',
                ...verticalOverlap
            };
        }
    }

    findHorizontalOverlap(imageData1, imageData2) {
        const width1 = imageData1.width;
        const width2 = imageData2.width;
        const height1 = imageData1.height;
        const height2 = imageData2.height;

        let bestMatch = {
            confidence: 0,
            overlapWidth: 0,
            offsetY: 0,
            direction: 'right' // img1 is left, img2 is right
        };

        // Test overlap from right edge of img1 to left edge of img2
        const maxOverlap = Math.min(width1, width2) * 0.8;
        const minOverlap = Math.min(width1, width2) * 0.1;

        for (let overlapWidth = minOverlap; overlapWidth <= maxOverlap; overlapWidth += 5) {
            // Test different vertical offsets
            const maxOffset = Math.abs(height1 - height2);
            for (let offsetY = -maxOffset; offsetY <= maxOffset; offsetY += 10) {
                const confidence = this.calculateOverlapConfidence(
                    imageData1, imageData2,
                    width1 - overlapWidth, 0, // region in img1
                    0, offsetY, // region in img2
                    overlapWidth, Math.min(height1, height2 - Math.abs(offsetY))
                );

                if (confidence > bestMatch.confidence) {
                    bestMatch = {
                        confidence,
                        overlapWidth,
                        offsetY,
                        direction: 'right'
                    };
                }
            }
        }

        // Test overlap from left edge of img1 to right edge of img2
        for (let overlapWidth = minOverlap; overlapWidth <= maxOverlap; overlapWidth += 5) {
            const maxOffset = Math.abs(height1 - height2);
            for (let offsetY = -maxOffset; offsetY <= maxOffset; offsetY += 10) {
                const confidence = this.calculateOverlapConfidence(
                    imageData1, imageData2,
                    0, 0, // region in img1
                    width2 - overlapWidth, offsetY, // region in img2
                    overlapWidth, Math.min(height1, height2 - Math.abs(offsetY))
                );

                if (confidence > bestMatch.confidence) {
                    bestMatch = {
                        confidence,
                        overlapWidth,
                        offsetY,
                        direction: 'left'
                    };
                }
            }
        }

        return bestMatch;
    }

    findVerticalOverlap(imageData1, imageData2) {
        const width1 = imageData1.width;
        const width2 = imageData2.width;
        const height1 = imageData1.height;
        const height2 = imageData2.height;

        let bestMatch = {
            confidence: 0,
            overlapHeight: 0,
            offsetX: 0,
            direction: 'bottom' // img1 is top, img2 is bottom
        };

        const maxOverlap = Math.min(height1, height2) * 0.8;
        const minOverlap = Math.min(height1, height2) * 0.1;

        // Test overlap from bottom edge of img1 to top edge of img2
        for (let overlapHeight = minOverlap; overlapHeight <= maxOverlap; overlapHeight += 5) {
            const maxOffset = Math.abs(width1 - width2);
            for (let offsetX = -maxOffset; offsetX <= maxOffset; offsetX += 10) {
                const confidence = this.calculateOverlapConfidence(
                    imageData1, imageData2,
                    0, height1 - overlapHeight, // region in img1
                    offsetX, 0, // region in img2
                    Math.min(width1, width2 - Math.abs(offsetX)), overlapHeight
                );

                if (confidence > bestMatch.confidence) {
                    bestMatch = {
                        confidence,
                        overlapHeight,
                        offsetX,
                        direction: 'bottom'
                    };
                }
            }
        }

        return bestMatch;
    }

    calculateOverlapConfidence(imageData1, imageData2, x1, y1, x2, y2, width, height) {
        let totalDiff = 0;
        let samples = 0;
        const sampleStep = 3; // Sample every 3rd pixel for performance

        for (let y = 0; y < height; y += sampleStep) {
            for (let x = 0; x < width; x += sampleStep) {
                const i1 = ((y1 + y) * imageData1.width + (x1 + x)) * 4;
                const i2 = ((y2 + y) * imageData2.width + (x2 + x)) * 4;

                if (i1 >= 0 && i1 < imageData1.data.length - 3 &&
                    i2 >= 0 && i2 < imageData2.data.length - 3) {

                    const r1 = imageData1.data[i1];
                    const g1 = imageData1.data[i1 + 1];
                    const b1 = imageData1.data[i1 + 2];

                    const r2 = imageData2.data[i2];
                    const g2 = imageData2.data[i2 + 1];
                    const b2 = imageData2.data[i2 + 2];

                    // Calculate Euclidean distance in RGB space
                    const diff = Math.sqrt(
                        Math.pow(r1 - r2, 2) +
                        Math.pow(g1 - g2, 2) +
                        Math.pow(b1 - b2, 2)
                    );

                    totalDiff += diff;
                    samples++;
                }
            }
        }

        if (samples === 0) return 0;

        // Convert to confidence score (0-1, where 1 is perfect match)
        const avgDiff = totalDiff / samples;
        const maxPossibleDiff = Math.sqrt(3 * Math.pow(255, 2)); // Max difference in RGB space
        return Math.max(0, 1 - (avgDiff / maxPossibleDiff));
    }

    determineOptimalMethod() {
        if (this.overlaps.length === 0) {
            return 'grid'; // No overlaps detected, use grid layout
        }

        // Count overlap types
        const horizontalOverlaps = this.overlaps.filter(o => o.type === 'horizontal').length;
        const verticalOverlaps = this.overlaps.filter(o => o.type === 'vertical').length;

        // Determine if images form a sequence (panoramic)
        const isSequential = this.checkIfSequential();

        if (isSequential && horizontalOverlaps > verticalOverlaps) {
            return 'panoramic';
        } else if (horizontalOverlaps > verticalOverlaps) {
            return 'horizontal';
        } else if (verticalOverlaps > 0) {
            return 'vertical';
        }

        return 'grid';
    }

    checkIfSequential() {
        // Check if images can be arranged in a sequence
        if (this.overlaps.length !== this.images.length - 1) {
            return false;
        }

        // Sort overlaps and check if they form a chain
        const sortedOverlaps = this.overlaps.sort((a, b) => b.confidence - a.confidence);
        const usedImages = new Set();

        for (const overlap of sortedOverlaps) {
            if (!usedImages.has(overlap.img1Index) || !usedImages.has(overlap.img2Index)) {
                usedImages.add(overlap.img1Index);
                usedImages.add(overlap.img2Index);
            }
        }

        return usedImages.size === this.images.length;
    }

    stitchHorizontalOverlap(blendWidth = 50, quality = 0.9, format = 'image/jpeg') {
        // Sort images based on overlap relationships
        const sortedImages = this.sortImagesForHorizontalStitch();

        if (!sortedImages || sortedImages.length === 0) {
            throw new Error('No images available for stitching');
        }

        let totalWidth = sortedImages[0]?.width || 0;
        let maxHeight = sortedImages[0]?.height || 0;

        // Calculate total dimensions considering actual overlaps
        for (let i = 1; i < sortedImages.length; i++) {
            const currentImg = sortedImages[i];
            const prevImg = sortedImages[i-1];

            if (!currentImg || !prevImg) {
                console.warn(`Invalid image at index ${i}, skipping`);
                continue;
            }

            const overlap = this.findOverlapForPair(prevImg.originalIndex, currentImg.originalIndex);
            totalWidth += (currentImg.width || 0) - (overlap?.overlapWidth || 0);
            maxHeight = Math.max(maxHeight, currentImg.height || 0);
        }

        this.canvas.width = totalWidth;
        this.canvas.height = maxHeight;
        this.ctx.clearRect(0, 0, totalWidth, maxHeight);

        let currentX = 0;

        // Draw first image
        const firstImg = sortedImages[0];
        if (!firstImg) {
            throw new Error('First image is null or undefined');
        }

        const firstY = (maxHeight - (firstImg.height || 0)) / 2;
        this.ctx.drawImage(firstImg, currentX, firstY);
        currentX += (firstImg.width || 0);

        // Draw subsequent images with blending
        for (let i = 1; i < sortedImages.length; i++) {
            const img = sortedImages[i];
            const prevImg = sortedImages[i-1];

            if (!img || !prevImg) {
                console.warn(`Invalid image at index ${i}, skipping`);
                continue;
            }

            const overlap = this.findOverlapForPair(prevImg.originalIndex, img.originalIndex);

            const overlapWidth = overlap?.overlapWidth || 0;
            const offsetY = overlap?.offsetY || 0;

            currentX -= overlapWidth;
            const y = (maxHeight - (img.height || 0)) / 2 + offsetY;

            if (overlapWidth > 0) {
                this.drawImageWithBlending(img, currentX, y, overlapWidth, blendWidth);
            } else {
                this.ctx.drawImage(img, currentX, y);
            }

            currentX += (img.width || 0);
        }

        return this.canvas.toDataURL(format, quality);
    }

    stitchVerticalOverlap(blendWidth = 50, quality = 0.9, format = 'image/jpeg') {
        const sortedImages = this.sortImagesForVerticalStitch();

        if (!sortedImages || sortedImages.length === 0) {
            throw new Error('No images available for vertical stitching');
        }

        let maxWidth = sortedImages[0]?.width || 0;
        let totalHeight = sortedImages[0]?.height || 0;

        for (let i = 1; i < sortedImages.length; i++) {
            const currentImg = sortedImages[i];
            const prevImg = sortedImages[i-1];

            if (!currentImg || !prevImg) {
                console.warn(`Invalid image at index ${i}, skipping`);
                continue;
            }

            const overlap = this.findOverlapForPair(prevImg.originalIndex, currentImg.originalIndex);
            totalHeight += (currentImg.height || 0) - (overlap?.overlapHeight || 0);
            maxWidth = Math.max(maxWidth, currentImg.width || 0);
        }

        this.canvas.width = maxWidth;
        this.canvas.height = totalHeight;
        this.ctx.clearRect(0, 0, maxWidth, totalHeight);

        let currentY = 0;

        // Draw first image
        const firstImg = sortedImages[0];
        if (!firstImg) {
            throw new Error('First image is null or undefined');
        }

        const firstX = (maxWidth - (firstImg.width || 0)) / 2;
        this.ctx.drawImage(firstImg, firstX, currentY);
        currentY += (firstImg.height || 0);

        // Draw subsequent images with blending
        for (let i = 1; i < sortedImages.length; i++) {
            const img = sortedImages[i];
            const prevImg = sortedImages[i-1];

            if (!img || !prevImg) {
                console.warn(`Invalid image at index ${i}, skipping`);
                continue;
            }

            const overlap = this.findOverlapForPair(prevImg.originalIndex, img.originalIndex);

            const overlapHeight = overlap?.overlapHeight || 0;
            const offsetX = overlap?.offsetX || 0;

            currentY -= overlapHeight;
            const x = (maxWidth - (img.width || 0)) / 2 + offsetX;

            if (overlapHeight > 0) {
                this.drawImageWithVerticalBlending(img, x, currentY, overlapHeight, blendWidth);
            } else {
                this.ctx.drawImage(img, x, currentY);
            }

            currentY += (img.height || 0);
        }

        return this.canvas.toDataURL(format, quality);
    }

    stitchPanoramic(blendWidth = 50, quality = 0.9, format = 'image/jpeg') {
        // For panoramic, use horizontal stitching with enhanced blending
        return this.stitchHorizontalOverlap(blendWidth * 1.5, quality, format);
    }

    stitchGrid(quality = 0.9, format = 'image/jpeg') {
        const images = this.images;

        if (!images || images.length === 0) {
            throw new Error('No images available for grid stitching');
        }

        const cols = Math.ceil(Math.sqrt(images.length));
        const rows = Math.ceil(images.length / cols);

        // Filter out null/undefined images and get valid dimensions
        const validImages = images.filter(img => img && img.width && img.height);
        if (validImages.length === 0) {
            throw new Error('No valid images with dimensions found');
        }

        const cellWidth = Math.max(...validImages.map(img => img.width || 0));
        const cellHeight = Math.max(...validImages.map(img => img.height || 0));

        this.canvas.width = cols * cellWidth;
        this.canvas.height = rows * cellHeight;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        images.forEach((img, index) => {
            if (!img || !img.width || !img.height) {
                console.warn(`Invalid image at index ${index}, skipping`);
                return;
            }

            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = col * cellWidth + (cellWidth - (img.width || 0)) / 2;
            const y = row * cellHeight + (cellHeight - (img.height || 0)) / 2;

            this.ctx.drawImage(img, x, y);
        });

        return this.canvas.toDataURL(format, quality);
    }

    drawImageWithBlending(img, x, y, overlapWidth, blendWidth) {
        if (!img || !img.width || !img.height) {
            console.warn('Invalid image provided for blending');
            return;
        }

        try {
            // Create temporary canvas for the image
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = img.width || 0;
            tempCanvas.height = img.height || 0;
            tempCtx.drawImage(img, 0, 0);

            // Create blending mask
            const effectiveBlendWidth = Math.min(blendWidth || 50, overlapWidth || 0);
            const gradient = this.ctx.createLinearGradient(
                x, 0,
                x + effectiveBlendWidth, 0
            );
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, 'rgba(0,0,0,1)');

            // Draw image
            this.ctx.drawImage(img, x, y);

            // Apply blending mask
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'destination-in';
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, y, effectiveBlendWidth, img.height || 0);
            this.ctx.restore();
        } catch (error) {
            console.error('Error in drawImageWithBlending:', error);
            // Fallback: just draw the image without blending
            this.ctx.drawImage(img, x, y);
        }
    }

    drawImageWithVerticalBlending(img, x, y, overlapHeight, blendWidth) {
        if (!img || !img.width || !img.height) {
            console.warn('Invalid image provided for vertical blending');
            return;
        }

        try {
            const effectiveBlendWidth = Math.min(blendWidth || 50, overlapHeight || 0);
            const gradient = this.ctx.createLinearGradient(
                0, y,
                0, y + effectiveBlendWidth
            );
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, 'rgba(0,0,0,1)');

            this.ctx.drawImage(img, x, y);

            this.ctx.save();
            this.ctx.globalCompositeOperation = 'destination-in';
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, y, img.width || 0, effectiveBlendWidth);
            this.ctx.restore();
        } catch (error) {
            console.error('Error in drawImageWithVerticalBlending:', error);
            // Fallback: just draw the image without blending
            this.ctx.drawImage(img, x, y);
        }
    }

    sortImagesForHorizontalStitch() {
        // Simple left-to-right sorting based on overlap relationships
        const images = this.images
            .map((img, index) => {
                if (!img) {
                    console.warn(`Null image at index ${index}`);
                    return null;
                }
                return {
                    ...img,
                    originalIndex: index
                };
            })
            .filter(img => img !== null); // Remove null entries

        // For now, return in original order
        // In a more advanced implementation, this would analyze overlap relationships
        return images;
    }

    sortImagesForVerticalStitch() {
        const images = this.images
            .map((img, index) => {
                if (!img) {
                    console.warn(`Null image at index ${index}`);
                    return null;
                }
                return {
                    ...img,
                    originalIndex: index
                };
            })
            .filter(img => img !== null); // Remove null entries

        return images;
    }

    findOverlapForPair(index1, index2) {
        if (index1 === null || index1 === undefined || index2 === null || index2 === undefined) {
            return null;
        }

        return this.overlaps.find(o =>
            o &&
            ((o.img1Index === index1 && o.img2Index === index2) ||
            (o.img1Index === index2 && o.img2Index === index1))
        );
    }

    async autoStitch(imageSources, options = {}) {
        return this.stitchImages(imageSources, {
            ...options,
            method: 'auto'
        });
    }

    getStitchedImageBlob(format = 'image/jpeg', quality = 0.9) {
        return new Promise((resolve) => {
            this.canvas.toBlob(resolve, format, quality);
        });
    }

    downloadStitchedImage(filename = 'stitched-image', format = 'image/jpeg', quality = 0.9) {
        const link = document.createElement('a');
        link.download = `${filename}.${format.split('/')[1]}`;
        link.href = this.canvas.toDataURL(format, quality);
        link.click();
    }

    reset() {
        this.images = [];
        this.overlaps = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.width = 0;
        this.canvas.height = 0;
    }

    setDebugMode(enabled) {
        this.debugMode = enabled;
    }

    getOverlapInfo() {
        return this.overlaps;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageStitcher;
} else if (typeof window !== 'undefined') {
    window.ImageStitcher = ImageStitcher;
}