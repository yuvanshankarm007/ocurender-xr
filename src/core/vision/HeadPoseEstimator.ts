import { NormalizedLandmarkList } from '@mediapipe/face_mesh';
import { Vector3D, GazeAngles } from '../../types';

// Key anchor landmark indices for 6-DoF Head Pose estimation
export const MP_NOSE_TIP = 1;
export const MP_CHIN = 152;
export const MP_FOREHEAD = 10;
export const MP_LEFT_EYE_OUTER = 33;
export const MP_RIGHT_EYE_OUTER = 263;

export interface HeadPoseData {
  translation: Vector3D;
  angles: {
    pitchDeg: number; // Positive = nodding down, Negative = looking up
    yawDeg: number;   // Positive = turned right, Negative = turned left
    rollDeg: number;  // Positive = tilted right, Negative = tilted left
  };
  rotationMatrix: number[][]; // 3x3 Orthonormal matrix R_head
  faceConfidence: number;
}

export interface DecoupledGazeResult {
  headPose: HeadPoseData;
  gazeInHead: GazeAngles;    // Eye orientation relative to skull
  gazeInWorld: GazeAngles;   // Decoupled true gaze in world space (R_head * Gaze_eye)
  worldGazeVector: Vector3D; // Unit vector in 3D world coordinates
  eyeContactQuality: number; // 0.0 to 1.0 (1.0 = locked mutual eye contact)
}

export class HeadPoseEstimator {
  // Calibration zero-points
  private zeroHeadYaw = 0;
  private zeroHeadPitch = 0;
  private zeroHeadRoll = 0;
  private zeroEyeYaw = 0;
  private zeroEyePitch = 0;
  private isCalibrated = false;

  // High-responsiveness EMA smoothing for zero-latency 60 FPS head tracking
  private readonly ALPHA_FIXATION = 0.55;
  private readonly ALPHA_SACCADE = 0.95;
  private readonly VELOCITY_THRESHOLD_DEG = 3.5;

  private smoothedHeadYaw = 0;
  private smoothedHeadPitch = 0;
  private smoothedHeadRoll = 0;
  private prevRawYaw = 0;
  private prevRawPitch = 0;
  private prevRawRoll = 0;
  private isFirstFrame = true;

  // Mirror mode: true for selfie/mirrored webcam feeds, false for unmirrored Cartesian coords
  private mirrorMode = false;

  public setMirrorMode(mirror: boolean): void {
    this.mirrorMode = mirror;
  }

  public getMirrorMode(): boolean {
    return this.mirrorMode;
  }

