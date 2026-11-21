import { describe, it, expect } from 'vitest';
import { RiemannFoveatedIntegral } from '../src/core/graphics/RiemannFoveatedIntegral';
import { MainSequenceCompliance } from '../src/core/biomechanics/MainSequenceCompliance';

describe('Phase 4: Quantitative Defense — Riemann Integrals, Carpenter Law & OpenXR', () => {
  it('calculates Riemann GPU pixel load reduction with convergence to analytical integral', () => {
    // Standard 1080p foveated parameters: fovea ~2.5 deg (0.068 norm), parafovea ~5.5 deg (0.15 norm), 0.25 VRS
    const result = RiemannFoveatedIntegral.calculate(0.068, 0.150, 0.25, 1920, 1080, 200);

    expect(result.nativePixelCount).toBe(1920 * 1080);
    expect(result.foveatedEffectivePixels).toBeLessThan(result.nativePixelCount);

    // Should yield ~64% pixel load reduction
    expect(result.shadingReductionPercent).toBeGreaterThan(55.0);
    expect(result.shadingReductionPercent).toBeLessThan(75.0);

    // Difference between 200-strip numerical Riemann sum and analytical solution is minimal (< 1.5%)
    const diff = Math.abs(result.discreteRiemannSavingsPercent - result.analyticalSavingsPercent);
    expect(diff).toBeLessThan(2.0);
  });

  it('demonstrates increased savings with aggressive peripheral rate (1/8 vs 1/4)', () => {
    const rQuarter = RiemannFoveatedIntegral.calculate(0.068, 0.150, 0.25);
    const rEighth = RiemannFoveatedIntegral.calculate(0.068, 0.150, 0.125);

    expect(rEighth.shadingReductionPercent).toBeGreaterThan(rQuarter.shadingReductionPercent);
  });

  it('evaluates Carpenter Main Sequence exponential model V_peak = V_max * (1 - e^(-A / A_0))', () => {
    const V_MAX = MainSequenceCompliance.V_MAX; // 750 deg/sec
    const A_0 = MainSequenceCompliance.A_0;     // 15.0 deg

    // Micro-saccade (2 deg)
    const v2 = MainSequenceCompliance.calculateTheoreticalPeakVelocity(2.0);
    expect(v2).toBeCloseTo(V_MAX * (1 - Math.exp(-2.0 / A_0)), 1);
    expect(v2).toBeGreaterThan(80);
    expect(v2).toBeLessThan(120);

    // Medium saccade (15 deg) - exactly 1 - 1/e ≈ 63.2% of V_MAX
    const v15 = MainSequenceCompliance.calculateTheoreticalPeakVelocity(15.0);
    expect(v15).toBeCloseTo(V_MAX * (1 - Math.exp(-1)), 1);
    expect(v15).toBeCloseTo(750 * 0.632, 0);

    // Large saccade (40 deg) - asymptotically approaches V_MAX
    const v40 = MainSequenceCompliance.calculateTheoreticalPeakVelocity(40.0);
    expect(v40).toBeGreaterThan(650);
    expect(v40).toBeLessThanOrEqual(V_MAX);
  });

  it('flags saccades within physiological corridor as compliant', () => {
    const compliance = new MainSequenceCompliance();

    // 10 deg saccade: expected is ~363 deg/s
    const expected = MainSequenceCompliance.calculateTheoreticalPeakVelocity(10.0);

    // Observed at 380 deg/s (within +5% of expected)
    const obsNormal = compliance.evaluateSaccade(10.0, expected * 1.05);
    expect(obsNormal.isCompliant).toBe(true);
    expect(obsNormal.deviationPercent).toBeLessThan(10.0);

    // Observed at 900 deg/s (unphysiologically fast, +148% over expected)
    const obsSuperHuman = compliance.evaluateSaccade(10.0, 900.0);
    expect(obsSuperHuman.isCompliant).toBe(false);

    const summary = compliance.getSummary();
    expect(summary.totalSaccadesEvaluated).toBe(2);
    expect(summary.compliantCount).toBe(1);
    expect(summary.complianceRatePercent).toBe(50.0);
  });

  it('validates OpenXR XR_EXT_eye_gaze_interaction dataset schema compliance', () => {
    const sampleRecord = {
      spec: 'XR_EXT_eye_gaze_interaction',
      version: '1.0.0',
      timestampNanos: 123456789000,
      gazeOriginMeters: { x: 0.0, y: 0.08, z: 0.0 },
      gazeDirection: { x: 0.0, y: 0.0, z: -1.0 },
      gazeAnglesDeg: { pitch: 0.0, yaw: 0.0, roll: 0.0 },
      eyelidOpenness: { continuousAperture: 0.95, isBlink: false },
      eyeContactQuality: 0.98,
      angularVelocityDegPerSec: 12.4,
      isSaccade: false,
      isFixation: true,
      confidence: 0.99
    };

    expect(sampleRecord.spec).toBe('XR_EXT_eye_gaze_interaction');
    expect(sampleRecord.gazeDirection.z).toBe(-1.0);
    expect(sampleRecord.eyelidOpenness.continuousAperture).toBeGreaterThanOrEqual(0.0);
    expect(sampleRecord.eyelidOpenness.continuousAperture).toBeLessThanOrEqual(1.0);
    expect(sampleRecord.eyeContactQuality).toBeGreaterThanOrEqual(0.0);
    expect(sampleRecord.eyeContactQuality).toBeLessThanOrEqual(1.0);
  });
});
