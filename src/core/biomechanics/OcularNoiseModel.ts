/**
 * Ocular Noise & Micro-movement Model
 * Simulates the three biological components of fixational eye movements:
 * 1. Ocular Tremor (Physiological Nystagmus): high frequency (40-80 Hz), tiny amplitude (~0.02 deg)
 * 2. Slow Drift: Brownian / Ornstein-Uhlenbeck drift (< 0.1 deg)
 * 3. Micro-saccades: Involuntary rapid flickers (0.1 - 0.8 deg) preventing retinal photoreceptor adaptation
 */
export class OcularNoiseModel {
  private driftX = 0;
  private driftY = 0;
  private lastMicrosaccadeTimeMs = 0;
  private currentMicroSaccadeOffset = { x: 0, y: 0 };

  // Ornstein-Uhlenbeck mean-reversion parameters
  private readonly THETA = 0.8;  // Pull back to fixation center
  private readonly SIGMA = 0.04; // Volatility
  private readonly DT = 0.016;   // 16ms delta time (~60 FPS)

  /**
   * Generates continuous biological fixational noise offset in degrees.
   */
  public step(nowMs: number, isFixating: boolean): { dx: number; dy: number; isMicroSaccade: boolean } {
    if (!isFixating) {
      // During active macro-saccades, fixational noise is suppressed
      this.driftX *= 0.5;
      this.driftY *= 0.5;
      this.currentMicroSaccadeOffset = { x: 0, y: 0 };
      return { dx: 0, dy: 0, isMicroSaccade: false };
    }

    // 1. High frequency physiological tremor (wave oscillation + Gaussian noise)
    const tremorFreq = 50.0; // 50 Hz
    const tremorAmp = 0.015;  // 0.015 degrees
    const tremorX = Math.sin(nowMs * 0.001 * tremorFreq * Math.PI * 2) * tremorAmp + (Math.random() - 0.5) * 0.01;
    const tremorY = Math.cos(nowMs * 0.001 * tremorFreq * Math.PI * 2) * tremorAmp + (Math.random() - 0.5) * 0.01;

    // 2. Slow Drift (Ornstein-Uhlenbeck random walk)
    const brownianX = (Math.random() - 0.5) * Math.sqrt(this.DT) * this.SIGMA;
    const brownianY = (Math.random() - 0.5) * Math.sqrt(this.DT) * this.SIGMA;
    this.driftX += -this.THETA * this.driftX * this.DT + brownianX;
    this.driftY += -this.THETA * this.driftY * this.DT + brownianY;

    // 3. Spontaneous Micro-saccades (~1 to 2 times per second during prolonged fixation)
    let triggeredMicroSaccade = false;
    const timeSinceLastMicro = nowMs - this.lastMicrosaccadeTimeMs;
    if (timeSinceLastMicro > 600 && Math.random() < 0.04) {
      this.lastMicrosaccadeTimeMs = nowMs;
      triggeredMicroSaccade = true;
      const angle = Math.random() * Math.PI * 2;
      const microAmp = 0.08 + Math.random() * 0.18; // 0.08 to 0.26 degrees
      this.currentMicroSaccadeOffset = {
        x: Math.cos(angle) * microAmp,
        y: Math.sin(angle) * microAmp
      };
    } else {
      // Decay micro-saccade offset smoothly
      this.currentMicroSaccadeOffset.x *= 0.82;
      this.currentMicroSaccadeOffset.y *= 0.82;
    }

    const totalDx = tremorX + this.driftX + this.currentMicroSaccadeOffset.x;
    const totalDy = tremorY + this.driftY + this.currentMicroSaccadeOffset.y;

    return {
      dx: totalDx,
      dy: totalDy,
      isMicroSaccade: triggeredMicroSaccade
    };
  }

  public reset(): void {
    this.driftX = 0;
    this.driftY = 0;
    this.currentMicroSaccadeOffset = { x: 0, y: 0 };
  }
}