  /**
   * Estimates 6-DoF head pose using the 5 primary cranial anchors:
   * 1: Nose tip, 152: Chin, 10: Forehead, 33: Left eye outer, 263: Right eye outer
   */
  public estimatePose(landmarks: NormalizedLandmarkList): HeadPoseData {
    const nose = landmarks[MP_NOSE_TIP] || { x: 0.5, y: 0.5, z: 0 };
    const chin = landmarks[MP_CHIN] || { x: 0.5, y: 0.7, z: 0 };
    const forehead = landmarks[MP_FOREHEAD] || { x: 0.5, y: 0.2, z: 0 };
    const leftEye = landmarks[MP_LEFT_EYE_OUTER] || { x: 0.35, y: 0.4, z: 0 };
    const rightEye = landmarks[MP_RIGHT_EYE_OUTER] || { x: 0.65, y: 0.4, z: 0 };

    // Translation estimate: Center of face mass (midpoint of eye bridge and nose)
    const eyeMidpoint: Vector3D = {
      x: (leftEye.x + rightEye.x) * 0.5,
      y: (leftEye.y + rightEye.y) * 0.5,
      z: ((leftEye.z || 0) + (rightEye.z || 0)) * 0.5,
    };

    const translation: Vector3D = {
      x: (nose.x + eyeMidpoint.x) * 0.5,
      y: (nose.y + eyeMidpoint.y) * 0.5,
      z: ((nose.z || 0) + eyeMidpoint.z) * 0.5,
    };

    // Construct 3D Orthogonal Head Frame:
    // 1. Horizontal vector from left eye to right eye (inter-canthal axis)
    const dx = rightEye.x - leftEye.x;
    const dy = rightEye.y - leftEye.y;
    const dz = (rightEye.z || 0) - (leftEye.z || 0);
    const eyeDist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1;
    const uX = [dx / eyeDist, dy / eyeDist, dz / eyeDist];

    // 2. Vertical vector from forehead to chin
    const vy_x = chin.x - forehead.x;
    const vy_y = chin.y - forehead.y;
    const vy_z = (chin.z || 0) - (forehead.z || 0);
    const faceHeight = Math.sqrt(vy_x * vy_x + vy_y * vy_y + vy_z * vy_z) || 0.1;
    const uY_raw = [vy_x / faceHeight, vy_y / faceHeight, vy_z / faceHeight];

    // 3. Normal vector: uZ = uX x uY_raw
    const uZ = [
      uX[1] * uY_raw[2] - uX[2] * uY_raw[1],
      uX[2] * uY_raw[0] - uX[0] * uY_raw[2],
      uX[0] * uY_raw[1] - uX[1] * uY_raw[0]
    ];
    const uZ_len = Math.sqrt(uZ[0] * uZ[0] + uZ[1] * uZ[1] + uZ[2] * uZ[2]) || 1.0;
    uZ[0] /= uZ_len;
    uZ[1] /= uZ_len;
    uZ[2] /= uZ_len;

    // 4. Re-orthogonalize uY = uZ x uX
    const uY = [
      uZ[1] * uX[2] - uZ[2] * uX[1],
      uZ[2] * uX[0] - uZ[0] * uX[2],
      uZ[0] * uX[1] - uZ[1] * uX[0]
    ];

    // 3x3 Orthonormal Rotation Matrix R_head
    const rotationMatrix = [
      [uX[0], uY[0], uZ[0]],
      [uX[1], uY[1], uZ[1]],
      [uX[2], uY[2], uZ[2]]
    ];

    // Calculate Euler angles (in degrees):
    // Roll: In-plane tilt of eye line
    const rawRollRad = Math.atan2(dy, dx);
    const rawRollDeg = (this.mirrorMode ? -1 : 1) * ((rawRollRad * 180) / Math.PI);

    // Yaw: Rotation around Y axis.
    const interPupillaryX = Math.abs(rightEye.x - leftEye.x) || 0.05;
    const rawNoseAsymmetry = (nose.x - eyeMidpoint.x) / interPupillaryX;
    const depthYaw = Math.atan2(dz, dx) * (180 / Math.PI);

    // In mirror mode (selfie webcam), turning head right causes nose to move towards lower x in raw camera frame
    const noseAsymmetry = this.mirrorMode ? -rawNoseAsymmetry : rawNoseAsymmetry;
    const effectiveDepthYaw = this.mirrorMode ? -depthYaw : depthYaw;
    const rawYawDeg = effectiveDepthYaw * 0.4 + noseAsymmetry * 45.0;

    // Pitch: Rotation around X axis.
    const neutralNoseY = eyeMidpoint.y + (chin.y - eyeMidpoint.y) * 0.22;
    const nosePitchOffset = (nose.y - neutralNoseY) / faceHeight;
    const depthPitch = Math.atan2(vy_z, vy_y) * (180 / Math.PI);
    const rawPitchDeg = depthPitch * 0.4 + nosePitchOffset * 50.0;

    // Adaptive Double EMA Filter (alpha_fixation=0.18, alpha_saccade=0.88)
    if (this.isFirstFrame) {
      this.smoothedHeadYaw = rawYawDeg;
      this.smoothedHeadPitch = rawPitchDeg;
      this.smoothedHeadRoll = rawRollDeg;
      this.prevRawYaw = rawYawDeg;
      this.prevRawPitch = rawPitchDeg;
      this.prevRawRoll = rawRollDeg;
      this.isFirstFrame = false;
    } else {
      const dYaw = Math.abs(rawYawDeg - this.prevRawYaw);
      const dPitch = Math.abs(rawPitchDeg - this.prevRawPitch);
      const dRoll = Math.abs(rawRollDeg - this.prevRawRoll);
      const maxDelta = Math.max(dYaw, dPitch, dRoll);

      const ratio = Math.min(1.0, maxDelta / this.VELOCITY_THRESHOLD_DEG);
      const alpha = this.ALPHA_FIXATION + (this.ALPHA_SACCADE - this.ALPHA_FIXATION) * (ratio * ratio);

      this.smoothedHeadYaw += (rawYawDeg - this.smoothedHeadYaw) * alpha;
      this.smoothedHeadPitch += (rawPitchDeg - this.smoothedHeadPitch) * alpha;
      this.smoothedHeadRoll += (rawRollDeg - this.smoothedHeadRoll) * alpha;

      this.prevRawYaw = rawYawDeg;
      this.prevRawPitch = rawPitchDeg;
      this.prevRawRoll = rawRollDeg;
    }

    const finalYaw = this.smoothedHeadYaw - this.zeroHeadYaw;
    const finalPitch = this.smoothedHeadPitch - this.zeroHeadPitch;
    const finalRoll = this.smoothedHeadRoll - this.zeroHeadRoll;

    return {
      translation,
      angles: {
        pitchDeg: parseFloat(finalPitch.toFixed(2)),
        yawDeg: parseFloat(finalYaw.toFixed(2)),
        rollDeg: parseFloat(finalRoll.toFixed(2))
      },
      rotationMatrix,
      faceConfidence: Math.min(1.0, Math.max(0.5, eyeDist * 3.5))
    };
  }

