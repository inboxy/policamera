/**
 * Application State Machine for PoliCamera
 * Manages application state transitions and feature flags
 * TypeScript version with strong typing
 */

// Define application states
export enum AppState {
    IDLE = 'idle',
    INITIALIZING = 'initializing',
    CAMERA_STARTING = 'camera_starting',
    CAMERA_ACTIVE = 'camera_active',
    DETECTING = 'detecting',
    CAPTURING = 'capturing',
    SWITCHING_CAMERA = 'switching_camera',
    ERROR = 'error',
}

// Define feature states
export enum FeatureState {
    DISABLED = 'disabled',
    ENABLING = 'enabling',
    ENABLED = 'enabled',
    DISABLING = 'disabling',
    ERROR = 'error',
}

// Feature names
export type FeatureName =
    | 'objectDetection'
    | 'faceDetection'
    | 'poseEstimation'
    | 'depthPrediction'
    | 'gpsTracking'
    | 'networkMonitoring'
    | 'ocrRecognition';

// State change history entry
export interface StateHistoryEntry {
    timestamp: number;
    from: AppState;
    to: AppState;
    reason: string;
}

// State summary
export interface StateSummary {
    appState: AppState;
    previousAppState: AppState | null;
    features: Record<FeatureName, FeatureState>;
    enabledFeatures: FeatureName[];
    recentHistory: StateHistoryEntry[];
}

// Listener callbacks
export type StateChangeCallback = (oldState: AppState, newState: AppState, reason: string) => void;
export type FeatureChangeCallback = (
    featureName: FeatureName,
    oldState: FeatureState,
    newState: FeatureState
) => void;

/**
 * State Manager for application state and features
 */
export class StateManager {
    private appState: AppState = AppState.IDLE;
    private previousAppState: AppState | null = null;

    // Feature states
    private features: Record<FeatureName, FeatureState> = {
        objectDetection: FeatureState.DISABLED,
        faceDetection: FeatureState.DISABLED,
        poseEstimation: FeatureState.DISABLED,
        depthPrediction: FeatureState.DISABLED,
        gpsTracking: FeatureState.DISABLED,
        networkMonitoring: FeatureState.DISABLED,
        ocrRecognition: FeatureState.DISABLED,
    };

    // State transition history
    private stateHistory: StateHistoryEntry[] = [];
    private readonly maxHistorySize: number = 50;

    // Event listeners
    private stateChangeListeners: StateChangeCallback[] = [];
    private featureChangeListeners: FeatureChangeCallback[] = [];

    /**
     * Valid state transitions map
     */
    private readonly validTransitions: Record<AppState, AppState[]> = {
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

    /**
     * Set application state
     */
    setAppState(newState: AppState, reason: string = ''): boolean {
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
    getAppState(): AppState {
        return this.appState;
    }

    /**
     * Check if in a specific state
     */
    isInState(state: AppState): boolean {
        return this.appState === state;
    }

    /**
     * Set feature state
     */
    setFeatureState(featureName: FeatureName, newState: FeatureState): boolean {
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
    getFeatureState(featureName: FeatureName): FeatureState {
        return this.features[featureName];
    }

    /**
     * Check if feature is enabled
     */
    isFeatureEnabled(featureName: FeatureName): boolean {
        return this.features[featureName] === FeatureState.ENABLED;
    }

    /**
     * Check if feature is in process of changing state
     */
    isFeatureChanging(featureName: FeatureName): boolean {
        const state = this.features[featureName];
        return state === FeatureState.ENABLING || state === FeatureState.DISABLING;
    }

    /**
     * Get all enabled features
     */
    getEnabledFeatures(): FeatureName[] {
        return (Object.keys(this.features) as FeatureName[]).filter(
            (feature) => this.features[feature] === FeatureState.ENABLED
        );
    }

    /**
     * Validate state transition
     */
    private isValidTransition(fromState: AppState, toState: AppState): boolean {
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
    private recordStateChange(fromState: AppState, toState: AppState, reason: string): void {
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
    getStateHistory(limit: number = 10): StateHistoryEntry[] {
        return this.stateHistory.slice(-limit);
    }

    /**
     * Add state change listener
     */
    onStateChange(callback: StateChangeCallback): void {
        this.stateChangeListeners.push(callback);
    }

    /**
     * Add feature change listener
     */
    onFeatureChange(callback: FeatureChangeCallback): void {
        this.featureChangeListeners.push(callback);
    }

    /**
     * Remove state change listener
     */
    removeStateChangeListener(callback: StateChangeCallback): void {
        const index = this.stateChangeListeners.indexOf(callback);
        if (index > -1) {
            this.stateChangeListeners.splice(index, 1);
        }
    }

    /**
     * Remove feature change listener
     */
    removeFeatureChangeListener(callback: FeatureChangeCallback): void {
        const index = this.featureChangeListeners.indexOf(callback);
        if (index > -1) {
            this.featureChangeListeners.splice(index, 1);
        }
    }

    /**
     * Notify state change listeners
     */
    private notifyStateChange(oldState: AppState, newState: AppState, reason: string): void {
        this.stateChangeListeners.forEach((callback) => {
            try {
                callback(oldState, newState, reason);
            } catch (error) {
                console.error('Error in state change listener:', error);
            }
        });
    }

    /**
     * Notify feature change listeners
     */
    private notifyFeatureChange(
        featureName: FeatureName,
        oldState: FeatureState,
        newState: FeatureState
    ): void {
        this.featureChangeListeners.forEach((callback) => {
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
    reset(): void {
        this.appState = AppState.IDLE;
        this.previousAppState = null;

        // Reset all features
        (Object.keys(this.features) as FeatureName[]).forEach((feature) => {
            this.features[feature] = FeatureState.DISABLED;
        });

        console.log('🔄 State Manager reset');
    }

    /**
     * Get current state summary
     */
    getStateSummary(): StateSummary {
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
    exportState(): string {
        return JSON.stringify(this.getStateSummary(), null, 2);
    }
}

// Export singleton instance
const stateManager = new StateManager();
export default stateManager;

// Add to window for non-module usage
if (typeof window !== 'undefined') {
    (window as any).stateManager = stateManager;
    (window as any).StateManager = StateManager;
    (window as any).AppState = AppState;
    (window as any).FeatureState = FeatureState;
}
