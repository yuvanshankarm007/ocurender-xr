// Core type definitions for OcuRender XR

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface GazeAngles {
  pitch: number; // Vertical angle in degrees (-up, +down)
  yaw: number;   // Horizontal angle in degrees (-left, +right)
  roll?: number; // Torsional angle
}

export interface EyeLandmarks {
  irisCenter: Vector3D;
  pupilRadius: number;
  eyelidOpening: number; // 0.0 (closed) to 1.0 (fully open)
  landmarks: Vector3D[]; // 10 iris + eyelid keypoints
}

export interface DualEyeState {
  leftEye: EyeLandmarks;
  rightEye: EyeLandmarks;
  vergenceDistanceMm: number; // Distance in mm where sightlines converge
  interpupillaryDistanceMm: number; // IPD typically 62-65mm
}

export interface HeadPoseTelemetry {
  pitchDeg: number;
  yawDeg: number;
  rollDeg: number;
  translation: Vector3D;
  rotationMatrix?: number[][];
  confidence: number;
}

export interface FacialExpressions {
  jawOpen: number;      // 0..1
  mouthSmile: number;   // 0..1
  browInnerUp: number;  // 0..1
  browDown: number;     // 0..1
  eyeWide: number;      // 0..1
}

export interface GazeTelemetry {
  timestampMs: number;
  gazePoint2D: { x: number; y: number }; // Normalized screen coords [0, 1]
  gazeVector3D: Vector3D; // Normalized 3D directional vector
  angles: GazeAngles;
  angularVelocityDegPerSec: number;
  isSaccade: boolean;
  isFixation: boolean;
  isBlink: boolean;
  eyelidAperture: number; // 0.0 (closed) to 1.0 (fully open) continuous
  headPose?: HeadPoseTelemetry;
  expressions?: FacialExpressions;
  gazeInHead?: GazeAngles;
  gazeInWorld?: GazeAngles;
  eyeContactQuality?: number; // 0.0 to 1.0 (1.0 = locked mutual eye contact)
  pupilDiameterMm: number;
  autonomicWorkloadPercent?: number; // 0 to 100% cognitive effort
  pupilDilationDeltaMm?: number; // Phasic dilation in mm (TEPR)
  confidence: number; // 0.0 to 1.0
  source: 'webcam_mediapipe' | 'biomechanical_synth' | 'mock_fallback';
  pipelineMode?: 'BIOMECHANICAL' | 'POLYNOMIAL_REGRESSION' | 'NEURAL_ESTIMATOR';
  ocularKinematics?: {
    state: string;
    pBlink: number;
    pSaccade: number;
    pFixation: number;
    earVelocity: number;
  };
}

export interface SaccadeKinematics {
  amplitudeDeg: number;
  durationMs: number;
  peakVelocityDegPerSec: number;
  trajectory: { t: number; x: number; y: number; velocity: number }[];
}

export interface FoveatedSettings {
  enabled: boolean;
  foveaRadiusDeg: number;       // Central high-res radius (default: 2.5 deg)
  parafoveaRadiusDeg: number;   // Blend zone radius (default: 5.0 deg)
  peripheralSamplingRate: number; // E.g., 0.25 (1/4 resolution)
  blurStrength: number;         // Gaussian blur radius in periphery
  visualizeFoveaCone: boolean;  // Debug ring overlay
  depthOfFieldEnabled: boolean;
  focalDepthMeters: number;
}

export interface GPUWorkloadStats {
  nativePixelCount: number;
  foveatedEffectivePixels: number;
  pixelShadingReductionPercent: number; // e.g. 64.2%
  framerateFps: number;
  renderLatencyMs: number;
}

export type CognitiveState = 
  | 'reading'        // Small horizontal saccades with return sweeps
  | 'conversational' // Gaze centered on face with social micro-saccades
  | 'visual_search'  // Large exploratory saccades across peripheral objects
  | 'daydreaming';   // Slow drifting gaze with low velocity micro-movements
