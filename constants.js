/**
 * Application Constants
 * Centralized configuration values for PoliCamera
 */

const AppConstants = {
    // Application Info
    APP_VERSION: '1.0.0',
    DB_NAME: 'PoliCameraDB',
    DB_VERSION: 1,

    // User ID
    USER_ID_LENGTH: 12,
    USER_ID_COOKIE_NAME: 'policamera-userid',
    USER_ID_COOKIE_EXPIRY_DAYS: 365,

    // Camera Configuration
    CAMERA: {
        FACING_MODE: 'environment',
        IDEAL_WIDTH: 1920,
        IDEAL_HEIGHT: 1080,
        IMAGE_QUALITY: 0.9,
        IMAGE_FORMAT: 'image/jpeg'
    },

    // GPS Configuration
    GPS: {
        ENABLE_HIGH_ACCURACY: true,
        TIMEOUT: 10000,
        MAXIMUM_AGE: 60000,
        UPDATE_INTERVAL: 500 // milliseconds
    },

    // Pull-to-Refresh
    PULL_TO_REFRESH: {
        THRESHOLD: 80,
        INDICATOR_SIZE: 60,
        REFRESH_DELAY: 600
    },

    // VTT (WebVTT) Configuration
    VTT: {
        CUE_DURATION: 500,
        UPDATE_THRESHOLD: 500,
        MAX_CUES: 100
    },

    // UI Timing
    TIMING: {
        AUTO_START_DELAY: 100,
        CAPTURE_FLASH_DURATION: 200,
        TOAST_DURATION: 2000,
        ERROR_TOAST_DURATION: 4000,
        STITCH_SUCCESS_TOAST: 5000,
        DETECTION_TOAST_DURATION: 2000
    },

    // Storage
    STORAGE: {
        LOCAL_STORAGE_KEY: 'policamera-photos'
    },

    // AI Detection
    AI: {
        INPUT_SIZE: 192,
        MAX_FPS: 30,
        DETECTION_THRESHOLD: 0.5,
        MAX_DETECTIONS: 15,
        MIN_DETECTION_FRAMES: 1,
        MAX_MISSING_FRAMES: 5,
        NMS_IOU_THRESHOLD: 0.5,
        TRACKING_IOU_THRESHOLD: 0.4,
        SMOOTHING_ALPHA: 0.75,
        VELOCITY_SMOOTHING: 0.7,
        PREDICTION_WEIGHT: 0.5,
        MAX_VELOCITY: 500,
        MODEL_BASE: 'lite_mobilenet_v2',
        WORKER_TIMEOUT: 30000,
        MAX_WORKER_FAILURES: 3,
        CANVAS_POOL_SIZE: 2
    },

    // Detection Overlay
    OVERLAY: {
        STROKE_WIDTH: 3,
        CORNER_STROKE_WIDTH: 4,
        MIN_CORNER_LENGTH: 20,
        LABEL_PADDING: 8,
        LABEL_HEIGHT: 18,
        LABEL_FONT: 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        LABEL_OPACITY: 0.9,
        CONFIDENCE_BAR_HEIGHT: 3,
        STATS_PADDING: 12,
        STATS_LINE_HEIGHT: 18,
        STATS_WIDTH: 200,
        MIN_BBOX_SIZE: 5,
        TOP_CLASSES_COUNT: 5
    },

    // Image Stitching
    STITCHING: {
        MIN_PHOTOS: 2,
        DEFAULT_METHOD: 'auto',
        DEFAULT_OVERLAP: 0.1,
        ENABLE_BLENDING: true,
        QUALITY: 0.9,
        FORMAT: 'image/jpeg'
    },

    // Network Status
    NETWORK: {
        CONNECTION_QUALITY: {
            '4g': 'excellent',
            '3g': 'good',
            '2g': 'fair',
            'slow-2g': 'poor'
        }
    },

    // Service Worker
    SERVICE_WORKER: {
        SCRIPT_PATH: 'sw.js',
        CACHE_NAME: 'policamera-v3' // Updated to match sw.js
    },

    // Theme Colors
    COLORS: {
        PRIMARY: '#B4F222',
        PRIMARY_DARK: '#8BC219',
        ERROR: '#F44336',
        SUCCESS: '#4CAF50',
        WARNING: '#FF9800'
    },

    // Detection Statistics
    STATS: {
        FRAME_BUFFER_SIZE: 100
    },

    // Contour Detection and Caching
    CONTOUR: {
        CACHE_MAX_SIZE: 50,
        UPDATE_INTERVAL: 5, // frames
        CACHE_CLEANUP_PERCENTAGE: 0.2,
        SIMPLIFICATION_FACTOR: 2.0,
        MIN_CONTOUR_POINTS: 3,
        MAX_CONTOUR_POINTS: 500
    },

    // OpenCV Edge Detection
    OPENCV: {
        CANNY_THRESHOLD_LOW: 30,
        CANNY_THRESHOLD_HIGH: 90,
        BILATERAL_FILTER_D: 9,
        BILATERAL_FILTER_SIGMA_COLOR: 75,
        BILATERAL_FILTER_SIGMA_SPACE: 75,
        MIN_ROI_SIZE: 20,
        MIN_CONTOUR_AREA_PERCENTAGE: 0.1
    },

    // Frame Management
    FRAME: {
        MAX_FRAME_NUMBER: 1000000000 // Reset after ~193 days at 60fps
    },

    // Depth Prediction
    DEPTH: {
        WARMUP_DELAY_MS: 2000,
        TARGET_FPS: 10,
        OPACITY: 0.7
    }
};

// Freeze the object to prevent modifications
Object.freeze(AppConstants);
Object.freeze(AppConstants.CAMERA);
Object.freeze(AppConstants.GPS);
Object.freeze(AppConstants.PULL_TO_REFRESH);
Object.freeze(AppConstants.VTT);
Object.freeze(AppConstants.TIMING);
Object.freeze(AppConstants.STORAGE);
Object.freeze(AppConstants.AI);
Object.freeze(AppConstants.OVERLAY);
Object.freeze(AppConstants.STITCHING);
Object.freeze(AppConstants.NETWORK);
Object.freeze(AppConstants.SERVICE_WORKER);
Object.freeze(AppConstants.COLORS);
Object.freeze(AppConstants.STATS);
Object.freeze(AppConstants.CONTOUR);
Object.freeze(AppConstants.OPENCV);
Object.freeze(AppConstants.FRAME);
Object.freeze(AppConstants.DEPTH);

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppConstants;
} else {
    window.AppConstants = AppConstants;
}
