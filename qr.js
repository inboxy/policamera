/**
 * QR Code functionality for PoliCamera
 * Handles QR code generation and display modal
 */
class QRCodeManager {
    constructor() {
        this.appUrl = 'https://inboxy.github.io/policamera/';
        this.qrApiUrl = 'https://api.qrserver.com/v1/create-qr-code/';
    }

    /**
     * Show QR code modal with the application URL
     */
    showQRCode() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: var(--md-sys-color-surface-container);
            border-radius: 16px;
            padding: 24px;
            max-width: 400px;
            width: 100%;
            text-align: center;
            color: var(--md-sys-color-on-surface);
        `;

        const title = this.createTitle();
        const description = this.createDescription();
        const qrImage = this.createQRImage();
        const linkContainer = this.createLinkContainer();
        const closeBtn = this.createCloseButton(() => modal.remove());

        modalContent.appendChild(title);
        modalContent.appendChild(description);
        modalContent.appendChild(qrImage);
        modalContent.appendChild(linkContainer);
        modalContent.appendChild(closeBtn);
        modal.appendChild(modalContent);

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        document.body.appendChild(modal);
    }

    /**
     * Create modal title element
     * @returns {HTMLElement}
     */
    createTitle() {
        const title = document.createElement('h2');
        title.textContent = 'PoliCamera';
        title.style.cssText = `
            margin: 0 0 16px 0;
            color: var(--md-sys-color-primary);
            font-size: 24px;
            font-weight: 500;
        `;
        return title;
    }

    /**
     * Create modal description element
     * @returns {HTMLElement}
     */
    createDescription() {
        const description = document.createElement('p');
        description.textContent = 'Scan the QR code or visit the link below to access PoliCamera:';
        description.style.cssText = `
            margin: 0 0 20px 0;
            font-size: 14px;
            color: var(--md-sys-color-on-surface-variant);
        `;
        return description;
    }

    /**
     * Create QR code image element
     * @returns {HTMLElement}
     */
    createQRImage() {
        const qrImage = document.createElement('img');
        qrImage.src = `${this.qrApiUrl}?size=200x200&data=${encodeURIComponent(this.appUrl)}`;
        qrImage.alt = 'PoliCamera QR Code';
        qrImage.style.cssText = `
            width: 200px;
            height: 200px;
            border-radius: 8px;
            margin: 0 0 20px 0;
            background: white;
            padding: 8px;
        `;

        // Add error handling for QR code loading
        qrImage.onerror = () => {
            qrImage.style.display = 'none';
            const errorMsg = document.createElement('div');
            errorMsg.textContent = 'QR code could not be loaded';
            errorMsg.style.cssText = `
                color: var(--md-sys-color-error);
                font-size: 12px;
                margin: 0 0 20px 0;
            `;
            qrImage.parentNode.insertBefore(errorMsg, qrImage.nextSibling);
        };

        return qrImage;
    }

    /**
     * Create link container with clickable URL
     * @returns {HTMLElement}
     */
    createLinkContainer() {
        const linkContainer = document.createElement('div');
        linkContainer.style.cssText = `
            background: var(--md-sys-color-surface-variant);
            border-radius: 8px;
            padding: 12px;
            margin: 0 0 20px 0;
            word-break: break-all;
        `;

        const link = document.createElement('a');
        link.href = this.appUrl;
        link.textContent = this.appUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.cssText = `
            color: var(--md-sys-color-primary);
            text-decoration: none;
            font-family: 'Doto', monospace;
            font-size: 12px;
        `;

        // Add hover effect
        link.addEventListener('mouseenter', () => {
            link.style.textDecoration = 'underline';
        });

        link.addEventListener('mouseleave', () => {
            link.style.textDecoration = 'none';
        });

        linkContainer.appendChild(link);
        return linkContainer;
    }

    /**
     * Create close button
     * @param {Function} onClose - Callback function when button is clicked
     * @returns {HTMLElement}
     */
    createCloseButton(onClose) {
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = `
            padding: 12px 24px;
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
            border: none;
            border-radius: 20px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
        `;

        // Add hover effect
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.transform = 'scale(1.05)';
        });

        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.transform = 'scale(1)';
        });

        closeBtn.addEventListener('click', onClose);
        return closeBtn;
    }

    /**
     * Get the application URL
     * @returns {string}
     */
    getAppUrl() {
        return this.appUrl;
    }

    /**
     * Update the application URL
     * @param {string} url - New URL to use
     */
    setAppUrl(url) {
        this.appUrl = url;
    }
}

// Create singleton instance
const qrCodeManager = new QRCodeManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = qrCodeManager;
} else {
    window.qrCodeManager = qrCodeManager;
}