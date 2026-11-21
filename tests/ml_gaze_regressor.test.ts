import { describe, it, expect, beforeEach } from 'vitest';
import { PolynomialGazeRegressor, CalibrationSample } from '../src/core/vision/PolynomialGazeRegressor';

describe('PolynomialGazeRegressor (In-Browser Online ML Personalization)', () => {
  let regressor: PolynomialGazeRegressor;

  beforeEach(() => {
    regressor = new PolynomialGazeRegressor();
  });

  it('starts unfitted and safely falls through on predict', () => {
    expect(regressor.getIsFitted()).toBe(false);
    const pred = regressor.predict(0.42, 0.58);
    expect(pred.isFitted).toBe(false);
    expect(pred.screenX).toBe(0.42);
    expect(pred.screenY).toBe(0.58);
  });

  it('correctly expands 2D eye ratios and head angles into a 10-dimensional polynomial feature vector', () => {
    const f = regressor.extractFeatures(0.5, 0.6, 10.0, -5.0);
    expect(f.length).toBe(10);
    expect(f[0]).toBe(1.0); // Bias
    expect(f[1]).toBe(0.5); // x
    expect(f[2]).toBe(0.6); // y
    expect(f[3]).toBeCloseTo(0.25, 4); // x^2
    expect(f[4]).toBeCloseTo(0.36, 4); // y^2
    expect(f[5]).toBeCloseTo(0.30, 4); // xy
    expect(f[8]).toBeCloseTo(0.20, 4); // normalized yaw
    expect(f[9]).toBeCloseTo(-0.10, 4); // normalized pitch
  });

  it('trains via Ridge Regression and achieves R2 > 0.95 on 9-point grid samples', () => {
    const samples: CalibrationSample[] = [
      { rawX: 0.40, rawY: 0.42, screenX: 0.08, screenY: 0.08 },
      { rawX: 0.50, rawY: 0.42, screenX: 0.50, screenY: 0.08 },
      { rawX: 0.60, rawY: 0.42, screenX: 0.92, screenY: 0.08 },
      { rawX: 0.40, rawY: 0.50, screenX: 0.08, screenY: 0.50 },
      { rawX: 0.50, rawY: 0.50, screenX: 0.50, screenY: 0.50 },
      { rawX: 0.60, rawY: 0.50, screenX: 0.92, screenY: 0.50 },
      { rawX: 0.40, rawY: 0.58, screenX: 0.08, screenY: 0.92 },
      { rawX: 0.50, rawY: 0.58, screenX: 0.50, screenY: 0.92 },
      { rawX: 0.60, rawY: 0.58, screenX: 0.92, screenY: 0.92 },
    ];

    const success = regressor.fit(samples);
    expect(success).toBe(true);
    expect(regressor.getIsFitted()).toBe(true);

    const metrics = regressor.getMetrics();
    expect(metrics.isFitted).toBe(true);
    expect(metrics.sampleCount).toBe(9);
    expect(metrics.r2).toBeGreaterThan(0.95);
    expect(metrics.mse).toBeLessThan(0.01);

    // Test prediction near center
    const centerPred = regressor.predict(0.50, 0.50);
    expect(centerPred.isFitted).toBe(true);
    expect(centerPred.screenX).toBeCloseTo(0.50, 1);
    expect(centerPred.screenY).toBeCloseTo(0.50, 1);
  });

  it('safely handles insufficient samples (< 5) without crashing', () => {
    const insufficient: CalibrationSample[] = [
      { rawX: 0.4, rawY: 0.4, screenX: 0.1, screenY: 0.1 },
      { rawX: 0.6, rawY: 0.6, screenX: 0.9, screenY: 0.9 }
    ];
    const success = regressor.fit(insufficient);
    expect(success).toBe(false);
    expect(regressor.getIsFitted()).toBe(false);
  });

  it('resets cleanly to unfitted state', () => {
    const samples: CalibrationSample[] = [
      { rawX: 0.4, rawY: 0.4, screenX: 0.1, screenY: 0.1 },
      { rawX: 0.6, rawY: 0.4, screenX: 0.9, screenY: 0.1 },
      { rawX: 0.5, rawY: 0.5, screenX: 0.5, screenY: 0.5 },
      { rawX: 0.4, rawY: 0.6, screenX: 0.1, screenY: 0.9 },
      { rawX: 0.6, rawY: 0.6, screenX: 0.9, screenY: 0.9 }
    ];
    regressor.fit(samples);
    expect(regressor.getIsFitted()).toBe(true);

    regressor.reset();
    expect(regressor.getIsFitted()).toBe(false);
    expect(regressor.getMetrics().sampleCount).toBe(0);
  });
});
