/**
 * Numerical Riemann Integral & Analytical Double Integral for Foveated Shading Workload
 * Evaluates:
 * Savings = 1.0 - [ \iint_{Fovea} 1.0 dA + \iint_{Para} S(r) dA + \iint_{Periph} R_p dA ] / ScreenArea
 */

export interface RiemannIntegralResult {
  totalScreenAreaNormalized: number;
  foveaAreaFraction: number;
  parafoveaAreaFraction: number;
  peripheryAreaFraction: number;
  foveaLoad: number;
  parafoveaLoad: number;
  peripheryLoad: number;
  effectiveShadingLoad: number;
  shadingReductionPercent: number;
  riemannStripsCount: number;
  nativePixelCount: number;
  foveatedEffectivePixels: number;
  discreteRiemannSavingsPercent: number;
  analyticalSavingsPercent: number;
}

export class RiemannFoveatedIntegral {
  /**
   * Computes GPU pixel-shading load reduction using a 200-strip Riemann sum
   * and closed-form analytical double integral.
   */
  public static calculate(
    foveaRadiusNormalized: number = 0.068,      // ~2.5 deg visual angle
    parafoveaRadiusNormalized: number = 0.150,  // ~5.5 deg visual angle
    peripheralSamplingRate: number = 0.25,      // 4x4 VRS (1/4 shading rate)
    screenWidth: number = 1920,
    screenHeight: number = 1080,
    strips: number = 200
  ): RiemannIntegralResult {
    const totalPixels = screenWidth * screenHeight;
    const aspect = screenWidth / screenHeight;

    // Fovea Area (Normalized to [0, 1] screen area)
    const rawFoveaArea = Math.PI * foveaRadiusNormalized * foveaRadiusNormalized * aspect;
    const foveaArea = Math.max(0.005, Math.min(0.15, rawFoveaArea));

    // Parafovea Area
    const rawParaArea = Math.PI * (parafoveaRadiusNormalized * parafoveaRadiusNormalized - foveaRadiusNormalized * foveaRadiusNormalized) * aspect;
    const paraArea = Math.max(0.02, Math.min(0.30, rawParaArea));

    // Periphery Area
    const periphArea = Math.max(0.40, 1.0 - foveaArea - paraArea);

    // 1. Analytical Solution
    // Fovea: S(r) = 1.0
    const foveaLoad = foveaArea * 1.0;

    // Parafovea: Linear blend between 1.0 and peripheralSamplingRate
    const avgParaRate = (1.0 + peripheralSamplingRate) * 0.5;
    const paraLoad = paraArea * avgParaRate;

    // Periphery: Constant peripheral sampling rate
    const periphLoad = periphArea * peripheralSamplingRate;

    const analyticalTotalLoad = foveaLoad + paraLoad + periphLoad;
    const analyticalSavings = (1.0 - analyticalTotalLoad) * 100;

    // 2. Numerical Riemann Strip Sum (Concentric radial annulus slices up to parafovea radius)
    const dr = parafoveaRadiusNormalized / strips;
    let riemannInnerLoad = 0.0;
    let riemannInnerArea = 0.0;

    for (let i = 0; i < strips; i++) {
      const r = (i + 0.5) * dr;
      const dArea = 2 * Math.PI * r * dr * aspect;
      riemannInnerArea += dArea;

      let shadingRate: number;
      if (r <= foveaRadiusNormalized) {
        shadingRate = 1.0;
      } else {
        const t = (r - foveaRadiusNormalized) / (parafoveaRadiusNormalized - foveaRadiusNormalized);
        shadingRate = 1.0 - (1.0 - peripheralSamplingRate) * t;
      }

      riemannInnerLoad += dArea * shadingRate;
    }

    // Remainder of screen is periphery at peripheralSamplingRate
    const riemannPeriphArea = Math.max(0.40, 1.0 - riemannInnerArea);
    const riemannPeriphLoad = riemannPeriphArea * peripheralSamplingRate;
    const riemannTotalLoad = riemannInnerLoad + riemannPeriphLoad;
    const riemannSavings = (1.0 - riemannTotalLoad) * 100;

    // Numerical Riemann result
    const finalSavings = parseFloat(riemannSavings.toFixed(1));
    const effectivePixels = Math.round(totalPixels * (1.0 - finalSavings / 100));

    return {
      totalScreenAreaNormalized: 1.0,
      foveaAreaFraction: parseFloat(foveaArea.toFixed(3)),
      parafoveaAreaFraction: parseFloat(paraArea.toFixed(3)),
      peripheryAreaFraction: parseFloat(periphArea.toFixed(3)),
      foveaLoad: parseFloat(foveaLoad.toFixed(3)),
      parafoveaLoad: parseFloat(paraLoad.toFixed(3)),
      peripheryLoad: parseFloat(periphLoad.toFixed(3)),
      effectiveShadingLoad: parseFloat((1.0 - finalSavings / 100).toFixed(3)),
      shadingReductionPercent: finalSavings,
      riemannStripsCount: strips,
      nativePixelCount: totalPixels,
      foveatedEffectivePixels: effectivePixels,
      discreteRiemannSavingsPercent: finalSavings,
      analyticalSavingsPercent: parseFloat(analyticalSavings.toFixed(1)),
    };
  }
}
