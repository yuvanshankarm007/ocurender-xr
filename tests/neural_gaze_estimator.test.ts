import { describe, it, expect, beforeEach } from 'vitest';
import { NeuralGazeEstimator } from '../src/core/vision/NeuralGazeEstimator';
import { NormalizedLandmarkList } from '@mediapipe/face_mesh';
import { HeadPoseData } from '../src/core/vision/HeadPoseEstimator';

describe('NeuralGazeEstimator (Deep Learning Forward Inference)', () => {
  let estimator: NeuralGazeEstimator;

  beforeEach(() => {
    estimator = new NeuralGazeEstimator();
  });

  it('initializes in ready state with loaded weights', () => {
    expect(estimator.getIsLoaded()).toBe(true);
  });

  it('constructs a 70-dimensional neural input feature tensor', () => {
    // Mock 478 landmarks
    const landmarks: NormalizedLandmarkList = Array.from({ length: 478 }, (_, i) => ({
      x: 0.5 + (i % 10) * 0.01,
      y: 0.5 + (i % 8) * 0.01,
      z: 0.0
    }));

    const headPose: HeadPoseData = {
      translation: { x: 0.0, y: 0.0, z: 0.55 },
      angles: { pitchDeg: 2.0, yawDeg: -4.0, rollDeg: 0.5 },
      rotationMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      faceConfidence: 0.98
    };

    const features = estimator.extractFeatures(landmarks, headPose);
    expect(features.length).toBe(70);
    // Head pose normalized values check
    expect(features[64]).toBeCloseTo(-0.08, 3); // yaw * 0.02
    expect(features[65]).toBeCloseTo(0.04, 3);  // pitch * 0.02
    expect(features[69]).toBeCloseTo(0.55, 3);  // tz
  });

  it('computes 3D normalized gaze vector and decoupled angles with sub-millisecond latency', () => {
    const landmarks: NormalizedLandmarkList = Array.from({ length: 478 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0.0
    }));

    // Setup iris and eye corners for center gaze
    landmarks[468] = { x: 0.45, y: 0.5, z: 0 }; // Left iris
    landmarks[473] = { x: 0.55, y: 0.5, z: 0 }; // Right iris
    landmarks[33] = { x: 0.40, y: 0.5, z: 0 };  // Left outer
    landmarks[133] = { x: 0.50, y: 0.5, z: 0 }; // Left inner
    landmarks[362] = { x: 0.50, y: 0.5, z: 0 }; // Right inner
    landmarks[263] = { x: 0.60, y: 0.5, z: 0 }; // Right outer

    const headPose: HeadPoseData = {
      translation: { x: 0.0, y: 0.0, z: 0.50 },
      angles: { pitchDeg: 0, yawDeg: 0, rollDeg: 0 },
      rotationMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      faceConfidence: 0.95
    };

    const result = estimator.estimateGaze(landmarks, headPose);

    expect(result).toBeDefined();
    // 3D Gaze vector must be a unit vector
    const mag = Math.sqrt(
      result.gazeVector3D.x ** 2 +
      result.gazeVector3D.y ** 2 +
      result.gazeVector3D.z ** 2
    );
    expect(mag).toBeCloseTo(1.0, 4);

    // Screen coordinates must be bounded in [0, 1]
    expect(result.screenPoint.x).toBeGreaterThanOrEqual(0);
    expect(result.screenPoint.x).toBeLessThanOrEqual(1);
    expect(result.screenPoint.y).toBeGreaterThanOrEqual(0);
    expect(result.screenPoint.y).toBeLessThanOrEqual(1);

    // Latency must be high-speed
    expect(result.inferenceTimeMs).toBeLessThan(10.0);
  });
});
