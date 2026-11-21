import { describe, it, expect } from 'vitest';
import { EyeAspectRatioBlinkEngine } from '../src/core/vision/EyeAspectRatioBlinkEngine';
import { NormalizedLandmarkList } from '@mediapipe/face_mesh';

describe('Eye Aspect Ratio (EAR) & Blink Engine', () => {
  const engine = new EyeAspectRatioBlinkEngine();

  // Helper to generate mock eye landmark list with accurate indices
  const createMockLandmarks = (verticalOpening: number): NormalizedLandmarkList => {
    const list: any[] = new Array(478).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }));

    // Left Eye corners
    list[33] = { x: 0.30, y: 0.40, z: 0 };  // Outer corner
    list[133] = { x: 0.40, y: 0.40, z: 0 }; // Inner corner (width = 0.10)

    // Left Eye vertical pairs (center, inner, outer)
    list[159] = { x: 0.35, y: 0.40 - verticalOpening / 2, z: 0 }; // Top Center
    list[145] = { x: 0.35, y: 0.40 + verticalOpening / 2, z: 0 }; // Bottom Center
    list[160] = { x: 0.33, y: 0.40 - verticalOpening / 2, z: 0 }; // Top Inner
    list[144] = { x: 0.33, y: 0.40 + verticalOpening / 2, z: 0 }; // Bottom Inner
    list[158] = { x: 0.37, y: 0.40 - verticalOpening / 2, z: 0 }; // Top Outer
    list[153] = { x: 0.37, y: 0.40 + verticalOpening / 2, z: 0 }; // Bottom Outer

    // Right Eye corners
    list[362] = { x: 0.60, y: 0.40, z: 0 }; // Inner corner
    list[263] = { x: 0.70, y: 0.40, z: 0 }; // Outer corner (width = 0.10)

    // Right Eye vertical pairs
    list[386] = { x: 0.65, y: 0.40 - verticalOpening / 2, z: 0 }; // Top Center
    list[374] = { x: 0.65, y: 0.40 + verticalOpening / 2, z: 0 }; // Bottom Center
    list[385] = { x: 0.63, y: 0.40 - verticalOpening / 2, z: 0 }; // Top Inner
    list[380] = { x: 0.63, y: 0.40 + verticalOpening / 2, z: 0 }; // Bottom Inner
    list[387] = { x: 0.67, y: 0.40 - verticalOpening / 2, z: 0 }; // Top Outer
    list[373] = { x: 0.67, y: 0.40 + verticalOpening / 2, z: 0 }; // Bottom Outer

    return list as NormalizedLandmarkList;
  };

  it('calculates resting EAR ~0.30 for open eyes', () => {
    const openMesh = createMockLandmarks(0.030); // 0.030 / 0.10 = 0.30 EAR
    const metrics = engine.update(openMesh, 100);

    expect(metrics.currentEar).toBeCloseTo(0.30, 2);
    expect(metrics.blinkState).toBe('OPEN');
    expect(metrics.isBlinkActive).toBe(false);
  });

  it('detects eyelid closure when EAR drops below dynamic threshold', () => {
    // Seed baseline with open frames
    for (let i = 0; i < 20; i++) {
      engine.update(createMockLandmarks(0.032), 200 + i * 20);
    }

    // Rapid closure (EAR drops to 0.10)
    const closedMesh = createMockLandmarks(0.010);
    const closingMetrics = engine.update(closedMesh, 700);
    expect(closingMetrics.isBlinkActive).toBe(true);

    const peakClosedMetrics = engine.update(closedMesh, 750);
    expect(peakClosedMetrics.isBlinkActive).toBe(true);
    expect(peakClosedMetrics.bellsElevationDeg).toBeGreaterThan(1.0);
  });

  it('records complete blink cycle and duration upon reopening', () => {
    const startBlinks = engine.update(createMockLandmarks(0.032), 1000).totalBlinksDetected;

    // Start closure
    engine.update(createMockLandmarks(0.010), 1100);
    engine.update(createMockLandmarks(0.008), 1150);

    // Reopen
    engine.update(createMockLandmarks(0.024), 1220);
    const reopened = engine.update(createMockLandmarks(0.032), 1250);

    expect(reopened.totalBlinksDetected).toBe(startBlinks + 1);
    expect(reopened.blinkState).toBe('OPEN');
    expect(reopened.isBlinkActive).toBe(false);
    expect(reopened.lastBlinkDurationMs).toBeGreaterThanOrEqual(50);
  });

  it('rapidly drops openFraction to prevent downward iris deflection during partial lid descent', () => {
    // Rested open eye
    engine.update(createMockLandmarks(0.030), 2000);

    // Initial descent (30% narrowing of palpebral aperture)
    const descentMetrics = engine.update(createMockLandmarks(0.021), 2030);

    // openFraction must drop below 0.78 immediately to trigger pre-blink fixation freeze
    expect(descentMetrics.openFraction).toBeLessThan(0.78);
  });

  it('recovers baseline EAR downwards and clears blink lockout when switching to narrower eyes', () => {
    const multiPersonEngine = new EyeAspectRatioBlinkEngine();

    // 1. Person B has wide resting eyes (EAR ~0.38)
    for (let i = 0; i < 30; i++) {
      multiPersonEngine.update(createMockLandmarks(0.038), 3000 + i * 30);
    }
    expect(multiPersonEngine.getBaselineEar()).toBeGreaterThan(0.35);

    // 2. Person B leaves, Person A returns alone with narrower resting eyes (EAR ~0.24)
    // Over the next 15-20 frames (> 500ms), baseline must adapt downwards and clear isBlinkActive
    let lastMetrics: any;
    for (let i = 0; i < 25; i++) {
      lastMetrics = multiPersonEngine.update(createMockLandmarks(0.024), 4000 + i * 33);
    }

    expect(lastMetrics.blinkState).toBe('OPEN');
    expect(lastMetrics.isBlinkActive).toBe(false);
    expect(multiPersonEngine.getBaselineEar()).toBeLessThan(0.30);
  });
});
