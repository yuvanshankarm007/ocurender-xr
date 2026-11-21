/**
 * One-Euro Filter (Casiez et al., CHI 2012)
 * State-of-the-art 1st-order low-pass filter with adaptive cutoff frequency.
 *
 * Designed specifically for human gaze tracking:
 * - At low eye velocities (fixations): Cutoff drops to minCutoff (e.g. 1.0 Hz) to completely eliminate jitter.
 * - At high eye velocities (saccades): Cutoff scales linearly with speed (beta * speed) to eliminate latency and lag.
 */

class LowPassFilter {
  private y = 0;
  private s = 0;
  private initialized = false;

  public filter(val: number, alpha: number): number {
    if (!this.initialized) {
      this.s = val;
      this.y = val;
      this.initialized = true;
      return val;
    }
    this.y = alpha * val + (1 - alpha) * this.s;
    this.s = this.y;
    return this.y;
  }

  public last(): number {
    return this.y;
  }

  public reset(): void {
    this.initialized = false;
  }
}

export interface OneEuroConfig {
  minCutoff: number; // Minimum cutoff frequency in Hz (default: 1.0)
  beta: number;      // Speed coefficient (default: 0.007)
  dCutoff: number;   // Cutoff frequency for derivative in Hz (default: 1.0)
}

export class OneEuroGazeFilter {
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private yFilter = new LowPassFilter();
  private dyFilter = new LowPassFilter();

  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  private prevRawX = 0.5;
  private prevRawY = 0.5;
  private isInitialized = false;

  constructor(config: Partial<OneEuroConfig> = {}) {
    this.minCutoff = config.minCutoff ?? 1.2;
    this.beta = config.beta ?? 0.008;
    this.dCutoff = config.dCutoff ?? 1.0;
  }

  private computeAlpha(rate: number, cutoff: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  public filter(
    rawX: number,
    rawY: number,
    dtSeconds: number = 0.016
  ): { x: number; y: number; velocityNormalized: number } {
    const rate = 1.0 / Math.max(0.001, dtSeconds);

    if (!this.isInitialized) {
      this.prevRawX = rawX;
      this.prevRawY = rawY;
      this.isInitialized = true;
      this.xFilter.filter(rawX, 1.0);
      this.yFilter.filter(rawY, 1.0);
      return { x: rawX, y: rawY, velocityNormalized: 0 };
    }

    // Estimate derivative (velocity)
    const dx = (rawX - this.prevRawX) * rate;
    const dy = (rawY - this.prevRawY) * rate;
    this.prevRawX = rawX;
    this.prevRawY = rawY;

    // Filter the derivative
    const dAlpha = this.computeAlpha(rate, this.dCutoff);
    const edx = this.dxFilter.filter(dx, dAlpha);
    const edy = this.dyFilter.filter(dy, dAlpha);

    const speed = Math.sqrt(edx * edx + edy * edy);

    // Compute dynamic cutoff frequencies
    const cutoffX = this.minCutoff + this.beta * Math.abs(edx);
    const cutoffY = this.minCutoff + this.beta * Math.abs(edy);

    // Filter position coordinates
    const alphaX = this.computeAlpha(rate, cutoffX);
    const alphaY = this.computeAlpha(rate, cutoffY);

    const filteredX = this.xFilter.filter(rawX, alphaX);
    const filteredY = this.yFilter.filter(rawY, alphaY);

    return {
      x: filteredX,
      y: filteredY,
      velocityNormalized: speed
    };
  }

  public reset(): void {
    this.isInitialized = false;
    this.xFilter.reset();
    this.dxFilter.reset();
    this.yFilter.reset();
    this.dyFilter.reset();
  }

  public forceState(x: number, y: number): void {
    this.prevRawX = x;
    this.prevRawY = y;
    this.isInitialized = true;
    this.xFilter.reset();
    this.xFilter.filter(x, 1.0);
    this.yFilter.reset();
    this.yFilter.filter(y, 1.0);
    this.dxFilter.reset();
    this.dyFilter.reset();
  }
}
