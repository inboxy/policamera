/**
 * Tests for StateManager
 */

import { StateManager, AppState, FeatureState, FeatureName } from '../app-state';

describe('StateManager', () => {
    let stateManager: StateManager;

    beforeEach(() => {
        stateManager = new StateManager();
    });

    describe('Application State Management', () => {
        test('should initialize with IDLE state', () => {
            expect(stateManager.getAppState()).toBe(AppState.IDLE);
        });

        test('should allow valid state transitions', () => {
            expect(stateManager.setAppState(AppState.INITIALIZING, 'Test')).toBe(true);
            expect(stateManager.getAppState()).toBe(AppState.INITIALIZING);
        });

        test('should reject invalid state transitions', () => {
            // Can't go directly from IDLE to DETECTING
            expect(stateManager.setAppState(AppState.DETECTING, 'Invalid')).toBe(false);
            expect(stateManager.getAppState()).toBe(AppState.IDLE);
        });

        test('should allow same-state transitions', () => {
            expect(stateManager.setAppState(AppState.IDLE, 'Same state')).toBe(true);
            expect(stateManager.getAppState()).toBe(AppState.IDLE);
        });

        test('should track previous state', () => {
            stateManager.setAppState(AppState.INITIALIZING, 'Test');
            stateManager.setAppState(AppState.CAMERA_STARTING, 'Test');
            const summary = stateManager.getStateSummary();
            expect(summary.previousAppState).toBe(AppState.INITIALIZING);
        });

        test('should check if in specific state', () => {
            stateManager.setAppState(AppState.CAMERA_ACTIVE, 'Test');
            expect(stateManager.isInState(AppState.CAMERA_ACTIVE)).toBe(true);
            expect(stateManager.isInState(AppState.IDLE)).toBe(false);
        });
    });

    describe('Feature State Management', () => {
        test('should initialize all features as DISABLED', () => {
            const summary = stateManager.getStateSummary();
            Object.values(summary.features).forEach((state) => {
                expect(state).toBe(FeatureState.DISABLED);
            });
        });

        test('should toggle feature state', () => {
            expect(stateManager.setFeatureState('objectDetection', FeatureState.ENABLED)).toBe(true);
            expect(stateManager.getFeatureState('objectDetection')).toBe(FeatureState.ENABLED);
        });

        test('should check if feature is enabled', () => {
            stateManager.setFeatureState('poseEstimation', FeatureState.ENABLED);
            expect(stateManager.isFeatureEnabled('poseEstimation')).toBe(true);
            expect(stateManager.isFeatureEnabled('faceDetection')).toBe(false);
        });

        test('should detect feature changing state', () => {
            stateManager.setFeatureState('depthPrediction', FeatureState.ENABLING);
            expect(stateManager.isFeatureChanging('depthPrediction')).toBe(true);

            stateManager.setFeatureState('depthPrediction', FeatureState.ENABLED);
            expect(stateManager.isFeatureChanging('depthPrediction')).toBe(false);
        });

        test('should get all enabled features', () => {
            stateManager.setFeatureState('objectDetection', FeatureState.ENABLED);
            stateManager.setFeatureState('gpsTracking', FeatureState.ENABLED);

            const enabled = stateManager.getEnabledFeatures();
            expect(enabled).toContain('objectDetection');
            expect(enabled).toContain('gpsTracking');
            expect(enabled).toHaveLength(2);
        });

        test('should handle OCR feature', () => {
            stateManager.setFeatureState('ocrRecognition', FeatureState.ENABLED);
            expect(stateManager.isFeatureEnabled('ocrRecognition')).toBe(true);
        });
    });

    describe('State History', () => {
        test('should record state transitions', () => {
            stateManager.setAppState(AppState.INITIALIZING, 'Test 1');
            stateManager.setAppState(AppState.CAMERA_STARTING, 'Test 2');

            const history = stateManager.getStateHistory();
            expect(history.length).toBeGreaterThan(0);
            expect(history[history.length - 1].to).toBe(AppState.CAMERA_STARTING);
            expect(history[history.length - 1].reason).toBe('Test 2');
        });

        test('should limit history size', () => {
            // Create more than 50 transitions
            for (let i = 0; i < 60; i++) {
                stateManager.setAppState(AppState.IDLE, `Transition ${i}`);
            }

            const history = stateManager.getStateHistory(100);
            expect(history.length).toBeLessThanOrEqual(50);
        });

        test('should return limited history', () => {
            for (let i = 0; i < 20; i++) {
                stateManager.setAppState(AppState.IDLE, `Transition ${i}`);
            }

            const history = stateManager.getStateHistory(5);
            expect(history.length).toBe(5);
        });
    });

    describe('Event Listeners', () => {
        test('should notify state change listeners', () => {
            const mockCallback = jest.fn();
            stateManager.onStateChange(mockCallback);

            stateManager.setAppState(AppState.INITIALIZING, 'Test');

            expect(mockCallback).toHaveBeenCalledWith(
                AppState.IDLE,
                AppState.INITIALIZING,
                'Test'
            );
        });

        test('should notify feature change listeners', () => {
            const mockCallback = jest.fn();
            stateManager.onFeatureChange(mockCallback);

            stateManager.setFeatureState('faceDetection', FeatureState.ENABLED);

            expect(mockCallback).toHaveBeenCalledWith(
                'faceDetection',
                FeatureState.DISABLED,
                FeatureState.ENABLED
            );
        });

        test('should handle listener errors gracefully', () => {
            const errorCallback = jest.fn(() => {
                throw new Error('Test error');
            });
            const validCallback = jest.fn();

            stateManager.onStateChange(errorCallback);
            stateManager.onStateChange(validCallback);

            stateManager.setAppState(AppState.INITIALIZING, 'Test');

            // Both should be called despite error in first
            expect(errorCallback).toHaveBeenCalled();
            expect(validCallback).toHaveBeenCalled();
        });

        test('should remove state change listener', () => {
            const mockCallback = jest.fn();
            stateManager.onStateChange(mockCallback);
            stateManager.removeStateChangeListener(mockCallback);

            stateManager.setAppState(AppState.INITIALIZING, 'Test');

            expect(mockCallback).not.toHaveBeenCalled();
        });

        test('should remove feature change listener', () => {
            const mockCallback = jest.fn();
            stateManager.onFeatureChange(mockCallback);
            stateManager.removeFeatureChangeListener(mockCallback);

            stateManager.setFeatureState('objectDetection', FeatureState.ENABLED);

            expect(mockCallback).not.toHaveBeenCalled();
        });
    });

    describe('State Summary and Export', () => {
        test('should generate state summary', () => {
            stateManager.setAppState(AppState.CAMERA_ACTIVE, 'Test');
            stateManager.setFeatureState('objectDetection', FeatureState.ENABLED);

            const summary = stateManager.getStateSummary();

            expect(summary.appState).toBe(AppState.CAMERA_ACTIVE);
            expect(summary.features.objectDetection).toBe(FeatureState.ENABLED);
            expect(summary.enabledFeatures).toContain('objectDetection');
        });

        test('should export state as JSON', () => {
            stateManager.setAppState(AppState.DETECTING, 'Test');

            const exported = stateManager.exportState();
            const parsed = JSON.parse(exported);

            expect(parsed.appState).toBe(AppState.DETECTING);
        });
    });

    describe('Reset Functionality', () => {
        test('should reset to initial state', () => {
            stateManager.setAppState(AppState.CAMERA_ACTIVE, 'Test');
            stateManager.setFeatureState('objectDetection', FeatureState.ENABLED);
            stateManager.setFeatureState('gpsTracking', FeatureState.ENABLED);

            stateManager.reset();

            expect(stateManager.getAppState()).toBe(AppState.IDLE);
            expect(stateManager.isFeatureEnabled('objectDetection')).toBe(false);
            expect(stateManager.isFeatureEnabled('gpsTracking')).toBe(false);
        });
    });

    describe('Valid State Transitions', () => {
        test('should allow IDLE -> INITIALIZING -> CAMERA_STARTING -> CAMERA_ACTIVE', () => {
            expect(stateManager.setAppState(AppState.INITIALIZING, 'Step 1')).toBe(true);
            expect(stateManager.setAppState(AppState.CAMERA_STARTING, 'Step 2')).toBe(true);
            expect(stateManager.setAppState(AppState.CAMERA_ACTIVE, 'Step 3')).toBe(true);
        });

        test('should allow CAMERA_ACTIVE -> DETECTING', () => {
            stateManager.setAppState(AppState.INITIALIZING, 'Test');
            stateManager.setAppState(AppState.CAMERA_STARTING, 'Test');
            stateManager.setAppState(AppState.CAMERA_ACTIVE, 'Test');

            expect(stateManager.setAppState(AppState.DETECTING, 'Start detection')).toBe(true);
        });

        test('should allow ERROR -> IDLE recovery', () => {
            stateManager.setAppState(AppState.INITIALIZING, 'Test');
            stateManager.setAppState(AppState.ERROR, 'Something went wrong');

            expect(stateManager.setAppState(AppState.IDLE, 'Recover')).toBe(true);
        });

        test('should reject IDLE -> DETECTING (skipping steps)', () => {
            expect(stateManager.setAppState(AppState.DETECTING, 'Invalid')).toBe(false);
        });
    });
});
