/**
 * Application State Machine for PoliCamera
 * Manages application state transitions and feature flags
 */

// Define application states
const AppState = Object.freeze({
    IDLE: 'idle',
    INITIALIZING: 'initializing',
    CAMERA_STARTING: 'camera_starting',
    CAMERA_ACTIVE: 'camera_active',
    DETECTING: 'detecting',
    CAPTURING: 'capturing',
    SWITCHING_CAMERA: 'switching_camera',
    ERROR: 'error'
});

// Define feature states
const FeatureState = Object.freeze({
    DISABLED: 'disabled',
    ENABLING: 'enabling',
    ENABLED: 'enabled',
    DISABLING: 'disabling',
    ERROR: 'error'
});

/**
 * State Manager for application state and features
 */
class StateManager {
    constructor() {
        // Application state
        this.appState = AppState.IDLE;
        this.previousAppState = null;

        // Feature states
        this.features = {
            objectDetection: FeatureState.DISABLED,
            faceDetection: FeatureState.DISABLED,
            poseEstimation: FeatureState.DISABLED,
            depthPrediction: FeatureState.DISABLED,
            gpsTracking: FeatureState.DISABLED,
            networkMonitoring: FeatureState.DISABLED
        };

        // State transition history (for debugging)
        this.stateHistory = [];
        this.maxHistorySize = 50;

        // Event listeners
        this.listeners = {
            stateChange: [],
            featureChange: []
        };
    }

    /**
     * Set application state
     * @param {string} newState - New state from AppState enum
     * @param {string} reason - Reason for state change (for debugging)
     */
    setAppState(newState, reason = '') {
        if (!Object.values(AppState).includes(newState)) {
            console.error(`Invalid app state: ${newState}`);
            return false;
        }

        const oldState = this.appState;

        // Validate state transition
        if (!this.isValidTransition(oldState, newState)) {
            console.warn(`Invalid state transition: ${oldState} -> ${newState}`);
            return false;
        }

        this.previousAppState = oldState;
        this.appState = newState;

        // Record in history
        this.recordStateChange(oldState, newState, reason);

        // Notify listeners
        this.notifyStateChange(oldState, newState, reason);

        console.log(`🔄 App State: ${oldState} -> ${newState}${reason ? ` (${reason})` : ''}`);
        return true;
    }

    /**
     * Get current application state
     * @returns {string}
     */
    getAppState() {
        return this.appState;
    }

    /**
     * Check if in a specific state
     * @param {string} state - State to check
     * @returns {boolean}
     */
    isInState(state) {
        return this.appState === state;
    }

    /**
     * Set feature state
     * @param {string} featureName - Name of the feature
     * @param {string} newState - New state from FeatureState enum
     */
    setFeatureState(featureName, newState) {
        if (!this.features.hasOwnProperty(featureName)) {
            console.error(`Unknown feature: ${featureName}`);
            return false;
        }

        if (!Object.values(FeatureState).includes(newState)) {
            console.error(`Invalid feature state: ${newState}`);
            return false;
        }

        const oldState = this.features[featureName];
        this.features[featureName] = newState;

        // Notify listeners
        this.notifyFeatureChange(featureName, oldState, newState);

        console.log(`✨ Feature ${featureName}: ${oldState} -> ${newState}`);
        return true;
    }

    /**
     * Get feature state
     * @param {string} featureName - Name of the feature
     * @returns {string}
     */
    getFeatureState(featureName) {
        return this.features[featureName] || FeatureState.DISABLED;
    }

    /**
     * Check if feature is enabled
     * @param {string} featureName - Name of the feature
     * @returns {boolean}
     */
    isFeatureEnabled(featureName) {
        return this.features[featureName] === FeatureState.ENABLED;
    }

    /**
     * Check if feature is in process of changing state
     * @param {string} featureName - Name of the feature
     * @returns {boolean}
     */
    isFeatureChanging(featureName) {
        const state = this.features[featureName];
        return state === FeatureState.ENABLING || state === FeatureState.DISABLING;
    }

    /**
     * Get all enabled features
     * @returns {Array<string>}
     */
    getEnabledFeatures() {
        return Object.keys(this.features).filter(
            feature => this.features[feature] === FeatureState.ENABLED
        );
    }

