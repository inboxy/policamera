/**
 * Application State Machine for PoliCamera
 * Manages application state transitions and feature flags
 * TypeScript version with strong typing
 */
// Define application states
export var AppState;
(function (AppState) {
    AppState["IDLE"] = "idle";
    AppState["INITIALIZING"] = "initializing";
    AppState["CAMERA_STARTING"] = "camera_starting";
    AppState["CAMERA_ACTIVE"] = "camera_active";
    AppState["DETECTING"] = "detecting";
    AppState["CAPTURING"] = "capturing";
    AppState["SWITCHING_CAMERA"] = "switching_camera";
    AppState["ERROR"] = "error";
})(AppState || (AppState = {}));
// Define feature states
export var FeatureState;
(function (FeatureState) {
    FeatureState["DISABLED"] = "disabled";
    FeatureState["ENABLING"] = "enabling";
    FeatureState["ENABLED"] = "enabled";
    FeatureState["DISABLING"] = "disabling";
    FeatureState["ERROR"] = "error";
})(FeatureState || (FeatureState = {}));
/**
 * State Manager for application state and features
 */
export class StateManager {
    constructor() {
        this.appState = AppState.IDLE;
        this.previousAppState = null;
        // Feature states
        this.features = {
            objectDetection: FeatureState.DISABLED,
            faceDetection: FeatureState.DISABLED,
            poseEstimation: FeatureState.DISABLED,
            depthPrediction: FeatureState.DISABLED,
            gpsTracking: FeatureState.DISABLED,
            networkMonitoring: FeatureState.DISABLED,
            ocrRecognition: FeatureState.DISABLED,
        };
        // State transition history
        this.stateHistory = [];
        this.maxHistorySize = 50;
        // Event listeners
        this.stateChangeListeners = [];
        this.featureChangeListeners = [];
        /**
         * Valid state transitions map
         */
        this.validTransitions = {
            [AppState.IDLE]: [AppState.INITIALIZING, AppState.ERROR],
            [AppState.INITIALIZING]: [AppState.CAMERA_STARTING, AppState.ERROR],
            [AppState.CAMERA_STARTING]: [AppState.CAMERA_ACTIVE, AppState.ERROR, AppState.IDLE],
            [AppState.CAMERA_ACTIVE]: [
                AppState.DETECTING,
                AppState.CAPTURING,
                AppState.SWITCHING_CAMERA,
                AppState.IDLE,
                AppState.ERROR,
            ],
            [AppState.DETECTING]: [AppState.CAMERA_ACTIVE, AppState.CAPTURING, AppState.ERROR, AppState.IDLE],
            [AppState.CAPTURING]: [AppState.CAMERA_ACTIVE, AppState.DETECTING, AppState.ERROR],
            [AppState.SWITCHING_CAMERA]: [AppState.CAMERA_ACTIVE, AppState.ERROR, AppState.IDLE],
            [AppState.ERROR]: [AppState.IDLE, AppState.INITIALIZING],
        };
    }
    /**
     * Set application state
     */
    setAppState(newState, reason = '') {
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
     */
    getAppState() {
        return this.appState;
    }
    /**
     * Check if in a specific state
     */
    isInState(state) {
        return this.appState === state;
    }
    /**
     * Set feature state
     */
    setFeatureState(featureName, newState) {
        const oldState = this.features[featureName];
        this.features[featureName] = newState;
        // Notify listeners
        this.notifyFeatureChange(featureName, oldState, newState);
        console.log(`✨ Feature ${featureName}: ${oldState} -> ${newState}`);
        return true;
    }
    /**
     * Get feature state
     */
    getFeatureState(featureName) {
        return this.features[featureName];
    }
    /**
     * Check if feature is enabled
     */
    isFeatureEnabled(featureName) {
        return this.features[featureName] === FeatureState.ENABLED;
    }
    /**
     * Check if feature is in process of changing state
     */
    isFeatureChanging(featureName) {
        const state = this.features[featureName];
        return state === FeatureState.ENABLING || state === FeatureState.DISABLING;
    }
    /**
     * Get all enabled features
     */
    getEnabledFeatures() {
        return Object.keys(this.features).filter((feature) => this.features[feature] === FeatureState.ENABLED);
    }
    /**
     * Validate state transition
     */
    isValidTransition(fromState, toState) {
        // Allow same-state transitions (idempotent)
        if (fromState === toState) {
            return true;
        }
        const allowed = this.validTransitions[fromState] || [];
        return allowed.includes(toState);
    }
    /**
     * Record state change in history
     */
    recordStateChange(fromState, toState, reason) {
        this.stateHistory.push({
            timestamp: Date.now(),
            from: fromState,
            to: toState,
            reason: reason || 'No reason provided',
        });
        // Limit history size
        if (this.stateHistory.length > this.maxHistorySize) {
            this.stateHistory.shift();
        }
    }
    /**
     * Get state transition history
     */
    getStateHistory(limit = 10) {
        return this.stateHistory.slice(-limit);
    }
    /**
     * Add state change listener
     */
    onStateChange(callback) {
        this.stateChangeListeners.push(callback);
    }
    /**
     * Add feature change listener
     */
    onFeatureChange(callback) {
        this.featureChangeListeners.push(callback);
    }
    /**
     * Remove state change listener
     */
    removeStateChangeListener(callback) {
        const index = this.stateChangeListeners.indexOf(callback);
        if (index > -1) {
            this.stateChangeListeners.splice(index, 1);
        }
    }
    /**
     * Remove feature change listener
     */
    removeFeatureChangeListener(callback) {
        const index = this.featureChangeListeners.indexOf(callback);
        if (index > -1) {
            this.featureChangeListeners.splice(index, 1);
        }
    }
    /**
     * Notify state change listeners
     */
    notifyStateChange(oldState, newState, reason) {
        this.stateChangeListeners.forEach((callback) => {
            try {
                callback(oldState, newState, reason);
            }
            catch (error) {
                console.error('Error in state change listener:', error);
            }
        });
    }
    /**
     * Notify feature change listeners
     */
    notifyFeatureChange(featureName, oldState, newState) {
        this.featureChangeListeners.forEach((callback) => {
            try {
                callback(featureName, oldState, newState);
            }
            catch (error) {
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
        Object.keys(this.features).forEach((feature) => {
            this.features[feature] = FeatureState.DISABLED;
        });
        console.log('🔄 State Manager reset');
    }
    /**
     * Get current state summary
     */
    getStateSummary() {
        return {
            appState: this.appState,
            previousAppState: this.previousAppState,
            features: { ...this.features },
            enabledFeatures: this.getEnabledFeatures(),
            recentHistory: this.getStateHistory(5),
        };
    }
    /**
     * Export state for debugging
     */
    exportState() {
        return JSON.stringify(this.getStateSummary(), null, 2);
    }
}
// Export singleton instance
const stateManager = new StateManager();
export default stateManager;
// Add to window for non-module usage
if (typeof window !== 'undefined') {
    window.stateManager = stateManager;
    window.StateManager = StateManager;
    window.AppState = AppState;
    window.FeatureState = FeatureState;
}
//# sourceMappingURL=app-state.js.map