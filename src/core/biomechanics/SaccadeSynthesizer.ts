import { SaccadeKinematics } from '../../types';

/**
 * Biomechanical Saccade Synthesizer
 * Implements Carpenter's Main Sequence Law and asymmetric velocity profiles
 * modeled after biological human oculomotor neurophysiology.
 */
export class SaccadeSynthesizer {
  // Main sequence constants for human saccadic eye movements
  private readonly V_MAX = 750.0;     // Asymptotic peak velocity in deg/sec
  private readonly A_0 = 14.0;         // Shape constant (degrees)
  private readonly D_0 = 22.0;         // Minimum saccade duration in ms
  private readonly D_SLOPE = 2.4;      // ms per degree of amplitude
  private readonly ASYMMETRY = 0.38;   // Peak velocity occurs at ~38% of total saccade duration

  /**
   * Calculates peak angular velocity for a given saccade amplitude (in degrees).
   * V_peak = V_max * (1 - exp(-A / A_0))
   */
  public calculatePeakVelocity(amplitudeDeg: number): number {
    const clampedAmp = Math.max(0.1, amplitudeDeg);
    return this.V_MAX * (1 - Math.exp(-clampedAmp / this.A_0));
  }

  /**
   * Calculates total saccade duration (in ms) for a given amplitude.
   * D = D_0 + d * A
   */
  public calculateDuration(amplitudeDeg: number): number {
    const clampedAmp = Math.max(0.1, amplitudeDeg);
    return this.D_0 + (this.D_SLOPE * clampedAmp);
  }

  /**
   * Generates a biologically realistic saccade trajectory between start and target points.
   * Uses asymmetric beta-distribution velocity scaling.
   */
  public synthesizeSaccade(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    sampleRateHz: number = 60
  ): SaccadeKinematics {
    const dx = targetX - startX;
    const dy = targetY - startY;
    const amplitudeDeg = Math.sqrt(dx * dx + dy * dy);

    if (amplitudeDeg < 0.05) {
      return {
        amplitudeDeg: 0,
        durationMs: 0,
        peakVelocityDegPerSec: 0,
        trajectory: [{ t: 0, x: targetX, y: targetY, velocity: 0 }]
      };
    }

    const durationMs = this.calculateDuration(amplitudeDeg);
    const peakVelocity = this.calculatePeakVelocity(amplitudeDeg);
    const numSamples = Math.max(4, Math.ceil((durationMs / 1000) * sampleRateHz));
    const trajectory: { t: number; x: number; y: number; velocity: number }[] = [];

    // Pre-calculate cumulative normalized distance along asymmetric velocity curve
    let cumulativeProgress = 0;
    const weights: number[] = [];

    for (let i = 0; i <= numSamples; i++) {
      const tau = i / numSamples; // Normalized time [0, 1]
      // Asymmetric bell curve using modified gamma/beta kernel
      let vWeight = 0;
      if (tau > 0 && tau < 1) {
        vWeight = Math.pow(tau, this.ASYMMETRY * 4) * Math.pow(1 - tau, (1 - this.ASYMMETRY) * 4);
      }
      weights.push(vWeight);
      cumulativeProgress += vWeight;
    }

    let runningDistance = 0;
    for (let i = 0; i <= numSamples; i++) {
      const tau = i / numSamples;
      const tMs = tau * durationMs;

      if (i > 0) {
        runningDistance += weights[i] / cumulativeProgress;
      }
      const progress = Math.min(1.0, Math.max(0.0, runningDistance));

      const currentX = startX + dx * progress;
      const currentY = startY + dy * progress;
      const instantaneousVelocity = weights[i] > 0 ? (weights[i] / Math.max(...weights)) * peakVelocity : 0;

      trajectory.push({
        t: tMs,
        x: currentX,
        y: currentY,
        velocity: instantaneousVelocity
      });
    }

    return {
      amplitudeDeg,
      durationMs,
      peakVelocityDegPerSec: peakVelocity,
      trajectory
    };
  }
}
