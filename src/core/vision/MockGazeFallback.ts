import { GazeTelemetry, Vector3D } from '../../types';
import { CognitiveAttentionEngine } from '../biomechanics/CognitiveAttentionEngine';

/**
 * Zero-Crash Mock Gaze Stream Fallback
 * Provides high-fidelity simulated 3D eye tracking telemetry if camera is unavailable.
 */
export class MockGazeFallback {
  private cognitiveEngine = new CognitiveAttentionEngine();
  private startTimeMs = performance.now();

  constructor() {
    this.cognitiveEngine.setCognitiveState('conversational');
  }

  public setScenario(scenario: 'reading' | 'conversational' | 'visual_search' | 'daydreaming'): void {
    this.cognitiveEngine.setCognitiveState(scenario);
  }

  public getTelemetry(nowMs: number = performance.now()): GazeTelemetry {
    const elapsed = nowMs - this.startTimeMs;
    const synth = this.cognitiveEngine.update(elapsed);

    // Map angles (-20 to +20 deg) to normalized screen coordinates [0, 1]
    const screenX = Math.max(0.05, Math.min(0.95, 0.5 + (synth.angles.yaw / 35.0)));
    const screenY = Math.max(0.05, Math.min(0.95, 0.5 + (synth.angles.pitch / 25.0)));

    return {
      timestampMs: nowMs,
      gazePoint2D: { x: screenX, y: screenY },
      gazeVector3D: synth.gazeVector3D,
      angles: synth.angles,
      angularVelocityDegPerSec: synth.angularVelocityDegPerSec,
      isSaccade: synth.isSaccade,
      isFixation: synth.isFixation,
      isBlink: synth.isBlink,
      eyelidAperture: synth.isBlink ? 0.0 : 1.0,
      eyeContactQuality: 0.98,
      pupilDiameterMm: 3.8 + Math.sin(nowMs * 0.002) * 0.4,
      confidence: 0.98,
      source: 'mock_fallback'
    };
  }
}
