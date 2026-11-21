import { CognitiveState, Vector3D } from '../../types';
import { SaccadeSynthesizer } from './SaccadeSynthesizer';
import { OcularNoiseModel } from './OcularNoiseModel';
import { BlinkDynamics } from './BlinkDynamics';

export class CognitiveAttentionEngine {
  private synthesizer = new SaccadeSynthesizer();
  private noiseModel = new OcularNoiseModel();
  private blinkModel = new BlinkDynamics();

  private currentState: CognitiveState = 'conversational';
  private currentGazeDeg = { yaw: 0, pitch: 0 };
  private targetGazeDeg = { yaw: 0, pitch: 0 };
  private saccadeTrajectory: { t: number; x: number; y: number; velocity: number }[] = [];
  private saccadeStartTimeMs = 0;
  private isExecutingSaccade = false;

  private readingLineIndex = 0;
  private readingWordStep = 0;
  private nextFixationTimeMs = 0;

  constructor() {
    this.scheduleNextCognitiveEvent(0);
  }

  public setCognitiveState(state: CognitiveState): void {
    this.currentState = state;
    this.readingLineIndex = 0;
    this.readingWordStep = 0;
    this.noiseModel.reset();
  }

  public getCognitiveState(): CognitiveState {
    return this.currentState;
  }

  private scheduleNextCognitiveEvent(nowMs: number): void {
    let dwellMs = 300;
    let nextYaw = 0;
    let nextPitch = 0;

    switch (this.currentState) {
      case 'reading': {
        dwellMs = 200 + Math.random() * 80; // 200-280ms fixation per word
        this.readingWordStep++;
        if (this.readingWordStep > 6) {
          // Return sweep to start of next line
          this.readingWordStep = 0;
          this.readingLineIndex = (this.readingLineIndex + 1) % 4;
          nextYaw = -10.0;
          nextPitch = -4.0 + this.readingLineIndex * 2.5;
        } else {
          // Horizontal forward saccade along line
          nextYaw = -10.0 + this.readingWordStep * 3.5;
          nextPitch = -4.0 + this.readingLineIndex * 2.5;
        }
        break;
      }

      case 'conversational': {
        dwellMs = 600 + Math.random() * 1200; // 600-1800ms social dwell
        const rand = Math.random();
        if (rand < 0.40) {
          // Interlocutor Left Eye
          nextYaw = -2.2;
          nextPitch = 1.0;
        } else if (rand < 0.80) {
          // Interlocutor Right Eye
          nextYaw = 2.2;
          nextPitch = 1.0;
        } else if (rand < 0.90) {
          // Interlocutor Mouth (Speech/lip reading)
          nextYaw = 0.0;
          nextPitch = -2.5;
        } else {
          // Natural Social Gaze Aversion (thinking/politeness)
          nextYaw = (Math.random() > 0.5 ? 8.0 : -8.0);
          nextPitch = 4.0;
        }
        break;
      }

      case 'visual_search': {
        dwellMs = 250 + Math.random() * 350;
        // Salient scene targets across wide visual field
        nextYaw = (Math.random() - 0.5) * 32.0;
        nextPitch = (Math.random() - 0.5) * 20.0;
        break;
      }

      case 'daydreaming': {
        dwellMs = 1500 + Math.random() * 2500; // Long lazy fixations
        nextYaw = (Math.random() - 0.5) * 8.0;
        nextPitch = 1.0 + (Math.random() - 0.5) * 4.0;
        break;
      }
    }

    this.nextFixationTimeMs = nowMs + dwellMs;
    this.startSaccade(nowMs, nextYaw, nextPitch);
  }

  private startSaccade(nowMs: number, targetYaw: number, targetPitch: number): void {
    this.targetGazeDeg = { yaw: targetYaw, pitch: targetPitch };
    const kinematics = this.synthesizer.synthesizeSaccade(
      this.currentGazeDeg.yaw,
      this.currentGazeDeg.pitch,
      targetYaw,
      targetPitch,
      60
    );

    this.saccadeTrajectory = kinematics.trajectory;
    this.saccadeStartTimeMs = nowMs;
    this.isExecutingSaccade = kinematics.trajectory.length > 1;
  }

  /**
   * Main synthesis update step called every animation frame (~60 FPS).
   */
  public update(nowMs: number): {
    angles: { yaw: number; pitch: number; roll: number };
    gazeVector3D: Vector3D;
    angularVelocityDegPerSec: number;
    eyelidOpenFraction: number;
    isSaccade: boolean;
    isBlink: boolean;
    isFixation: boolean;
  } {
    // 1. Update Blink state
    const blink = this.blinkModel.update(nowMs);

    // 2. Check if current fixation expired
    if (!this.isExecutingSaccade && nowMs >= this.nextFixationTimeMs) {
      this.scheduleNextCognitiveEvent(nowMs);
    }

    let instantaneousVelocity = 0;
    let baseYaw = this.currentGazeDeg.yaw;
    let basePitch = this.currentGazeDeg.pitch;

    // 3. Interpolate saccade trajectory if in motion
    if (this.isExecutingSaccade && this.saccadeTrajectory.length > 0) {
      const elapsedMs = nowMs - this.saccadeStartTimeMs;
      const totalDuration = this.saccadeTrajectory[this.saccadeTrajectory.length - 1].t;

      if (elapsedMs >= totalDuration) {
        // Saccade completed
        const finalPoint = this.saccadeTrajectory[this.saccadeTrajectory.length - 1];
        baseYaw = finalPoint.x;
        basePitch = finalPoint.y;
        this.currentGazeDeg.yaw = baseYaw;
        this.currentGazeDeg.pitch = basePitch;
        this.isExecutingSaccade = false;
      } else {
        // Interpolate along trajectory
        for (let i = 0; i < this.saccadeTrajectory.length - 1; i++) {
          const p1 = this.saccadeTrajectory[i];
          const p2 = this.saccadeTrajectory[i + 1];
          if (elapsedMs >= p1.t && elapsedMs <= p2.t) {
            const alpha = (elapsedMs - p1.t) / (p2.t - p1.t || 1);
            baseYaw = p1.x + (p2.x - p1.x) * alpha;
            basePitch = p1.y + (p2.y - p1.y) * alpha;
            instantaneousVelocity = p1.velocity + (p2.velocity - p1.velocity) * alpha;
            break;
          }
        }
      }
    }

    // 4. Inject physiological fixational ocular noise
    const noise = this.noiseModel.step(nowMs, !this.isExecutingSaccade);

    // 5. Integrate Bell's upward elevation during blinks
    const finalYaw = baseYaw + noise.dx;
    const finalPitch = basePitch + noise.dy + blink.bellsElevationDeg;

    // Convert spherical angles (deg) to 3D Cartesian unit gaze vector
    const yawRad = (finalYaw * Math.PI) / 180;
    const pitchRad = (finalPitch * Math.PI) / 180;
    const gazeVector3D: Vector3D = {
      x: Math.sin(yawRad) * Math.cos(pitchRad),
      y: -Math.sin(pitchRad),
      z: -Math.cos(yawRad) * Math.cos(pitchRad)
    };

    return {
      angles: { yaw: finalYaw, pitch: finalPitch, roll: 0 },
      gazeVector3D,
      angularVelocityDegPerSec: this.isExecutingSaccade ? instantaneousVelocity : 1.5,
      eyelidOpenFraction: blink.eyelidOpenFraction,
      isSaccade: this.isExecutingSaccade,
      isBlink: blink.isBlink,
      isFixation: !this.isExecutingSaccade && !blink.isBlink
    };
  }
}
