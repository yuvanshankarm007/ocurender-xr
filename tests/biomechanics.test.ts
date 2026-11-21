import { describe, it, expect } from 'vitest';
import { SaccadeSynthesizer } from '../src/core/biomechanics/SaccadeSynthesizer';
import { BlinkDynamics } from '../src/core/biomechanics/BlinkDynamics';
import { OcularNoiseModel } from '../src/core/biomechanics/OcularNoiseModel';

describe('Biomechanical Ocular Kinematics', () => {
  const synthesizer = new SaccadeSynthesizer();

  it('calculates peak velocity according to Carpenter Main Sequence Law', () => {
    const vSmall = synthesizer.calculatePeakVelocity(2.0);  // Small 2 deg saccade
    const vMedium = synthesizer.calculatePeakVelocity(10.0); // Medium 10 deg saccade
    const vLarge = synthesizer.calculatePeakVelocity(30.0);  // Large 30 deg saccade

    expect(vSmall).toBeGreaterThan(50);
    expect(vMedium).toBeGreaterThan(vSmall);
    expect(vLarge).toBeGreaterThan(vMedium);
    expect(vLarge).toBeLessThanOrEqual(750); // Bound by V_MAX
  });

  it('calculates monotonic duration scaling with amplitude', () => {
    const d5 = synthesizer.calculateDuration(5.0);
    const d20 = synthesizer.calculateDuration(20.0);

    expect(d5).toBeGreaterThan(20); // D_0 minimum
    expect(d20).toBeGreaterThan(d5);
  });

  it('synthesizes valid trajectory with non-zero samples and correct start/end coordinates', () => {
    const startX = 0;
    const startY = 0;
    const targetX = 12;
    const targetY = -8;

    const kinematics = synthesizer.synthesizeSaccade(startX, startY, targetX, targetY, 60);

    expect(kinematics.amplitudeDeg).toBeCloseTo(Math.sqrt(12 * 12 + 8 * 8), 1);
    expect(kinematics.trajectory.length).toBeGreaterThan(2);

    const firstPt = kinematics.trajectory[0];
    const lastPt = kinematics.trajectory[kinematics.trajectory.length - 1];

    expect(firstPt.x).toBeCloseTo(startX, 1);
    expect(firstPt.y).toBeCloseTo(startY, 1);
    expect(lastPt.x).toBeCloseTo(targetX, 1);
    expect(lastPt.y).toBeCloseTo(targetY, 1);
  });

  it('models spontaneous blinks with Bell phenomenon upward elevation', () => {
    const blink = new BlinkDynamics();
    blink.triggerManualBlink(100);

    // Mid-blink (~50ms after start)
    const midBlink = blink.update(150);
    expect(midBlink.isBlink).toBe(true);
    expect(midBlink.eyelidOpenFraction).toBeLessThan(1.0);
    expect(midBlink.bellsElevationDeg).toBeGreaterThan(0.5); // Bell's phenomenon eye elevation

    // Post-blink (~400ms after start)
    const postBlink = blink.update(500);
    expect(postBlink.isBlink).toBe(false);
    expect(postBlink.eyelidOpenFraction).toBe(1.0);
    expect(postBlink.bellsElevationDeg).toBe(0.0);
  });

  it('generates physiological fixational noise bounded within ocular tremor range', () => {
    const noiseModel = new OcularNoiseModel();
    const sample = noiseModel.step(1000, true);

    expect(Math.abs(sample.dx)).toBeLessThan(1.0); // Within 1 deg
    expect(Math.abs(sample.dy)).toBeLessThan(1.0);
  });
});
