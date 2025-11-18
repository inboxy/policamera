/**
 * UI Helper Utilities for PoliCamera
 * Centralized UI components and helper functions
 */
class UIHelpers {
    /**
     * Show a toast notification
     * @param {string} message - Message to display
     * @param {string} type - Toast type: 'info', 'error', 'success'
     * @param {string|null} icon - Material icon name (optional)
     * @param {number} duration - Duration in milliseconds
     */
    static showToast(message, type = 'info', icon = null, duration = AppConstants.TIMING.TOAST_DURATION) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const backgroundColor = type === 'error'
            ? 'var(--md-sys-color-error)'
            : 'var(--md-sys-color-primary)';

        const textColor = type === 'error'
            ? 'var(--md-sys-color-on-error)'
            : 'var(--md-sys-color-on-primary)';

        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: ${backgroundColor};
            color: ${textColor};
            padding: 12px 24px;
            border-radius: 24px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: var(--md-sys-elevation-level2);
            display: flex;
            align-items: center;
            gap: 8px;
            animation: slideUp 0.3s ease-out;
        `;

        if (icon) {
            const iconEl = document.createElement('span');
            iconEl.className = 'material-icons';
            iconEl.style.fontSize = '20px';
            iconEl.textContent = icon;
            toast.appendChild(iconEl);
        }

        const textEl = document.createElement('span');
        textEl.textContent = message;
        toast.appendChild(textEl);

        document.body.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'slideDown 0.3s ease-in';
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);

        return toast;
    }

    /**
     * Show an error toast
     * @param {string} message - Error message
     */
    static showError(message) {
        return this.showToast(message, 'error', null, AppConstants.TIMING.ERROR_TOAST_DURATION);
    }

    /**
     * Show a success toast
     * @param {string} message - Success message
     * @param {string|null} icon - Material icon name (optional)
     */
    static showSuccess(message, icon = null) {
        return this.showToast(message, 'success', icon);
    }

    /**
     * Create a flash effect for photo capture
     */
    static showCaptureEffect() {
        const effect = document.createElement('div');
        effect.className = 'capture-flash';
        effect.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: white;
            opacity: 0.8;
            z-index: 9999;
            pointer-events: none;
            animation: captureFlash ${AppConstants.TIMING.CAPTURE_FLASH_DURATION}ms ease-out;
        `;

        // Inject keyframes if not already present
        if (!document.querySelector('#captureFlashKeyframes')) {
            const style = document.createElement('style');
            style.id = 'captureFlashKeyframes';
            style.textContent = `
                @keyframes captureFlash {
                    0% { opacity: 0.8; }
                    100% { opacity: 0; }
                }
                @keyframes slideUp {
                    from { transform: translateX(-50%) translateY(20px); opacity: 0; }
                    to { transform: translateX(-50%) translateY(0); opacity: 1; }
                }
                @keyframes slideDown {
                    from { transform: translateX(-50%) translateY(0); opacity: 1; }
                    to { transform: translateX(-50%) translateY(20px); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(effect);

        setTimeout(() => {
            effect.remove();
        }, AppConstants.TIMING.CAPTURE_FLASH_DURATION);
    }

    /**
     * Create a modal dialog
     * @param {string} title - Modal title
     * @param {HTMLElement|string} content - Modal content (HTML element or string)
     * @param {Function} onClose - Optional callback when modal closes
     * @returns {HTMLElement} The modal element
     */
    static createModal(title, content, onClose = null) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
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
            animation: fadeIn 0.3s ease-out;
        `;

        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        modalContent.style.cssText = `
            background: var(--md-sys-color-surface-container);
            border-radius: 12px;
            padding: 20px;
            max-width: 90%;
            max-height: 90%;
            overflow-y: auto;
            color: var(--md-sys-color-on-surface);
            animation: scaleIn 0.3s ease-out;
        `;

        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        titleEl.style.cssText = 'margin-bottom: 16px; color: var(--md-sys-color-primary);';

        const contentContainer = document.createElement('div');
        if (typeof content === 'string') {
            contentContainer.innerHTML = content;
        } else {
            contentContainer.appendChild(content);
        }

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.className = 'modal-close-btn';
        closeBtn.style.cssText = `
            margin-top: 16px;
            padding: 8px 16px;
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
            border: none;
            border-radius: 20px;
            cursor: pointer;
            font-size: 14px;
        `;

        closeBtn.addEventListener('click', () => {
            modal.remove();
            if (onClose) onClose();
        });

        modalContent.appendChild(titleEl);
        modalContent.appendChild(contentContainer);
        modalContent.appendChild(closeBtn);
        modal.appendChild(modalContent);

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                if (onClose) onClose();
            }
        });

        // Inject animation keyframes if not present
        if (!document.querySelector('#modalAnimations')) {
            const style = document.createElement('style');
            style.id = 'modalAnimations';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { transform: scale(0.9); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(modal);
        return modal;
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped HTML
     */
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Create a loading indicator
     * @param {string} message - Loading message
     * @returns {HTMLElement} Loading element
     */
    static createLoadingIndicator(message = 'Loading...') {
        const loader = document.createElement('div');
        loader.className = 'loading-indicator';
        loader.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--md-sys-color-surface-container);
            padding: 24px 32px;
            border-radius: 12px;
            box-shadow: var(--md-sys-elevation-level3);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
        `;

        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        spinner.style.cssText = `
            width: 40px;
            height: 40px;
            border: 4px solid var(--md-sys-color-outline);
            border-top-color: var(--md-sys-color-primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        `;

        const text = document.createElement('div');
        text.textContent = message;
        text.style.cssText = 'color: var(--md-sys-color-on-surface); font-size: 14px;';

        // Inject spinner animation if not present
        if (!document.querySelector('#spinnerAnimation')) {
            const style = document.createElement('style');
            style.id = 'spinnerAnimation';
            style.textContent = `
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        loader.appendChild(spinner);
        loader.appendChild(text);
        document.body.appendChild(loader);

        return loader;
    }

    /**
     * Format a timestamp to a readable string
     * @param {string|Date} timestamp - Timestamp to format
     * @returns {string} Formatted timestamp
     */
    static formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString();
    }

    /**
     * Format time in HH:MM:SS format
     * @param {string|Date} timestamp - Timestamp to format
     * @returns {string} Formatted time
     */
    static formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    }

    /**
     * Create a rounded rectangle path in canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} width - Width
     * @param {number} height - Height
     * @param {number} radius - Border radius
     */
    static drawRoundedRect(ctx, x, y, width, height, radius) {
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
     * @param {string} hex - Hex color code
     * @param {number} alpha - Alpha value (0-1)
     * @returns {string} RGBA color string
     */
    static hexToRGBA(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * Get contrasting color (black or white) for text on colored background
     * @param {string} hexColor - Background hex color
     * @returns {string} Contrasting color (black or white)
     */
    static getContrastColor(hexColor) {
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? '#000000' : '#FFFFFF';
    }

    /**
     * Draw rounded rectangle on canvas
     * Centralized function to avoid code duplication across modules
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} width - Rectangle width
     * @number} height - Rectangle height
     * @param {number} radius - Corner radius
     */
    static drawRoundedRect(ctx, x, y, width, height, radius) {
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
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIHelpers;
} else {
    window.UIHelpers = UIHelpers;
}
