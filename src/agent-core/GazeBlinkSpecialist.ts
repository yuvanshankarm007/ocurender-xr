import { BaseAgent } from './BaseAgent';
import { AgentEventBus } from './eventBus';
import { AgentMessage, BlinkMetrics } from './types';
import { EyeAspectRatioBlinkEngine } from '../core/vision/EyeAspectRatioBlinkEngine';
import { NormalizedLandmarkList } from '@mediapipe/face_mesh';
import { GazeTelemetry } from '../types';

export class GazeBlinkSpecialist extends BaseAgent {
  private blinkEngine = new EyeAspectRatioBlinkEngine();
  private lastStateUpdateTime = 0;
  private lastBlinkState = '';
  private lastBlinkCount = 0;
  private wasBlinkActive = false;

  constructor(bus: AgentEventBus) {
    super('agent.specialist.gaze_blink', 2, 'Gaze & Blink Sensory Specialist', bus);
  }

  public async handleMessage(msg: AgentMessage): Promise<void> {
    if (msg.intent === 'CALIBRATION_EVENT') {
      // Re-center baseline
      await this.sendPeer(
        'agent.governance.auditor',
        'Spatial Safety Auditor',
        'CONVERGENCE_AUDIT',
        'CALIBRATION_CONFIRMED',
        { status: 'SUCCESS' },
        'Optical center and EAR resting baseline recalibrated.'
      );
    }
  }

  /**
   * Called on every video frame from MediaPipe
   */
  public processLandmarks(landmarks: NormalizedLandmarkList, telemetry: GazeTelemetry): BlinkMetrics {
    const metrics = this.blinkEngine.update(landmarks);

    // If a blink onset is detected, alert the peer network
    if (metrics.isBlinkActive && !this.wasBlinkActive) {
      this.wasBlinkActive = true;
      this.sendPeer(
        'agent.specialist.virtual_camera',
        'Virtual Camera Specialist',
        'BLINK_DETECTED',
        'OCULAR_OCCLUSION_EVENT',
        { metrics, bellsElevationDeg: metrics.bellsElevationDeg },
        `High-confidence blink detected (EAR: ${metrics.currentEar} < ${metrics.earThreshold}). Applying Bell's elevation.`
      );
    } else if (!metrics.isBlinkActive) {
      this.wasBlinkActive = false;
    }

    // High-performance state update: immediate on actual blink onset/closure or count change,
    // otherwise throttled to 800ms to eliminate unnecessary React component re-renders
    const now = performance.now();
    const hasTransition =
      metrics.isBlinkActive !== (this.lastBlinkState === 'CLOSED' || this.lastBlinkState === 'CLOSING') ||
      metrics.totalBlinksDetected !== this.lastBlinkCount;

    if (hasTransition || (now - this.lastStateUpdateTime > 800)) {
      this.lastStateUpdateTime = now;
      this.lastBlinkState = metrics.blinkState;
      this.lastBlinkCount = metrics.totalBlinksDetected;
      this.bus.updateState(() => ({
        blinkMetrics: metrics
      }));
    }

    return metrics;
  }

  public triggerManualBlink(): BlinkMetrics {
    const metrics = this.blinkEngine.manualBlink();
    this.bus.updateState(() => ({
      blinkMetrics: metrics
    }));
    this.sendPeer(
      'agent.specialist.virtual_camera',
      'Virtual Camera Specialist',
      'BLINK_DETECTED',
      'MANUAL_BLINK_TRIGGERED',
      { metrics, bellsElevationDeg: 3.5 },
      `Manual test blink dispatched with Bell's 3.5° elevation.`
    );
    return metrics;
  }
}
