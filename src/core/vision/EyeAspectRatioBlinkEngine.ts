import { NormalizedLandmarkList } from '@mediapipe/face_mesh';
import { BlinkMetrics } from '../../agent-core/types';

// MediaPipe 478 Eye Landmark Indices
// Left Eye
export const MP_LEFT_EYE_CORNER_OUTER = 33;
export const MP_LEFT_EYE_CORNER_INNER = 133;
export const MP_LEFT_EYE_TOP_CENTER = 159;
export const MP_LEFT_EYE_BOTTOM_CENTER = 145;
export const MP_LEFT_EYE_TOP_INNER = 160;
export const MP_LEFT_EYE_BOTTOM_INNER = 144;
export const MP_LEFT_EYE_TOP_OUTER = 158;
export const MP_LEFT_EYE_BOTTOM_OUTER = 153;

// Right Eye
export const MP_RIGHT_EYE_CORNER_INNER = 362;
export const MP_RIGHT_EYE_CORNER_OUTER = 263;
export const MP_RIGHT_EYE_TOP_CENTER = 386;
export const MP_RIGHT_EYE_BOTTOM_CENTER = 374;
export const MP_RIGHT_EYE_TOP_INNER = 385;
export const MP_RIGHT_EYE_BOTTOM_INNER = 380;
export const MP_RIGHT_EYE_TOP_OUTER = 387;
export const MP_RIGHT_EYE_BOTTOM_OUTER = 373;

export class EyeAspectRatioBlinkEngine {
  private baselineEar = 0.31;
  private earHistory: number[] = [];
  private isBlinkActive = false;
  private blinkStartTimeMs = 0;
  private lastBlinkDurationMs = 160;
  private totalBlinks = 0;
  private recentBlinkTimestamps: number[] = [];
  private consecutiveClosedFrames = 0;
  private reopeningFramesRemaining = 0;

  // Continuous smoothed aperture: 1.0 = wide open, 0.0 = fully closed
  private smoothedOpenFraction = 1.0;