  /**
   * Decouples Head-Pose (6-DoF) from Gaze-in-Head (2-DoF) to compute true Gaze-in-World:
   * Gaze_world = R_head * Gaze_eye
   *
   * When user turns head by +15° while staring at the screen, the eye rotates -15° in the head,
   * yielding net Gaze_world ≈ 0° (locked mutual eye contact).
   */
  public decoupleGaze(
    headPose: HeadPoseData,
    eyeYawDeg: number,
    eyePitchDeg: number
  ): DecoupledGazeResult {
    const calibratedEyeYaw = eyeYawDeg - this.zeroEyeYaw;
    const calibratedEyePitch = eyePitchDeg - this.zeroEyePitch;

    const gazeInHead: GazeAngles = {
      yaw: calibratedEyeYaw,
      pitch: calibratedEyePitch,
      roll: 0
    };

    // World gaze = Head orientation + Eye orientation in head
    // (User turning head right while looking straight means eyeYaw < 0, canceling headYaw > 0)
    const worldYawDeg = headPose.angles.yawDeg + calibratedEyeYaw;
    const worldPitchDeg = headPose.angles.pitchDeg + calibratedEyePitch;
    const worldRollDeg = headPose.angles.rollDeg;

    const gazeInWorld: GazeAngles = {
      yaw: parseFloat(worldYawDeg.toFixed(2)),
      pitch: parseFloat(worldPitchDeg.toFixed(2)),
      roll: parseFloat(worldRollDeg.toFixed(2))
    };

    // Calculate 3D unit direction vector in world coordinates
    const yawRad = (worldYawDeg * Math.PI) / 180;
    const pitchRad = (worldPitchDeg * Math.PI) / 180;

    const worldGazeVector: Vector3D = {
      x: parseFloat((Math.sin(yawRad) * Math.cos(pitchRad)).toFixed(3)),
      y: parseFloat((-Math.sin(pitchRad)).toFixed(3)),
      z: parseFloat((-Math.cos(yawRad) * Math.cos(pitchRad)).toFixed(3))
    };

    // Eye Contact Quality Metric (0.0 to 1.0):
    // Angular deviation from 1:1 camera optical center (0°, 0°)
    const angularDeviationDeg = Math.sqrt(worldYawDeg * worldYawDeg + worldPitchDeg * worldPitchDeg);
    // Biological foveal fixation window is ~3.5°
    // At 0° deviation: quality = 1.0 (100%)
    // At 14.2° deviation (off-axis visor cam): quality ≈ 0.11 (11%)
    const quality = Math.max(0.0, Math.min(1.0, 1.0 - (angularDeviationDeg / 16.0)));

    return {
      headPose,
      gazeInHead,
      gazeInWorld,
      worldGazeVector,
      eyeContactQuality: parseFloat(quality.toFixed(3))
    };
  }

  public calibrateZeroPoint(headPose: HeadPoseData, eyeYawDeg: number, eyePitchDeg: number): void {
    this.zeroHeadYaw = this.smoothedHeadYaw;
    this.zeroHeadPitch = this.smoothedHeadPitch;
    this.zeroHeadRoll = this.smoothedHeadRoll;
    this.zeroEyeYaw = eyeYawDeg;
    this.zeroEyePitch = eyePitchDeg;
    this.isCalibrated = true;

    // Centered snapshot in-place for immediate zeroed reading
    headPose.angles.yawDeg = 0.0;
    headPose.angles.pitchDeg = 0.0;
    headPose.angles.rollDeg = 0.0;
  }

  public resetCalibration(): void {
    this.zeroHeadYaw = 0;
    this.zeroHeadPitch = 0;
    this.zeroHeadRoll = 0;
    this.zeroEyeYaw = 0;
    this.zeroEyePitch = 0;
    this.isCalibrated = false;
    this.isFirstFrame = true;
  }

  public getIsCalibrated(): boolean {
    return this.isCalibrated;
  }
}
