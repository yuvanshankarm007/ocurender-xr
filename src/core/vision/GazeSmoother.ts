/**
 * Velocity-Adaptive Double Exponential Moving Average (EMA) Gaze Filter
 * Solves the latency vs. jitter tradeoff in eye tracking:
 * - During fixations (low velocity): Heavy smoothing (alpha ~ 0.15) to kill sensor noise & jitter.
 * - During saccades (high velocity): Light smoothing (alpha ~ 0.85) to track rapid eye jumps without drag.
 */
export class GazeSmoother {
  private smoothedX = 0.5;
  private smoothedY = 0.5;
  private prevX = 0.5;
  private prevY = 0.5;
  private isInitialized = false;

  private readonly MIN_ALPHA = 0.18; // Heavy filtering for steady gaze
  private readonly MAX_ALPHA = 0.88; // Responsive pass-through for saccades
  private readonly VELOCITY_THRESHOLD = 0.08; // Normalized distance threshold

  public filter(rawX: number, rawY: number, dtSeconds: number = 0.016): {
    x: number;
    y: number;
    velocityNormalized: number;
  } {
    if (!this.isInitialized) {
      this.smoothedX = rawX;
      this.smoothedY = rawY;
      this.prevX = rawX;
      this.prevY = rawY;
      this.isInitialized = true;
      return { x: rawX, y: rawY, velocityNormalized: 0 };
    }

    // Compute velocity
    const dx = rawX - this.prevX;
    const dy = rawY - this.prevY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const velocity = distance / Math.max(0.001, dtSeconds);

    // Dynamic alpha curve
    const velocityRatio = Math.min(1.0, distance / this.VELOCITY_THRESHOLD);
    const dynamicAlpha = this.MIN_ALPHA + (this.MAX_ALPHA - this.MIN_ALPHA) * (velocityRatio * velocityRatio);

    // Apply Exponential Moving Average
    this.smoothedX = dynamicAlpha * rawX + (1 - dynamicAlpha) * this.smoothedX;
    this.smoothedY = dynamicAlpha * rawY + (1 - dynamicAlpha) * this.smoothedY;

    this.prevX = rawX;
    this.prevY = rawY;

    return {
      x: this.smoothedX,
      y: this.smoothedY,
      velocityNormalized: velocity
    };
  }

  public reset(): void {
    this.isInitialized = false;
  }
}
