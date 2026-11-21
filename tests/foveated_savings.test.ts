import { describe, it, expect } from 'vitest';
import { FoveatedWorkloadCalculator } from '../src/core/graphics/FoveatedShader';

describe('Foveated Rendering GPU Workload Reduction', () => {
  it('calculates significant pixel shading savings for human fovea parameters', () => {
    // 2.5 deg fovea radius (~0.068 normalized), 5.5 deg parafovea (~0.15 normalized)
    const stats = FoveatedWorkloadCalculator.calculateSavings(0.068, 0.15, 0.25, 1920, 1080);

    expect(stats.nativePixelCount).toBe(1920 * 1080);
    expect(stats.foveatedEffectivePixels).toBeLessThan(stats.nativePixelCount);
    expect(stats.pixelShadingReductionPercent).toBeGreaterThan(45.0);
    expect(stats.pixelShadingReductionPercent).toBeLessThan(85.0);
  });

  it('demonstrates increasing savings as peripheral sampling rate decreases', () => {
    const statsQuarter = FoveatedWorkloadCalculator.calculateSavings(0.068, 0.15, 0.25);
    const statsHalf = FoveatedWorkloadCalculator.calculateSavings(0.068, 0.15, 0.50);

    expect(statsQuarter.pixelShadingReductionPercent).toBeGreaterThan(statsHalf.pixelShadingReductionPercent);
  });
});
