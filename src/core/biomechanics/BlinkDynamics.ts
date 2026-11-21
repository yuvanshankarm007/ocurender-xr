/**
 * Biomechanical Blink Dynamics
 * Implements spontaneous human eyelid kinematics and Bell's Phenomenon.
 */
export class BlinkDynamics {
  private isBlinking = false;
  private blinkStartTimeMs = 0;
  private readonly DOWN_PHASE_MS = 85.0; // Eyelid closing duration
  private readonly UP_PHASE_MS = 165.0;   // Eyelid reopening duration
  private readonly TOTAL_BLINK_MS = 250.0;
  private nextSpontaneousBlinkTimeMs = 0;

  constructor() {
    this.scheduleNextBlink(0);
  }

  private scheduleNextBlink(currentTimeMs: number): void {
    // Human average: 15 blinks/min (~1 blink every 4 seconds)
    // Poisson interval with minimum refractory period of 1.5 seconds
    const intervalMs = 1500 + Math.random() * 4500;
    this.nextSpontaneousBlinkTimeMs = currentTimeMs + intervalMs;
  }

  public triggerManualBlink(currentTimeMs: number): void {
    if (!this.isBlinking) {
      this.isBlinking = true;
      this.blinkStartTimeMs = currentTimeMs;
    }
  }

  /**
   * Updates blink state and returns:
   * - eyelidOpenFraction: 1.0 (fully open) to 0.0 (fully shut)
   * - bellsElevationDeg: upward vertical elevation of eyeball (Bell's phenomenon)
   * - isBlink: boolean flag
   */
  public update(currentTimeMs: number): {
    eyelidOpenFraction: number;
    bellsElevationDeg: number;
    isBlink: boolean;
  } {
    if (!this.isBlinking && currentTimeMs >= this.nextSpontaneousBlinkTimeMs) {
      this.isBlinking = true;
      this.blinkStartTimeMs = currentTimeMs;
    }

    if (!this.isBlinking) {
      return {
        eyelidOpenFraction: 1.0,
        bellsElevationDeg: 0.0,
        isBlink: false
      };
    }

    const elapsedMs = currentTimeMs - this.blinkStartTimeMs;

    if (elapsedMs >= this.TOTAL_BLINK_MS) {
      // Blink finished
      this.isBlinking = false;
      this.scheduleNextBlink(currentTimeMs);
      return {
        eyelidOpenFraction: 1.0,
        bellsElevationDeg: 0.0,
        isBlink: false
      };
    }

    let eyelidOpen = 1.0;
    let bellsElevation = 0.0;

    if (elapsedMs <= this.DOWN_PHASE_MS) {
      // Rapid closing phase (cubic deceleration)
      const progress = elapsedMs / this.DOWN_PHASE_MS;
      eyelidOpen = 1.0 - Math.sin((progress * Math.PI) / 2);
      bellsElevation = Math.sin(progress * Math.PI) * 3.5; // Up to 3.5 deg upward
    } else {
      // Reopening phase (slower sigmoid curve)
      const upElapsed = elapsedMs - this.DOWN_PHASE_MS;
      const progress = upElapsed / this.UP_PHASE_MS;
      eyelidOpen = Math.sin((progress * Math.PI) / 2);
      bellsElevation = (1.0 - progress) * 2.5;
    }

    return {
      eyelidOpenFraction: Math.max(0.0, Math.min(1.0, eyelidOpen)),
      bellsElevationDeg: Math.max(0.0, bellsElevation),
      isBlink: true
    };
  }
}