    /**
     * Validate state transition
     * @param {string} fromState - Current state
     * @param {string} toState - Desired state
     * @returns {boolean}
     */
    isValidTransition(fromState, toState) {
        // Allow same-state transitions (idempotent)
        if (fromState === toState) {
            return true;
        }

        // Define valid transitions
        const validTransitions = {
            [AppState.IDLE]: [AppState.INITIALIZING, AppState.ERROR],
            [AppState.INITIALIZING]: [AppState.CAMERA_STARTING, AppState.ERROR],
            [AppState.CAMERA_STARTING]: [AppState.CAMERA_ACTIVE, AppState.ERROR, AppState.IDLE],
            [AppState.CAMERA_ACTIVE]: [AppState.DETECTING, AppState.CAPTURING, AppState.SWITCHING_CAMERA, AppState.IDLE, AppState.ERROR],
            [AppState.DETECTING]: [AppState.CAMERA_ACTIVE, AppState.CAPTURING, AppState.ERROR, AppState.IDLE],
            [AppState.CAPTURING]: [AppState.CAMERA_ACTIVE, AppState.DETECTING, AppState.ERROR],
            [AppState.SWITCHING_CAMERA]: [AppState.CAMERA_ACTIVE, AppState.ERROR, AppState.IDLE],
            [AppState.ERROR]: [AppState.IDLE, AppState.INITIALIZING]
        };

        const allowed = validTransitions[fromState] || [];
        return allowed.includes(toState);
    }

    /**
     * Record state change in history
     * @param {string} fromState - Previous state
     * @param {string} toState - New state
     * @param {string} reason - Reason for change
     */
    recordStateChange(fromState, toState, reason) {
        this.stateHistory.push({
            timestamp: Date.now(),
            from: fromState,
            to: toState,
            reason: reason || 'No reason provided'
        });

        // Limit history size
        if (this.stateHistory.length > this.maxHistorySize) {
            this.stateHistory.shift();
        }
    }

    /**
     * Get state transition history
     * @param {number} limit - Number of recent transitions to return
     * @returns {Array<Object>}
     */
    getStateHistory(limit = 10) {
        return this.stateHistory.slice(-limit);
    }

    /**
     * Add state change listener
     * @param {Function} callback - Callback function(oldState, newState, reason)
     */
    onStateChange(callback) {
        if (typeof callback === 'function') {
            this.listeners.stateChange.push(callback);
        }
    }

    /**
     * Add feature change listener
     * @param {Function} callback - Callback function(featureName, oldState, newState)
     */
    onFeatureChange(callback) {
        if (typeof callback === 'function') {
            this.listeners.featureChange.push(callback);
        }
    }

    /**
     * Notify state change listeners
     * @param {string} oldState - Previous state
     * @param {string} newState - New state
     * @param {string} reason - Reason for change
     */
    notifyStateChange(oldState, newState, reason) {
        this.listeners.stateChange.forEach(callback => {
            try {
                callback(oldState, newState, reason);
            } catch (error) {
                console.error('Error in state change listener:', error);
            }
        });
    }

    /**
     * Notify feature change listeners
     * @param {string} featureName - Feature name
     * @param {string} oldState - Previous state
     * @param {string} newState - New state
     */
    notifyFeatureChange(featureName, oldState, newState) {
        this.listeners.featureChange.forEach(callback => {
            try {
                callback(featureName, oldState, newState);
            } catch (error) {
                console.error('Error in feature change listener:', error);
            }
        });
    }

    /**
     * Reset to initial state
     */
    reset() {
        this.appState = AppState.IDLE;
        this.previousAppState = null;

        // Reset all features
        Object.keys(this.features).forEach(feature => {
            this.features[feature] = FeatureState.DISABLED;
        });

        console.log('🔄 State Manager reset');
    }

    /**
     * Get current state summary
     * @returns {Object}
     */
    getStateSummary() {
        return {
            appState: this.appState,
            previousAppState: this.previousAppState,
            features: { ...this.features },
            enabledFeatures: this.getEnabledFeatures(),
            recentHistory: this.getStateHistory(5)
        };
    }

    /**
     * Export state for debugging
     * @returns {string} JSON string of current state
     */
    exportState() {
        return JSON.stringify(this.getStateSummary(), null, 2);
    }
}

// Export enums and class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StateManager, AppState, FeatureState };
} else {
    window.StateManager = StateManager;
    window.AppState = AppState;
    window.FeatureState = FeatureState;
}
