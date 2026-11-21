import { describe, it, expect, beforeEach } from 'vitest';
import { HeadPoseEstimator, MP_NOSE_TIP, MP_CHIN, MP_FOREHEAD, MP_LEFT_EYE_OUTER, MP_RIGHT_EYE_OUTER } from '../src/core/vision/HeadPoseEstimator';
import { EyeAspectRatioBlinkEngine } from '../src/core/vision/EyeAspectRatioBlinkEngine';
import { NormalizedLandmarkList } from '@mediapipe/face_mesh';

describe('Phase 1: Head-Pose Invariant Decoupled Gaze Engine', () => {
  const estimator = new HeadPoseEstimator();

  beforeEach(() => {
    estimator.resetCalibration();
  });

  const createMockLandmarkMesh = (
    noseOffset: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
    eyeRollAngleRad: number = 0
  ): NormalizedLandmarkList => {
    const list: any[] = new Array(478).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }));

    // Neutral Head Anchor Points
    list[MP_NOSE_TIP] = { x: 0.50 + noseOffset.x, y: 0.45 + noseOffset.y, z: -0.05 + noseOffset.z };
    list[MP_CHIN] = { x: 0.50, y: 0.70, z: 0.0 };
    list[MP_FOREHEAD] = { x: 0.50, y: 0.20, z: 0.0 };

    // Eye outer corners with optional in-plane roll
    const eyeHalfDist = 0.15;
    const cosR = Math.cos(eyeRollAngleRad);
    const sinR = Math.sin(eyeRollAngleRad);

    list[MP_LEFT_EYE_OUTER] = {
      x: 0.50 - eyeHalfDist * cosR,
      y: 0.38 - eyeHalfDist * sinR,
      z: 0.0
    };
    list[MP_RIGHT_EYE_OUTER] = {
      x: 0.50 + eyeHalfDist * cosR,
      y: 0.38 + eyeHalfDist * sinR,
      z: 0.0
    };

    return list as NormalizedLandmarkList;
  };

  it('estimates 6-DoF head pose with near-zero rotation for neutral frontal face', () => {
    const neutralMesh = createMockLandmarkMesh();
    const pose = estimator.estimatePose(neutralMesh);

    expect(Math.abs(pose.angles.yawDeg)).toBeLessThan(5.0);
    expect(Math.abs(pose.angles.pitchDeg)).toBeLessThan(5.0);
    expect(Math.abs(pose.angles.rollDeg)).toBeLessThan(5.0);
    expect(pose.faceConfidence).toBeGreaterThanOrEqual(0.8);
  });

  it('generates strictly orthonormal 3x3 rotation matrix R_head', () => {
    const mesh = createMockLandmarkMesh({ x: 0.03, y: 0.02, z: 0.01 });
    const pose = estimator.estimatePose(mesh);
    const R = pose.rotationMatrix;

    // Check R * R^T = I
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const dot = R[row][0] * R[col][0] + R[row][1] * R[col][1] + R[row][2] * R[col][2];
        const expected = row === col ? 1.0 : 0.0;
        expect(dot).toBeCloseTo(expected, 1);
      }
    }
  });

  it('detects positive yaw when head turns right', () => {
    estimator.resetCalibration();
    // Turning right shifts nose to positive x relative to eyes
    const turnedRightMesh = createMockLandmarkMesh({ x: 0.05, y: 0, z: 0 });
    const pose = estimator.estimatePose(turnedRightMesh);

    expect(pose.angles.yawDeg).toBeGreaterThan(5.0);
  });

  it('decouples Gaze-in-World from Head-Pose (canceling head rotation during fixed fixation)', () => {
    estimator.resetCalibration();
    const turnedMesh = createMockLandmarkMesh({ x: 0.04, y: 0, z: 0 });
    const headPose = estimator.estimatePose(turnedMesh);

    const headYaw = headPose.angles.yawDeg; // e.g. +12 deg
    expect(headYaw).toBeGreaterThan(0);

    // User is looking straight at the camera, so pupils shift -headYaw in the head socket
    const eyeYawInHead = -headYaw;
    const eyePitchInHead = 0;

    const decoupled = estimator.decoupleGaze(headPose, eyeYawInHead, eyePitchInHead);

    // Decoupled world gaze must be ~0° (holding eye contact on screen)
    expect(decoupled.gazeInWorld.yaw).toBeCloseTo(0.0, 1);
    expect(decoupled.eyeContactQuality).toBeGreaterThan(0.95); // High mutual eye contact
  });

  it('penalizes eye contact quality when gaze deviates off-axis (e.g. downward visor error)', () => {
    const neutralPose = estimator.estimatePose(createMockLandmarkMesh());

    // 1:1 Eyeline (0° pitch, 0° yaw)
    const aligned = estimator.decoupleGaze(neutralPose, 0, 0);
    expect(aligned.eyeContactQuality).toBeCloseTo(1.0, 1);

    // Physical Visor Parallax Error (-14.2° downward stare)
    const offAxis = estimator.decoupleGaze(neutralPose, 0, 14.2);
    expect(offAxis.eyeContactQuality).toBeLessThan(0.20);
  });

  it('calibrates zero-point baseline offsets', () => {
    const turnedMesh = createMockLandmarkMesh({ x: 0.03, y: 0.02, z: 0 });
    const pose = estimator.estimatePose(turnedMesh);

    estimator.calibrateZeroPoint(pose, 4.0, -2.0);
    expect(estimator.getIsCalibrated()).toBe(true);

    const decoupled = estimator.decoupleGaze(pose, 4.0, -2.0);
    expect(decoupled.gazeInWorld.yaw).toBeCloseTo(0.0, 1);
    expect(decoupled.gazeInWorld.pitch).toBeCloseTo(0.0, 1);
  });

  it('interpolates continuous eyelid aperture (0.0 closed to 1.0 open)', () => {
    const blinkEngine = new EyeAspectRatioBlinkEngine();

    // Helper to generate eye opening with all 6 MediaPipe vertical landmark pairs
    const makeEyeMesh = (verticalOpening: number) => {
      const list: any[] = new Array(478).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }));

      // Left Eye corners
      list[33] = { x: 0.30, y: 0.40, z: 0 };
      list[133] = { x: 0.40, y: 0.40, z: 0 };

      // Left Eye vertical pairs
      list[159] = { x: 0.35, y: 0.40 - verticalOpening / 2, z: 0 };
      list[145] = { x: 0.35, y: 0.40 + verticalOpening / 2, z: 0 };
      list[160] = { x: 0.33, y: 0.40 - verticalOpening / 2, z: 0 };
      list[144] = { x: 0.33, y: 0.40 + verticalOpening / 2, z: 0 };
      list[158] = { x: 0.37, y: 0.40 - verticalOpening / 2, z: 0 };
      list[153] = { x: 0.37, y: 0.40 + verticalOpening / 2, z: 0 };

      // Right Eye corners
      list[362] = { x: 0.60, y: 0.40, z: 0 };
      list[263] = { x: 0.70, y: 0.40, z: 0 };

      // Right Eye vertical pairs
      list[386] = { x: 0.65, y: 0.40 - verticalOpening / 2, z: 0 };
      list[374] = { x: 0.65, y: 0.40 + verticalOpening / 2, z: 0 };
      list[385] = { x: 0.63, y: 0.40 - verticalOpening / 2, z: 0 };
      list[380] = { x: 0.63, y: 0.40 + verticalOpening / 2, z: 0 };
      list[387] = { x: 0.67, y: 0.40 - verticalOpening / 2, z: 0 };
      list[373] = { x: 0.67, y: 0.40 + verticalOpening / 2, z: 0 };

      return list as NormalizedLandmarkList;
    };

    // Wide open eyes
    const openMetrics = blinkEngine.update(makeEyeMesh(0.032), 100);
    expect(openMetrics.openFraction).toBeGreaterThan(0.75);

    // Half squint (partial closure)
    const squintMetrics = blinkEngine.update(makeEyeMesh(0.020), 200);
    expect(squintMetrics.openFraction).toBeLessThan(openMetrics.openFraction);
    expect(squintMetrics.openFraction).toBeGreaterThan(0.15);

    // Full closed blink
    blinkEngine.update(makeEyeMesh(0.006), 300);
    const closedMetrics = blinkEngine.update(makeEyeMesh(0.005), 350);
    expect(closedMetrics.openFraction).toBeLessThan(0.15);
  });

  it('handles mirrorMode for selfie webcam feeds: user turning right produces positive yaw', () => {
    const mirrorEstimator = new HeadPoseEstimator();
    mirrorEstimator.setMirrorMode(true);
    expect(mirrorEstimator.getMirrorMode()).toBe(true);

    // In raw unmirrored camera frame, when user turns to their right, the nose moves towards lower x (camera-left)
    const userTurnedRightMesh = createMockLandmarkMesh({ x: -0.05, y: 0, z: 0 });
    const pose = mirrorEstimator.estimatePose(userTurnedRightMesh);

    // In selfie/mirror mode, this must map to positive screen yaw (> 5°)
    expect(pose.angles.yawDeg).toBeGreaterThan(5.0);
  });

  it('applies adaptive double EMA smoothing to head movement (0.18 for still, 0.88 for fast turn)', () => {
    const emaEstimator = new HeadPoseEstimator();
    const mesh1 = createMockLandmarkMesh({ x: 0.0, y: 0, z: 0 });
    emaEstimator.estimatePose(mesh1);

    // Small microscopic jitter (0.001) -> velocity < threshold -> heavy smoothing (alpha ~ 0.18)
    const meshSmallJitter = createMockLandmarkMesh({ x: 0.001, y: 0, z: 0 });
    const poseJitter = emaEstimator.estimatePose(meshSmallJitter);
    expect(Math.abs(poseJitter.angles.yawDeg)).toBeLessThan(0.5);

    // Large ballistic head turn (0.06 jump) -> velocity high -> light smoothing (alpha ~ 0.88)
    const meshFastTurn = createMockLandmarkMesh({ x: 0.06, y: 0, z: 0 });
    const poseFast = emaEstimator.estimatePose(meshFastTurn);
    expect(poseFast.angles.yawDeg).toBeGreaterThan(5.0);
  });
});

