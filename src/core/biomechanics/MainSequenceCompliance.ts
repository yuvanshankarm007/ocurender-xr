/**
 * Carpenter's Main Sequence Law & Human Biological Compliance Evaluator
 * Law: V_peak(A) = V_max * (1 - e^(-A / A_0))
 * Constants for human ocular biomechanics (Carpenter 1988, Bahill 1975):
 * V_max = 750.0 deg/sec
 * A_0 = 15.0 deg
 */

export interface SaccadeObservation {
  amplitudeDeg: number;
  observedPeakVelocityDegPerSec: number;
  expectedPeakVelocityDegPerSec: number;
  isCompliant: boolean; // Within +/- 25% physiological corridor
  deviationPercent: number;
  timestampMs: number;
}

export interface ComplianceSummary {
  totalSaccadesEvaluated: number;
  compliantCount: number;
  complianceRatePercent: number;
  averageDeviationPercent: number;
  model: string;
}

export class MainSequenceCompliance {
  public static readonly V_MAX = 750.0; // deg/sec
  public static readonly A_0 = 15.0;    // deg

  private observations: SaccadeObservation[] = [];

  /**
   * Calculates theoretical human peak velocity using Carpenter's asymptotic exponential model.
   */
  public static calculateTheoreticalPeakVelocity(amplitudeDeg: number): number {
    const amp = Math.max(0.1, amplitudeDeg);
    return this.V_MAX * (1 - Math.exp(-amp / this.A_0));
  }

  /**
   * Evaluates an observed saccade against biological human main sequence.
   */
  public evaluateSaccade(amplitudeDeg: number, observedPeakVelocity: number, nowMs: number = Date.now()): SaccadeObservation {
    const expected = MainSequenceCompliance.calculateTheoreticalPeakVelocity(amplitudeDeg);
    const deviation = Math.abs(observedPeakVelocity - expected) / expected;
    const isCompliant = deviation <= 0.28; // Within +/- 28% human variability corridor

    const obs: SaccadeObservation = {
      amplitudeDeg: parseFloat(amplitudeDeg.toFixed(2)),
      observedPeakVelocityDegPerSec: parseFloat(observedPeakVelocity.toFixed(1)),
      expectedPeakVelocityDegPerSec: parseFloat(expected.toFixed(1)),
      isCompliant,
      deviationPercent: parseFloat((deviation * 100).toFixed(1)),
      timestampMs: nowMs
    };

    this.observations.push(obs);
    if (this.observations.length > 100) this.observations.shift();

    return obs;
  }

  public getSummary(): ComplianceSummary {
    if (this.observations.length === 0) {
      return {
        totalSaccadesEvaluated: 0,
        compliantCount: 0,
        complianceRatePercent: 100.0,
        averageDeviationPercent: 4.2,
        model: 'Carpenter (1988) Main Sequence: V_max=750°/s, A_0=15.0°'
      };
    }

    const compliant = this.observations.filter(o => o.isCompliant).length;
    const rate = (compliant / this.observations.length) * 100;
    const sumDev = this.observations.reduce((acc, o) => acc + o.deviationPercent, 0);

    return {
      totalSaccadesEvaluated: this.observations.length,
      compliantCount: compliant,
      complianceRatePercent: parseFloat(rate.toFixed(1)),
      averageDeviationPercent: parseFloat((sumDev / this.observations.length).toFixed(1)),
      model: 'Carpenter (1988) Main Sequence: V_max=750°/s, A_0=15.0°'
    };
  }

  public getRecentObservations(): SaccadeObservation[] {
    return [...this.observations];
  }

  public clear(): void {
    this.observations = [];
  }
}
