/**
 * Application State Machine for PoliCamera
 * Manages application state transitions and feature flags
 * TypeScript version with strong typing
 */
export declare enum AppState {
    IDLE = "idle",
    INITIALIZING = "initializing",
    CAMERA_STARTING = "camera_starting",
    CAMERA_ACTIVE = "camera_active",
    DETECTING = "detecting",
    CAPTURING = "capturing",
    SWITCHING_CAMERA = "switching_camera",
    ERROR = "error"
}
export declare enum FeatureState {
    DISABLED = "disabled",
    ENABLING = "enabling",
    ENABLED = "enabled",
    DISABLING = "disabling",
    ERROR = "error"
}
export type FeatureName = 'objectDetection' | 'faceDetection' | 'poseEstimation' | 'depthPrediction' | 'gpsTracking' | 'networkMonitoring' | 'ocrRecognition';
export interface StateHistoryEntry {
    timestamp: number;
    from: AppState;
    to: AppState;
    reason: string;
}
export interface StateSummary {
    appState: AppState;
    previousAppState: AppState | null;
    features: Record<FeatureName, FeatureState>;
    enabledFeatures: FeatureName[];
    recentHistory: StateHistoryEntry[];
}
export type StateChangeCallback = (oldState: AppState, newState: AppState, reason: string) => void;
export type FeatureChangeCallback = (featureName: FeatureName, oldState: FeatureState, newState: FeatureState) => void;
/**
 * State Manager for application state and features
 */
export declare class StateManager {
    private appState;
    private previousAppState;
    private features;
    private stateHistory;
    private readonly maxHistorySize;
    private stateChangeListeners;
    private featureChangeListeners;
    /**
     * Valid state transitions map
     */
    private readonly validTransitions;
    /**
     * Set application state
     */
    setAppState(newState: AppState, reason?: string): boolean;
    /**
     * Get current application state
     */
    getAppState(): AppState;
    /**
     * Check if in a specific state
     */
    isInState(state: AppState): boolean;
    /**
     * Set feature state
     */
    setFeatureState(featureName: FeatureName, newState: FeatureState): boolean;
    /**
     * Get feature state
     */
    getFeatureState(featureName: FeatureName): FeatureState;
    /**
     * Check if feature is enabled
     */
    isFeatureEnabled(featureName: FeatureName): boolean;
    /**
     * Check if feature is in process of changing state
     */
    isFeatureChanging(featureName: FeatureName): boolean;
    /**
     * Get all enabled features
     */
    getEnabledFeatures(): FeatureName[];
    /**
     * Validate state transition
     */
    private isValidTransition;
    /**
     * Record state change in history
     */
    private recordStateChange;
    /**
     * Get state transition history
     */
    getStateHistory(limit?: number): StateHistoryEntry[];
    /**
     * Add state change listener
     */
    onStateChange(callback: StateChangeCallback): void;
    /**
     * Add feature change listener
     */
    onFeatureChange(callback: FeatureChangeCallback): void;
    /**
     * Remove state change listener
     */
    removeStateChangeListener(callback: StateChangeCallback): void;
    /**
     * Remove feature change listener
     */
    removeFeatureChangeListener(callback: FeatureChangeCallback): void;
    /**
     * Notify state change listeners
     */
    private notifyStateChange;
    /**
     * Notify feature change listeners
     */
    private notifyFeatureChange;
    /**
     * Reset to initial state
     */
    reset(): void;
    /**
     * Get current state summary
     */
    getStateSummary(): StateSummary;
    /**
     * Export state for debugging
     */
    exportState(): string;
}
declare const stateManager: StateManager;
export default stateManager;
//# sourceMappingURL=app-state.d.ts.map