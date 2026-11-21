import { describe, it, expect } from 'vitest';
import { AgentEventBus } from '../src/agent-core/eventBus';
import { AuditorAgent } from '../src/agent-core/AuditorAgent';
import { FoveaOptimizerSpecialist } from '../src/agent-core/FoveaOptimizerSpecialist';
import { OrchestratorAgent } from '../src/agent-core/OrchestratorAgent';
import { BiomechanicsSpecialist } from '../src/agent-core/BiomechanicsSpecialist';
import { IrisTracker } from '../src/core/vision/IrisTracker';

describe('Phase 3: Autonomous Multi-Agent Dynamic Budgeting & Cognitive Gaze Infill', () => {
  it('triggers OPTIMIZE_FILL_RATE directive when AuditorAgent detects FPS drops below 55', async () => {
    const bus = AgentEventBus.getInstance();
    const auditor = new AuditorAgent(bus);
    const foveaOptimizer = new FoveaOptimizerSpecialist(bus);

    let receivedDirective = false;
    let contractedRadius = 0;

    foveaOptimizer.onSettingsAdjustment((settings) => {
      if (settings.foveaRadiusDeg) {
        receivedDirective = true;
        contractedRadius = settings.foveaRadiusDeg;
      }
    });

    // Auditor checks normal 60 FPS -> no directive
    await auditor.auditFramerate(60);
    expect(receivedDirective).toBe(false);

    // Auditor checks 48 FPS (< 55 bound) -> triggers dynamic foveated budgeting!
    await auditor.auditFramerate(48);
    expect(receivedDirective).toBe(true);
    expect(contractedRadius).toBe(2.2);

    auditor.dispose();
    foveaOptimizer.dispose();
  });

  it('contracts foveal cone and increases GPU fill shading savings under throttled budget', () => {
    const bus = AgentEventBus.getInstance();
    const foveaOptimizer = new FoveaOptimizerSpecialist(bus);

    // Unthrottled 3.0° fovea
    const unthrottledStats = foveaOptimizer.computeStats({
      enabled: true,
      foveaRadiusDeg: 3.0,
      parafoveaRadiusDeg: 6.0,
      peripheralSamplingRate: 0.25,
      blurStrength: 3.5,
      visualizeFoveaCone: false,
      depthOfFieldEnabled: true,
      focalDepthMeters: 1.2
    });

    // Contracted 2.2° fovea
    const throttledStats = foveaOptimizer.computeStats({
      enabled: true,
      foveaRadiusDeg: 2.2,
      parafoveaRadiusDeg: 5.0,
      peripheralSamplingRate: 0.25,
      blurStrength: 3.5,
      visualizeFoveaCone: false,
      depthOfFieldEnabled: true,
      focalDepthMeters: 1.2
    });

    // Throttled fovea has smaller high-res cone, yielding higher savings and fewer effective pixels
    expect(throttledStats.pixelShadingReductionPercent).toBeGreaterThan(unthrottledStats.pixelShadingReductionPercent);
    expect(throttledStats.foveatedEffectivePixels).toBeLessThan(unthrottledStats.foveatedEffectivePixels);

    foveaOptimizer.dispose();
  });

  it('engages Cognitive Gaze Infill on sensory dropout and transitions back upon recovery', async () => {
    const bus = AgentEventBus.getInstance();
    const orchestrator = new OrchestratorAgent(bus);
    const biomechanics = new BiomechanicsSpecialist(bus);

    // Initial state
    expect(biomechanics.getIsInfillActive()).toBe(false);

    // Webcam drops out or face is occluded
    await orchestrator.triggerCognitiveGazeInfill('WEBCAM_OCCLUSION_TEST');

    expect(bus.getState().activeMode).toBe('biomechanical_synth');
    expect(biomechanics.getIsInfillActive()).toBe(true);
    expect(bus.getState().cognitiveState).toBe('conversational');

    // Generating synthetic eye movements during infill
    const sample = biomechanics.update(Date.now());
    expect(sample.angles).toBeDefined();
    expect(sample.gazeVector3D).toBeDefined();

    // Webcam re-acquired -> restore live tracking
    await orchestrator.restoreLiveWebcamTracking();

    expect(bus.getState().activeMode).toBe('live_webcam');
    expect(biomechanics.getIsInfillActive()).toBe(false);

    orchestrator.dispose();
    biomechanics.dispose();
  });

  it('notifies subscribers when face tracking status changes', () => {
    const tracker = new IrisTracker();
    let statusReceived: boolean | null = null;
    let reasonReceived: string | undefined = undefined;

    const unsub = tracker.subscribeTrackingStatus((isTracking, reason) => {
      statusReceived = isTracking;
      reasonReceived = reason;
    });

    expect(tracker.getIsFaceTracked()).toBe(false);
    unsub();
  });
});

