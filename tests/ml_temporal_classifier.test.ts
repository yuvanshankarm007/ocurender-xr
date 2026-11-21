import { describe, it, expect, beforeEach } from 'vitest';
import { TemporalOcularClassifier, OcularKinematicFrame } from '../src/core/vision/TemporalOcularClassifier';

describe('TemporalOcularClassifier (ML Blink & Saccade Dynamics)', () => {
  let classifier: TemporalOcularClassifier;

  beforeEach(() => {
    classifier = new TemporalOcularClassifier();
  });

  it('classifies steady open gaze as FIXATION with low blink probability', () => {
    let result;
    for (let i = 0; i < 8; i++) {
      result = classifier.update({
        timestampMs: 1000 + i * 16.6,
        earLeft: 0.32,
        earRight: 0.32,
        earAvg: 0.32,
        openFraction: 0.95,
        gazeX: 0.50,
        gazeY: 0.50,
        angularVelocityDegPerSec: 4.5,
        pupilDiameterMm: 3.5
      });
    }

    expect(result).toBeDefined();
    expect(result!.state).toBe('FIXATION');
    expect(result!.isBlinkActive).toBe(false);
    expect(result!.pBlink).toBeLessThan(0.20);
    expect(result!.pFixation).toBeGreaterThan(0.70);
  });

  it('detects SACCADE when angular velocity spikes while eyes remain open', () => {
    // 5 steady frames
    for (let i = 0; i < 5; i++) {
      classifier.update({
        timestampMs: 1000 + i * 16.6,
        earLeft: 0.32,
        earRight: 0.32,
        earAvg: 0.32,
        openFraction: 0.95,
        gazeX: 0.40,
        gazeY: 0.50,
        angularVelocityDegPerSec: 5.0,
        pupilDiameterMm: 3.5
      });
    }

    // High velocity saccade frame
    const saccadeResult = classifier.update({
      timestampMs: 1000 + 5 * 16.6,
      earLeft: 0.31,
      earRight: 0.31,
      earAvg: 0.31,
      openFraction: 0.92,
      gazeX: 0.75,
      gazeY: 0.50,
      angularVelocityDegPerSec: 120.0,
      pupilDiameterMm: 3.5
    });

    expect(saccadeResult.state).toBe('SACCADE');
    expect(saccadeResult.isBlinkActive).toBe(false);
    expect(saccadeResult.pSaccade).toBeGreaterThan(0.60);
  });

  it('detects BLINK_DESCENT and BLINK_CLOSED as eyelid plunge occurs', () => {
    // 3 steady open frames
    for (let i = 0; i < 3; i++) {
      classifier.update({
        timestampMs: 1000 + i * 16.6,
        earLeft: 0.32,
        earRight: 0.32,
        earAvg: 0.32,
        openFraction: 0.95,
        gazeX: 0.50,
        gazeY: 0.50,
        angularVelocityDegPerSec: 5.0,
        pupilDiameterMm: 3.5
      });
    }

    // Descent frame (steep d(EAR)/dt)
    const descentResult = classifier.update({
      timestampMs: 1000 + 3 * 16.6,
      earLeft: 0.22,
      earRight: 0.22,
      earAvg: 0.22,
      openFraction: 0.65,
      gazeX: 0.50,
      gazeY: 0.50,
      angularVelocityDegPerSec: 6.0,
      pupilDiameterMm: 3.5
    });

    expect(descentResult.isBlinkActive).toBe(true);
    expect(descentResult.earVelocity).toBeLessThan(-2.0);

    // Full closure frame
    const closedResult = classifier.update({
      timestampMs: 1000 + 4 * 16.6,
      earLeft: 0.08,
      earRight: 0.08,
      earAvg: 0.08,
      openFraction: 0.20,
      gazeX: 0.50,
      gazeY: 0.50,
      angularVelocityDegPerSec: 2.0,
      pupilDiameterMm: 3.5
    });

    expect(closedResult.state).toBe('BLINK_CLOSED');
    expect(closedResult.isBlinkActive).toBe(true);
    expect(closedResult.pBlink).toBeGreaterThan(0.85);
  });
});
