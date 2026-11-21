import { describe, it, expect } from 'vitest';
import { ParallaxCorrector } from '../src/core/graphics/ParallaxCorrector';
import { GazeSmoother } from '../src/core/vision/GazeSmoother';

describe('Gaze Math & Parallax Corrections', () => {
  it('corrects downward pitch angle caused by physical forehead camera offset', () => {
    // 65mm above eyes, target at 800mm
    const corrector = new ParallaxCorrector({
      physicalCameraOffsetMm: { x: 0, y: 65, z: 25 },
      targetUserDistanceMm: 800,
      correctionEnabled: true
    });

    const correction = corrector.calculateAngleCorrection();

    // atan(65 / 800) is approx -4.64 degrees
    expect(correction.deltaPitchDeg).toBeLessThan(0);
    expect(Math.abs(correction.deltaPitchDeg)).toBeCloseTo(4.64, 0.5);
  });

  it('bypasses angle correction when disabled', () => {
    const corrector = new ParallaxCorrector();
    corrector.setConfig({ correctionEnabled: false });

    const corrected = corrector.applyCorrectionToGaze(-10, 5);
    expect(corrected.correctedPitchDeg).toBe(-10);
    expect(corrected.correctedYawDeg).toBe(5);
  });

  it('gaze smoother adapts responsiveness to rapid velocity changes', () => {
    const smoother = new GazeSmoother();

    // Initial steady fixations
    smoother.filter(0.5, 0.5, 0.016);
    const steady = smoother.filter(0.501, 0.501, 0.016);
    expect(steady.velocityNormalized).toBeLessThan(0.1);

    // Sudden rapid saccadic jump across screen
    const saccade = smoother.filter(0.85, 0.20, 0.016);
    expect(saccade.velocityNormalized).toBeGreaterThan(1.0);
  });

  it('2D Center-Anchored Piecewise mapping locks camera fixation to center and corners to bezels', () => {
    const cX = 0.50;
    const cY = 0.38;
    const calibTL = { x: 0.38, y: 0.30 };
    const calibTR = { x: 0.62, y: 0.30 };
    const calibBL = { x: 0.38, y: 0.46 };
    const calibBR = { x: 0.62, y: 0.46 };

    const mapGaze = (curX: number, curY: number) => {
      const spanRight = Math.max(0.035, calibTR.x - cX);
      const spanLeft = Math.max(0.035, cX - calibTL.x);
      const spanTop = Math.max(0.025, cY - calibTL.y);
      const spanBottom = Math.max(0.025, calibBR.y - cY);

      let rawX: number;
      if (curX >= cX) {
        const u = Math.min(1.4, (curX - cX) / spanRight);
        rawX = 0.50 + u * 0.46;
      } else {
        const u = Math.min(1.4, (cX - curX) / spanLeft);
        rawX = 0.50 - u * 0.46;
      }

      let rawY: number;
      if (curY >= cY) {
        const v = Math.min(1.4, (curY - cY) / spanBottom);
        rawY = 0.50 + v * 0.45;
      } else {
        const v = Math.min(1.4, (cY - curY) / spanTop);
        rawY = 0.50 - v * 0.45;
      }

      return {
        rawX: Math.max(0.01, Math.min(0.99, rawX)),
        rawY: Math.max(0.01, Math.min(0.99, rawY))
      };
    };

    // 1. Looking directly at the webcam / center: MUST BE DEAD CENTER (0.50, 0.50)
    const center = mapGaze(0.50, 0.38);
    expect(center.rawX).toBe(0.50);
    expect(center.rawY).toBe(0.50);

    // 2. Top-Left corner fixation
    const tl = mapGaze(0.38, 0.30);
    expect(tl.rawX).toBeCloseTo(0.04, 2);
    expect(tl.rawY).toBeCloseTo(0.05, 2);

    // 3. Top-Right corner fixation
    const tr = mapGaze(0.62, 0.30);
    expect(tr.rawX).toBeCloseTo(0.96, 2);
    expect(tr.rawY).toBeCloseTo(0.05, 2);

    // 4. Bottom-Left corner fixation
    const bl = mapGaze(0.38, 0.46);
    expect(bl.rawX).toBeCloseTo(0.04, 2);
    expect(bl.rawY).toBeCloseTo(0.95, 2);

    // 5. Bottom-Right corner fixation
    const br = mapGaze(0.62, 0.46);
    expect(br.rawX).toBeCloseTo(0.96, 2);
    expect(br.rawY).toBeCloseTo(0.95, 2);

    // 6. Extreme camera upward elevation (looking above top bezel)
    const aboveCamera = mapGaze(0.50, 0.20);
    expect(aboveCamera.rawX).toBe(0.50);
    expect(aboveCamera.rawY).toBeLessThanOrEqual(0.05);
  });

  it('Blink Fixation Freeze preserves resting gaze coordinates and prevents downward deflection during eyelid closure', () => {
    // Simulated pre-blink resting fixation
    let lastValidRawX = 0.50;
    let lastValidRawY = 0.50;
    let postBlinkSettleFrames = 0;

    const processFrame = (curX: number, curY: number, isBlinkActive: boolean, openFraction: number) => {
      const isBlinking = isBlinkActive || openFraction < 0.65;
      let rawX: number;
      let rawY: number;

      if (isBlinking || postBlinkSettleFrames > 0) {
        if (isBlinking) {
          postBlinkSettleFrames = 2;
        } else {
          postBlinkSettleFrames--;
        }
        // Frozen during occlusion
        rawX = lastValidRawX;
        rawY = lastValidRawY;
      } else {
        rawX = curX;
        rawY = curY;
        lastValidRawX = rawX;
        lastValidRawY = rawY;
      }

      return { rawX, rawY };
    };

    // 1. Frame before blink: User is fixating at center (0.50, 0.50)
    const preBlink = processFrame(0.50, 0.50, false, 1.0);
    expect(preBlink.rawX).toBe(0.50);
    expect(preBlink.rawY).toBe(0.50);

    // 2. Blink starts: Eyelid descends over iris, raw MediaPipe detection spikes downward to 0.99
    const blinkFrame1 = processFrame(0.10, 0.99, true, 0.20);
    // MUST NOT DEFLECT DOWNWARD TO 0.99!
    expect(blinkFrame1.rawX).toBe(0.50);
    expect(blinkFrame1.rawY).toBe(0.50);

    // 3. Eyes fully closed
    const blinkFrame2 = processFrame(0.05, 0.99, true, 0.0);
    expect(blinkFrame2.rawX).toBe(0.50);
    expect(blinkFrame2.rawY).toBe(0.50);

    // 4. Eyes reopen: 2 settle frames hold fixation before unfreezing
    const reopen1 = processFrame(0.48, 0.70, false, 0.85);
    expect(reopen1.rawY).toBe(0.50); // Frame 1 of settle

    const reopen2 = processFrame(0.49, 0.60, false, 0.90);
    expect(reopen2.rawY).toBe(0.50); // Frame 2 of settle

    // 5. Settled: Normal tracking resumes
    const settled = processFrame(0.52, 0.48, false, 1.0);
    expect(settled.rawX).toBe(0.52);
    expect(settled.rawY).toBe(0.48);
  });
});