  // Precision 2D Euclidean distance on image plane (Soukupová & Čech EAR standard)
  // Essential: Omitting uncalibrated depth z prevents false minimum offsets that block blink detection
  private dist2D(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Computes 3-sample vertical EAR for maximal sensitivity to fast blinks
   */
  public computeEyeEar(
    landmarks: NormalizedLandmarkList,
    pOuter: number,
    pInner: number,
    pTopCenter: number,
    pBottomCenter: number,
    pTopInner: number,
    pBottomInner: number,
    pTopOuter: number,
    pBottomOuter: number
  ): number {
    const ptOuter = landmarks[pOuter];
    const ptInner = landmarks[pInner];
    const ptTC = landmarks[pTopCenter];
    const ptBC = landmarks[pBottomCenter];
    const ptTI = landmarks[pTopInner];
    const ptBI = landmarks[pBottomInner];
    const ptTO = landmarks[pTopOuter];
    const ptBO = landmarks[pBottomOuter];

    if (!ptOuter || !ptInner || !ptTC || !ptBC) return 0.30;

    const horizontal = this.dist2D(ptOuter, ptInner);
    if (horizontal < 0.005) return 0.30;

    const vertCenter = this.dist2D(ptTC, ptBC);
    const vertInner = ptTI && ptBI ? this.dist2D(ptTI, ptBI) : vertCenter;
    const vertOuter = ptTO && ptBO ? this.dist2D(ptTO, ptBO) : vertCenter;

    // Weighted average vertical span (center weighted x2)
    const avgVertical = (vertCenter * 2.0 + vertInner + vertOuter) / 4.0;
    return avgVertical / horizontal;
  }

  public update(landmarks: NormalizedLandmarkList, nowMs: number = performance.now()): BlinkMetrics {
    const leftEar = this.computeEyeEar(
      landmarks,
      MP_LEFT_EYE_CORNER_OUTER,
      MP_LEFT_EYE_CORNER_INNER,
      MP_LEFT_EYE_TOP_CENTER,
      MP_LEFT_EYE_BOTTOM_CENTER,
      MP_LEFT_EYE_TOP_INNER,
      MP_LEFT_EYE_BOTTOM_INNER,
      MP_LEFT_EYE_TOP_OUTER,
      MP_LEFT_EYE_BOTTOM_OUTER
    );

    const rightEar = this.computeEyeEar(
      landmarks,
      MP_RIGHT_EYE_CORNER_OUTER,
      MP_RIGHT_EYE_CORNER_INNER,
      MP_RIGHT_EYE_TOP_CENTER,
      MP_RIGHT_EYE_BOTTOM_CENTER,
      MP_RIGHT_EYE_TOP_INNER,
      MP_RIGHT_EYE_BOTTOM_INNER,
      MP_RIGHT_EYE_TOP_OUTER,
      MP_RIGHT_EYE_BOTTOM_OUTER
    );

    const avgEar = (leftEar + rightEar) * 0.5;

    // Dynamic resting baseline tracker (adapts to user's eye aperture when open)
    // Supports natural eye apertures from 0.18 to 0.50
    if (!this.isBlinkActive && avgEar > 0.18 && avgEar < 0.50) {
      this.earHistory.push(avgEar);
      if (this.earHistory.length > 90) this.earHistory.shift();

      const sum = this.earHistory.reduce((a, b) => a + b, 0);
      this.baselineEar = sum / this.earHistory.length;
    }

    // Dynamic threshold: 70% of baseline (adapts to small & wide eyes alike)
    // - Resting open eye (e.g. 0.28 - 0.45 EAR)
    // - Real blink (eyelids touch or begin rapid descent): EAR drops below 70% of baseline, immediately triggering blink!
    const threshold = Math.max(0.18, this.baselineEar * 0.70);

    // Continuous Eyelid Opening Fraction [0.0 = fully closed, 1.0 = fully open]
    const closedEar = Math.max(0.09, this.baselineEar * 0.40);
    const openEar = Math.max(0.20, this.baselineEar * 0.90);
    const rawFraction = (avgEar - closedEar) / Math.max(0.01, openEar - closedEar);
    const clampedFraction = Math.max(0.0, Math.min(1.0, rawFraction));

    // Fast closure lerp rate so eyelids close in 1 frame
    const isClosing = clampedFraction < this.smoothedOpenFraction;
    const lerpSpeed = isClosing ? 0.95 : 0.65;
    this.smoothedOpenFraction += (clampedFraction - this.smoothedOpenFraction) * lerpSpeed;

    // Fast-acting Blink State Detector
    let stateLabel: 'OPEN' | 'CLOSING' | 'CLOSED' | 'REOPENING' = 'OPEN';

    if (avgEar < threshold) {
      this.consecutiveClosedFrames++;
      this.reopeningFramesRemaining = 0;
      if (!this.isBlinkActive) {
        this.isBlinkActive = true;
        this.blinkStartTimeMs = nowMs;
      }
      stateLabel = this.consecutiveClosedFrames > 1 ? 'CLOSED' : 'CLOSING';
    } else {
      // Eye is above threshold
      if (this.isBlinkActive) {
        const duration = nowMs - this.blinkStartTimeMs;
        // Valid blink duration: 25ms to 500ms (captures reflexive blinks; sustained downward gaze is not a blink)
        if (duration >= 25 && duration <= 500) {
          this.totalBlinks++;
          this.lastBlinkDurationMs = Math.round(duration);
          this.recentBlinkTimestamps.push(nowMs);
        }
        this.isBlinkActive = false;
        this.consecutiveClosedFrames = 0;
        this.reopeningFramesRemaining = 2; // Extra settle frame only if eye is not yet fully wide open
        stateLabel = avgEar >= this.baselineEar * 0.85 ? 'OPEN' : 'REOPENING';
      } else if (avgEar >= this.baselineEar * 0.85) {
        this.reopeningFramesRemaining = 0;
        stateLabel = 'OPEN';
      } else if (this.reopeningFramesRemaining > 0) {
        this.reopeningFramesRemaining--;
        stateLabel = 'REOPENING';
      } else {
        stateLabel = 'OPEN';
      }
    }

    // Eyelid closure timeout safeguard: sustained closure or new user with narrower eyes (> 500ms)
    if (this.isBlinkActive && (nowMs - this.blinkStartTimeMs > 500)) {
      this.isBlinkActive = false;
      this.consecutiveClosedFrames = 0;
      this.reopeningFramesRemaining = 0;
      stateLabel = 'OPEN';
      if (avgEar >= 0.18 && avgEar <= 0.50) {
        this.baselineEar = avgEar;
        this.earHistory = [avgEar];
      }
      this.smoothedOpenFraction = 1.0;
    }

    // Upward elevation during closure (Bell's phenomenon)
    const closureAmount = 1.0 - this.smoothedOpenFraction;
    const bellsElevation = closureAmount * 4.0; // Up to 4 degrees

    // Rolling BPM
    const oneMinuteAgo = nowMs - 60000;
    this.recentBlinkTimestamps = this.recentBlinkTimestamps.filter(t => t > oneMinuteAgo);
    const bpm = Math.max(6, this.recentBlinkTimestamps.length);

    return {
      currentEar: parseFloat(avgEar.toFixed(3)),
      baselineEar: parseFloat(this.baselineEar.toFixed(3)),
      earThreshold: parseFloat(threshold.toFixed(3)),
      blinkState: stateLabel,
      totalBlinksDetected: this.totalBlinks,
      lastBlinkDurationMs: this.lastBlinkDurationMs,
      blinksPerMinute: bpm,
      isBlinkActive: this.isBlinkActive || stateLabel === 'CLOSED' || stateLabel === 'CLOSING',
      bellsElevationDeg: parseFloat(bellsElevation.toFixed(2)),
      openFraction: parseFloat(this.smoothedOpenFraction.toFixed(3)),
    };
  }

  public getOpenFraction(): number {
    return this.smoothedOpenFraction;
  }

  public getBaselineEar(): number {
    return this.baselineEar;
  }

  public resetBaseline(initialEar?: number): void {
    const ear = (initialEar && initialEar > 0.15 && initialEar < 0.50) ? initialEar : 0.28;
    this.baselineEar = ear;
    this.earHistory = [ear];
    this.isBlinkActive = false;
    this.consecutiveClosedFrames = 0;
    this.smoothedOpenFraction = 1.0;
  }

  public manualBlink(): BlinkMetrics {
    this.totalBlinks++;
    this.recentBlinkTimestamps.push(performance.now());
    this.isBlinkActive = true;
    this.smoothedOpenFraction = 0.0;
    setTimeout(() => {
      this.isBlinkActive = false;
      this.smoothedOpenFraction = 1.0;
    }, 180);

    return {
      currentEar: 0.05,
      baselineEar: this.baselineEar,
      earThreshold: parseFloat((this.baselineEar * 0.65).toFixed(3)),
      blinkState: 'CLOSED',
      totalBlinksDetected: this.totalBlinks,
      lastBlinkDurationMs: 180,
      blinksPerMinute: Math.max(12, this.recentBlinkTimestamps.length),
      isBlinkActive: true,
      bellsElevationDeg: 4.0,
      openFraction: 0.0,
    };
  }
}
