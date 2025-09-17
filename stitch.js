class ImageStitcher {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.images = [];
        this.stitchMethod = 'horizontal';
        this.overlap = 0.1;
        this.blendingEnabled = true;
    }

    async loadImages(imageSources) {
        this.images = [];
        const loadPromises = imageSources.map(src => this.loadImage(src));
        this.images = await Promise.all(loadPromises);
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

    setStitchMethod(method) {
        this.stitchMethod = method;
    }

    setOverlap(overlap) {
        this.overlap = Math.max(0, Math.min(1, overlap));
    }

    setBlending(enabled) {
        this.blendingEnabled = enabled;
    }

    async stitchImages(imageSources, options = {}) {
        const {
            method = 'horizontal',
            overlap = 0.1,
            blending = true,
            quality = 0.9,
            format = 'image/jpeg'
        } = options;

        this.setStitchMethod(method);
        this.setOverlap(overlap);
        this.setBlending(blending);

        await this.loadImages(imageSources);

        if (this.images.length === 0) {
            throw new Error('No images to stitch');
        }

        if (this.images.length === 1) {
            return this.images[0].src;
        }

        switch (method) {
            case 'horizontal':
                return this.stitchHorizontal(quality, format);
            case 'vertical':
                return this.stitchVertical(quality, format);
            case 'grid':
                return this.stitchGrid(quality, format);
            case 'panoramic':
                return this.stitchPanoramic(quality, format);
            default:
                return this.stitchHorizontal(quality, format);
        }
    }

    stitchHorizontal(quality = 0.9, format = 'image/jpeg') {
        const images = this.images;
        const overlapPixels = Math.floor(images[0].width * this.overlap);

        const totalWidth = images.reduce((sum, img, index) => {
            return sum + img.width - (index > 0 ? overlapPixels : 0);
        }, 0);

        const maxHeight = Math.max(...images.map(img => img.height));

        this.canvas.width = totalWidth;
        this.canvas.height = maxHeight;

        let currentX = 0;

        images.forEach((img, index) => {
            const y = (maxHeight - img.height) / 2;

            if (index === 0 || !this.blendingEnabled) {
                this.ctx.drawImage(img, currentX, y);
            } else {
                this.drawWithBlending(img, currentX, y, overlapPixels, 'horizontal');
            }

            currentX += img.width - overlapPixels;
        });

        return this.canvas.toDataURL(format, quality);
    }

    stitchVertical(quality = 0.9, format = 'image/jpeg') {
        const images = this.images;
        const overlapPixels = Math.floor(images[0].height * this.overlap);

        const maxWidth = Math.max(...images.map(img => img.width));
        const totalHeight = images.reduce((sum, img, index) => {
            return sum + img.height - (index > 0 ? overlapPixels : 0);
        }, 0);

        this.canvas.width = maxWidth;
        this.canvas.height = totalHeight;

        let currentY = 0;

        images.forEach((img, index) => {
            const x = (maxWidth - img.width) / 2;

            if (index === 0 || !this.blendingEnabled) {
                this.ctx.drawImage(img, x, currentY);
            } else {
                this.drawWithBlending(img, x, currentY, overlapPixels, 'vertical');
            }

            currentY += img.height - overlapPixels;
        });

        return this.canvas.toDataURL(format, quality);
    }

    stitchGrid(quality = 0.9, format = 'image/jpeg') {
        const images = this.images;
        const cols = Math.ceil(Math.sqrt(images.length));
        const rows = Math.ceil(images.length / cols);

        const cellWidth = Math.max(...images.map(img => img.width));
        const cellHeight = Math.max(...images.map(img => img.height));

        this.canvas.width = cols * cellWidth;
        this.canvas.height = rows * cellHeight;

        images.forEach((img, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = col * cellWidth + (cellWidth - img.width) / 2;
            const y = row * cellHeight + (cellHeight - img.height) / 2;

            this.ctx.drawImage(img, x, y);
        });

        return this.canvas.toDataURL(format, quality);
    }

    stitchPanoramic(quality = 0.9, format = 'image/jpeg') {
        const images = this.images;
        const overlapPixels = Math.floor(images[0].width * this.overlap);

        const totalWidth = images.reduce((sum, img, index) => {
            return sum + img.width - (index > 0 ? overlapPixels : 0);
        }, 0);

        const avgHeight = images.reduce((sum, img) => sum + img.height, 0) / images.length;

        this.canvas.width = totalWidth;
        this.canvas.height = avgHeight;

        let currentX = 0;

        images.forEach((img, index) => {
            const scaleFactor = avgHeight / img.height;
            const scaledWidth = img.width * scaleFactor;
            const y = 0;

            if (index === 0 || !this.blendingEnabled) {
                this.ctx.drawImage(img, currentX, y, scaledWidth, avgHeight);
            } else {
                this.drawWithBlendingScaled(img, currentX, y, scaledWidth, avgHeight, overlapPixels);
            }

            currentX += scaledWidth - overlapPixels;
        });

        return this.canvas.toDataURL(format, quality);
    }

    drawWithBlending(img, x, y, overlapPixels, direction) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        tempCtx.drawImage(img, 0, 0);

        if (direction === 'horizontal') {
            const gradient = this.ctx.createLinearGradient(x, 0, x + overlapPixels, 0);
            gradient.addColorStop(0, 'rgba(255,255,255,0)');
            gradient.addColorStop(1, 'rgba(255,255,255,1)');

            this.ctx.save();
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.drawImage(img, x, y);

            this.ctx.globalCompositeOperation = 'destination-in';
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, y, overlapPixels, img.height);
            this.ctx.restore();
        } else {
            const gradient = this.ctx.createLinearGradient(0, y, 0, y + overlapPixels);
            gradient.addColorStop(0, 'rgba(255,255,255,0)');
            gradient.addColorStop(1, 'rgba(255,255,255,1)');

            this.ctx.save();
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.drawImage(img, x, y);

            this.ctx.globalCompositeOperation = 'destination-in';
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, y, img.width, overlapPixels);
            this.ctx.restore();
        }
    }

    drawWithBlendingScaled(img, x, y, width, height, overlapPixels) {
        const gradient = this.ctx.createLinearGradient(x, 0, x + overlapPixels, 0);
        gradient.addColorStop(0, 'rgba(255,255,255,0)');
        gradient.addColorStop(1, 'rgba(255,255,255,1)');

        this.ctx.save();
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.drawImage(img, x, y, width, height);

        this.ctx.globalCompositeOperation = 'destination-in';
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(x, y, overlapPixels, height);
        this.ctx.restore();
    }

    async detectFeatures(img1, img2) {
        return new Promise((resolve) => {
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

            const imageData1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);
            const imageData2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);

            const overlap = this.findBestOverlap(imageData1, imageData2);
            resolve(overlap);
        });
    }

    findBestOverlap(imageData1, imageData2) {
        const width1 = imageData1.width;
        const width2 = imageData2.width;
        const height = Math.min(imageData1.height, imageData2.height);

        let bestOverlap = Math.floor(width1 * 0.1);
        let bestScore = 0;

        for (let overlap = Math.floor(width1 * 0.05); overlap < Math.floor(width1 * 0.3); overlap += 5) {
            let score = 0;
            let samples = 0;

            for (let y = 0; y < height; y += 5) {
                for (let x = Math.max(0, width1 - overlap); x < width1; x += 5) {
                    const i1 = (y * width1 + x) * 4;
                    const x2 = x - (width1 - overlap);

                    if (x2 >= 0 && x2 < width2) {
                        const i2 = (y * width2 + x2) * 4;

                        const r1 = imageData1.data[i1];
                        const g1 = imageData1.data[i1 + 1];
                        const b1 = imageData1.data[i1 + 2];

                        const r2 = imageData2.data[i2];
                        const g2 = imageData2.data[i2 + 1];
                        const b2 = imageData2.data[i2 + 2];

                        const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
                        score += (765 - diff);
                        samples++;
                    }
                }
            }

            if (samples > 0) {
                score /= samples;
                if (score > bestScore) {
                    bestScore = score;
                    bestOverlap = overlap;
                }
            }
        }

        return bestOverlap / width1;
    }

    async autoStitch(imageSources, options = {}) {
        await this.loadImages(imageSources);

        if (this.images.length < 2) {
            throw new Error('Need at least 2 images for auto-stitching');
        }

        let totalOverlap = 0;
        for (let i = 0; i < this.images.length - 1; i++) {
            const overlap = await this.detectFeatures(this.images[i], this.images[i + 1]);
            totalOverlap += overlap;
        }

        const avgOverlap = totalOverlap / (this.images.length - 1);
        this.setOverlap(avgOverlap);

        return this.stitchHorizontal(options.quality, options.format);
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
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.width = 0;
        this.canvas.height = 0;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageStitcher;
} else if (typeof window !== 'undefined') {
    window.ImageStitcher = ImageStitcher;
}