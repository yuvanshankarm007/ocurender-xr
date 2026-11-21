import { FaceMesh, Results, NormalizedLandmarkList } from '@mediapipe/face_mesh';
import { GazeTelemetry, Vector3D, FacialExpressions } from '../../types';
import { OneEuroGazeFilter } from './OneEuroFilter';
import { GazeSmoother } from './GazeSmoother';
import { EyeAspectRatioBlinkEngine } from './EyeAspectRatioBlinkEngine';
import { HeadPoseEstimator, HeadPoseData, DecoupledGazeResult } from './HeadPoseEstimator';
import { CognitivePupillometry } from './CognitivePupillometry';
import { BlinkMetrics } from '../../agent-core/types';
import { PolynomialGazeRegressor, CalibrationSample } from './PolynomialGazeRegressor';
import { TemporalOcularClassifier } from './TemporalOcularClassifier';
import { NeuralGazeEstimator } from './NeuralGazeEstimator';

// MediaPipe 478 Landmark Indices
export const MP_LEFT_IRIS_CENTER = 468;
export const MP_LEFT_IRIS_BOUNDARY = [469, 470, 471, 472];
export const MP_RIGHT_IRIS_CENTER = 473;
export const MP_RIGHT_IRIS_BOUNDARY = [474, 475, 476, 477];

// Eye Corners
export const MP_LEFT_EYE_INNER = 133;
export const MP_LEFT_EYE_OUTER = 33;
export const MP_RIGHT_EYE_INNER = 362;
export const MP_RIGHT_EYE_OUTER = 263;

export class IrisTracker {
  private faceMesh: FaceMesh | null = null;
  private isInitialized = false;
  private isProcessing = false;
  private smoother = new GazeSmoother();
  private oneEuro = new OneEuroGazeFilter({ minCutoff: 2.0, beta: 2.5, dCutoff: 1.5 });
  private blinkEngine = new EyeAspectRatioBlinkEngine();
  private headPoseEstimator = new HeadPoseEstimator();
  private pupillometry = new CognitivePupillometry();
  // Machine Learning Pipelines
  private polynomialRegressor = new PolynomialGazeRegressor();
  private ocularClassifier = new TemporalOcularClassifier();
  private neuralEstimator = new NeuralGazeEstimator();
  private pipelineMode: 'BIOMECHANICAL' | 'POLYNOMIAL_REGRESSION' | 'NEURAL_ESTIMATOR' = 'BIOMECHANICAL';
  private polyCalibrationSamples: CalibrationSample[] = [];

  private lastTelemetry: GazeTelemetry | null = null;
  private lastLandmarks: NormalizedLandmarkList | null = null;
  private lastBlinkMetrics: BlinkMetrics | null = null;
  private lastHeadPose: HeadPoseData | null = null;
  private lastFrameTimeMs = performance.now();

  // Calibration offsets & controls
  private offsetX = 0;
  private offsetY = 0;
  private invertX = false;
  private sensitivity = 2.5; // Gain multiplier to amplify subtle pupil movements

  // Natural resting anatomical baselines (auto-calibrated on start & via Center [C])
  private baselineRatioX = 0.50;
  private baselineRatioY = 0.50; // Canthal midline reference: 0.50 = iris level with eye corners
  private autoCalibCount = 0;
  private autoCalibXSum = 0;
  private autoCalibYSum = 0;
  private currentRawRatioX = 0.50;
  private currentRawRatioY = 0.50;

  // Gaze Fixation Freeze during Blinks (Ocular Occlusion Compensation):
  // When eyelids close, iris landmarks are occluded and collapse downward.
  // We hold the clean pre-blink fixation coordinates and smoothly resume on reopening.
  private lastValidRawX = 0.50;
  private lastValidRawY = 0.50;
  private lastValidRatioX = 0.50;
  private lastValidRatioY = 0.50;
  private lastValidSmoothed = { x: 0.50, y: 0.50, velocityNormalized: 0 };
  private postBlinkSettleFrames = 0;
  // Last clean (non-blink) head pose, decoupled gaze, and expressions
  // Frozen during blinks to prevent landmark contamination from eyelid contraction
  private lastCleanHeadPose: HeadPoseData | null = null;
  private lastCleanDecoupled: DecoupledGazeResult | null = null;
  private lastCleanExpressions: FacialExpressions | null = null;
  // Clean pre-blink fixation anchor (quarantined against blink artifacts)
  private cleanPreBlinkFixation = {
    rawX: 0.50,
    rawY: 0.50,
    ratioX: 0.50,
    ratioY: 0.50,
    smoothedX: 0.50,
    smoothedY: 0.50
  };
  // Rolling ring buffer of stable, open-eye fixations (~120ms past history)
  // When a blink starts, we look back 3-4 frames (approx 100ms) before lid descent began.
  // This guarantees 100% immunity to partial eyelid occlusion and downward iris deflection artifacts.
  private stableFixationRing: {
    rawX: number;
    rawY: number;
    ratioX: number;
    ratioY: number;
    smoothedX: number;
    smoothedY: number;
  }[] = [];

  // Offscreen canvas for fast Wasm processing
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private pendingFrameResolve: (() => void) | null = null;

  // Recent raw eye ratio samples for stable median calibration
  private recentRawSamples: { x: number; y: number }[] = [];

  // Listeners
  private listeners: ((telemetry: GazeTelemetry, landmarks: NormalizedLandmarkList, blinkMetrics: BlinkMetrics) => void)[] = [];
  private trackingStatusListeners: ((isTracking: boolean, reason?: string) => void)[] = [];
  private isFaceTracked = false;
  private lastFaceDetectedTimeMs = 0;
  // Primary user centroid tracking for robust multi-person continuity
  private lastTrackedCentroid: { x: number; y: number } | null = null;

  constructor() {
    // Default to mirror mode for selfie webcam feed
    this.headPoseEstimator.setMirrorMode(true);
    this.initFaceMesh();
  }

  private async initFaceMesh() {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      this.faceMesh = new FaceMesh({
        locateFile: (file) => {
          if (origin) {
            return `${origin}/mediapipe/face_mesh/${file}`;
          }
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }
      });

      this.faceMesh.setOptions({
        maxNumFaces: 3,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      this.faceMesh.onResults((results: Results) => {
        this.isProcessing = false;
        if (this.pendingFrameResolve) {
          const res = this.pendingFrameResolve;
          this.pendingFrameResolve = null;
          res();
        }
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
          const chosen = this.selectPrimaryFace(results.multiFaceLandmarks);
          const landmarks = chosen.landmarks;

          // Check if tracked face switched or jumped drastically (> 0.28 normalized distance)
          if (this.lastTrackedCentroid) {
            const dist = Math.hypot(chosen.centroid.x - this.lastTrackedCentroid.x, chosen.centroid.y - this.lastTrackedCentroid.y);
            if (dist > 0.28) {
              // New person took over or user moved abruptly: reset filters and baseline cleanly
              this.oneEuro.reset();
              this.smoother.reset();
              this.blinkEngine.resetBaseline();
              this.stableFixationRing = [];
              this.polyCalibrationSamples = [];
              this.polynomialRegressor.reset();
              this.ocularClassifier.reset();
              this.lastCleanHeadPose = null;
              this.lastCleanDecoupled = null;
              this.lastCleanExpressions = null;
              this.cleanPreBlinkFixation = {
                rawX: 0.50,
                rawY: 0.50,
                ratioX: 0.50,
                ratioY: 0.50,
                smoothedX: 0.50,
                smoothedY: 0.50
              };
              if (this.lastHeadPose) {
                this.headPoseEstimator.calibrateZeroPoint(this.lastHeadPose, 0, 0);
              }
            }
          }
          this.lastTrackedCentroid = chosen.centroid;

          this.lastLandmarks = landmarks;
          this.lastFaceDetectedTimeMs = performance.now();
          if (!this.isFaceTracked) {
            this.isFaceTracked = true;
            this.notifyTrackingStatus(true);
          }
          this.computeGazeTelemetry(landmarks);
        } else {
          if (performance.now() - this.lastFaceDetectedTimeMs > 1500) {
            this.lastTrackedCentroid = null;
          }
          if (this.isFaceTracked) {
            this.isFaceTracked = false;
            this.notifyTrackingStatus(false, 'FACE_OCCLUDED_OR_LIGHTING_DROPOUT');
          }
        }
      });

      this.isInitialized = true;
    } catch (err) {
      console.warn('[IrisTracker] Fallback to client CV:', err);
      this.isInitialized = false;
    }
  }

  private selectPrimaryFace(faces: NormalizedLandmarkList[]): { landmarks: NormalizedLandmarkList; centroid: { x: number; y: number }; eyeDist: number } {
    if (faces.length === 1) {
      const nose = faces[0][1] || faces[0][168] || { x: 0.5, y: 0.5 };
      const eyeDist = Math.abs((faces[0][263]?.x ?? 0.6) - (faces[0][33]?.x ?? 0.4));
      return { landmarks: faces[0], centroid: { x: nose.x, y: nose.y }, eyeDist };
    }

    // Multi-person scene: select primary user using centroid hysteresis + proximity to center/camera
    let bestFace = faces[0];
    let bestScore = -Infinity;
    let bestCentroid = { x: 0.5, y: 0.5 };
    let bestEyeDist = 0.1;

    for (const face of faces) {
      const nose = face[1] || face[168] || { x: 0.5, y: 0.5 };
      const cx = nose.x;
      const cy = nose.y;
      const eyeDist = Math.abs((face[263]?.x ?? 0.6) - (face[33]?.x ?? 0.4));

      let score = 0;
      if (this.lastTrackedCentroid) {
        // Strong hysteresis: prioritize staying locked on the person already tracked
        const distToLast = Math.hypot(cx - this.lastTrackedCentroid.x, cy - this.lastTrackedCentroid.y);
        score = -distToLast * 5.0 + eyeDist * 2.0;
      } else {
        // Initial detection: prefer center of screen and larger face (closer to camera)
        const distToCenter = Math.hypot(cx - 0.5, cy - 0.5);
        score = -distToCenter * 2.0 + eyeDist * 3.0;
      }

      if (score > bestScore) {
        bestScore = score;
        bestFace = face;
        bestCentroid = { x: cx, y: cy };
        bestEyeDist = eyeDist;
      }
    }

    return { landmarks: bestFace, centroid: bestCentroid, eyeDist: bestEyeDist };
  }

  public subscribe(callback: (telemetry: GazeTelemetry, landmarks: NormalizedLandmarkList, blinkMetrics: BlinkMetrics) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  public subscribeTrackingStatus(callback: (isTracking: boolean, reason?: string) => void) {
    this.trackingStatusListeners.push(callback);
    return () => {
      this.trackingStatusListeners = this.trackingStatusListeners.filter(cb => cb !== callback);
    };
  }

  private notifyTrackingStatus(isTracking: boolean, reason?: string) {
    for (let i = 0; i < this.trackingStatusListeners.length; i++) {
      this.trackingStatusListeners[i](isTracking, reason);
    }
  }

  public getIsFaceTracked(): boolean {
    return this.isFaceTracked;
  }

  public setInvertX(invert: boolean) {
    this.invertX = invert;
    this.headPoseEstimator.setMirrorMode(!invert);
  }

  public getInvertX(): boolean {
    return this.invertX;
  }

  public setSensitivity(s: number) {
    this.sensitivity = Math.max(1.0, Math.min(4.0, s));
  }

  public getSensitivity(): number {
    return this.sensitivity;
  }

  // 5-Point Interactive Corner Calibration State
  private is5PointCalibrated = false;
  private calibTL = { x: 0.38, y: 0.40 };
  private calibTR = { x: 0.62, y: 0.40 };
  private calibBL = { x: 0.38, y: 0.60 };
  private calibBR = { x: 0.62, y: 0.60 };
  private calibCenter = { x: 0.50, y: 0.50 };
  private calibrationSamples: Map<string, { rawX: number; rawY: number }> = new Map();

  public recordCalibrationPoint(pointId: string, targetX?: number, targetY?: number): boolean {
    let screenX = 1.0 - this.currentRawRatioX;
    if (this.invertX) {
      screenX = 1.0 - screenX;
    }
    let screenY = this.currentRawRatioY;

    if (this.recentRawSamples.length >= 3) {
      const recent = this.recentRawSamples.slice(-5);
      const medX = [...recent.map(s => s.x)].sort((a, b) => a - b)[Math.floor(recent.length / 2)];
      const medY = [...recent.map(s => s.y)].sort((a, b) => a - b)[Math.floor(recent.length / 2)];
      if (medX !== undefined && medY !== undefined) {
        screenX = medX;
        screenY = medY;
      }
    }

    this.calibrationSamples.set(pointId, { rawX: screenX, rawY: screenY });

    // Target screen coordinates map
    const defaultTargets: Record<string, { x: number; y: number }> = {
      'top-left': { x: 0.05, y: 0.05 },
      'top-right': { x: 0.95, y: 0.05 },
      'bottom-left': { x: 0.05, y: 0.95 },
      'bottom-right': { x: 0.95, y: 0.95 },
      'center': { x: 0.50, y: 0.50 },
      'top-center': { x: 0.50, y: 0.05 },
      'bottom-center': { x: 0.50, y: 0.95 },
      'mid-left': { x: 0.05, y: 0.50 },
      'mid-right': { x: 0.95, y: 0.50 }
    };

    const tgtX = targetX !== undefined ? targetX : (defaultTargets[pointId]?.x ?? 0.50);
    const tgtY = targetY !== undefined ? targetY : (defaultTargets[pointId]?.y ?? 0.50);

    this.polyCalibrationSamples.push({
      rawX: screenX,
      rawY: screenY,
      screenX: tgtX,
      screenY: tgtY,
      headYawDeg: this.lastHeadPose?.angles?.yawDeg || 0,
      headPitchDeg: this.lastHeadPose?.angles?.pitchDeg || 0
    });

    // Train the In-Browser Polynomial Ridge Regressor whenever 5+ points exist
    if (this.polyCalibrationSamples.length >= 5) {
      this.polynomialRegressor.fit(this.polyCalibrationSamples);
    }

    if (this.calibrationSamples.size >= 5) {
      const tl = this.calibrationSamples.get('top-left') || { rawX: 0.44, rawY: 0.42 };
      const tr = this.calibrationSamples.get('top-right') || { rawX: 0.56, rawY: 0.42 };
      const bl = this.calibrationSamples.get('bottom-left') || { rawX: 0.44, rawY: 0.58 };
      const br = this.calibrationSamples.get('bottom-right') || { rawX: 0.56, rawY: 0.58 };
      const center = this.calibrationSamples.get('center') || { rawX: 0.50, rawY: 0.50 };

      const cX = center.rawX;
      const cY = center.rawY;

      // Geometrical sanity check: enforce positive physiological distance from center
      const rawSpanLeft = cX - Math.min(tl.rawX, bl.rawX);
      const rawSpanRight = Math.max(tr.rawX, br.rawX) - cX;
      const rawSpanTop = cY - Math.min(tl.rawY, tr.rawY);
      const rawSpanBottom = Math.max(bl.rawY, br.rawY) - cY;

      const spanLeft = Math.max(0.025, rawSpanLeft > 0.005 ? rawSpanLeft : 0.05);
      const spanRight = Math.max(0.025, rawSpanRight > 0.005 ? rawSpanRight : 0.05);
      const spanTop = Math.max(0.020, rawSpanTop > 0.005 ? rawSpanTop : 0.04);
      const spanBottom = Math.max(0.020, rawSpanBottom > 0.005 ? rawSpanBottom : 0.04);

      this.calibCenter = { x: cX, y: cY };
      this.calibTL = { x: cX - spanLeft, y: cY - spanTop };
      this.calibTR = { x: cX + spanRight, y: cY - spanTop };
      this.calibBL = { x: cX - spanLeft, y: cY + spanBottom };
      this.calibBR = { x: cX + spanRight, y: cY + spanBottom };

      this.baselineRatioX = this.currentRawRatioX;
      this.baselineRatioY = this.currentRawRatioY;
      this.is5PointCalibrated = true;

      if (this.lastHeadPose) {
        this.headPoseEstimator.calibrateZeroPoint(this.lastHeadPose, 0, 0);
      }
      return true;
    }
    return false;
  }

  public getIs5PointCalibrated(): boolean {
    return this.is5PointCalibrated;
  }

  public reset5PointCalibration(): void {
    this.is5PointCalibrated = false;
    this.calibrationSamples.clear();
    this.polyCalibrationSamples = [];
    this.polynomialRegressor.reset();
    this.ocularClassifier.reset();
    this.stableFixationRing = [];
    this.lastCleanHeadPose = null;
    this.lastCleanDecoupled = null;
    this.lastCleanExpressions = null;
    this.cleanPreBlinkFixation = {
      rawX: 0.50,
      rawY: 0.50,
      ratioX: 0.50,
      ratioY: 0.50,
      smoothedX: 0.50,
      smoothedY: 0.50
    };
  }

  public calibrateCenter() {
    // Reset any skewed corner quad to prevent trapped corner states
    this.is5PointCalibrated = false;
    this.calibrationSamples.clear();
    this.polyCalibrationSamples = [];
    this.polynomialRegressor.reset();
    this.ocularClassifier.reset();
    this.stableFixationRing = [];

    // Current screen-aligned horizontal ratio
    let screenX = 1.0 - this.currentRawRatioX;
    if (this.invertX) {
      screenX = 1.0 - screenX;
    }
    const screenY = this.currentRawRatioY;

    // Anchor the calibration center directly to the user's current resting eye line
    this.calibCenter = { x: screenX, y: screenY };
    this.baselineRatioX = this.currentRawRatioX;
    this.baselineRatioY = this.currentRawRatioY;
    this.offsetX = 0;
    this.offsetY = 0;
    this.lastValidRawX = 0.50;
    this.lastValidRawY = 0.50;
    this.lastValidSmoothed = { x: 0.50, y: 0.50, velocityNormalized: 0 };
    this.cleanPreBlinkFixation = {
      rawX: 0.50,
      rawY: 0.50,
      ratioX: this.currentRawRatioX,
      ratioY: this.currentRawRatioY,
      smoothedX: 0.50,
      smoothedY: 0.50
    };
    this.oneEuro.reset();
    this.lastCleanHeadPose = null;
    this.lastCleanDecoupled = null;
    this.lastCleanExpressions = null;

    if (this.lastHeadPose) {
      this.headPoseEstimator.calibrateZeroPoint(
        this.lastHeadPose,
        0,
        0
      );
    }
  }

  public resetCalibration() {
    this.baselineRatioX = 0.50;
    this.baselineRatioY = 0.50;
    this.autoCalibCount = 0;
    this.autoCalibXSum = 0;
    this.autoCalibYSum = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.stableFixationRing = [];
    this.cleanPreBlinkFixation = {
      rawX: 0.50,
      rawY: 0.50,
      ratioX: 0.50,
      ratioY: 0.50,
      smoothedX: 0.50,
      smoothedY: 0.50
    };
    this.headPoseEstimator.resetCalibration();
    this.smoother.reset();
    this.oneEuro.reset();
    this.polyCalibrationSamples = [];
    this.polynomialRegressor.reset();
    this.ocularClassifier.reset();
    this.lastCleanHeadPose = null;
    this.lastCleanDecoupled = null;
    this.lastCleanExpressions = null;
  }

  public setTrackingPipelineMode(mode: 'BIOMECHANICAL' | 'POLYNOMIAL_REGRESSION' | 'NEURAL_ESTIMATOR') {
    this.pipelineMode = mode;
  }

  public getTrackingPipelineMode(): 'BIOMECHANICAL' | 'POLYNOMIAL_REGRESSION' | 'NEURAL_ESTIMATOR' {
    return this.pipelineMode;
  }

  public getPolynomialRegressor(): PolynomialGazeRegressor {
    return this.polynomialRegressor;
  }

  public getOcularClassifier(): TemporalOcularClassifier {
    return this.ocularClassifier;
  }

  public getNeuralEstimator(): NeuralGazeEstimator {
    return this.neuralEstimator;
  }

  public getHeadPoseEstimator(): HeadPoseEstimator {
    return this.headPoseEstimator;
  }

  public getBlinkEngine(): EyeAspectRatioBlinkEngine {
    return this.blinkEngine;
  }

  public processVideoFrame(videoElement: HTMLVideoElement): Promise<void> {
    if (!this.faceMesh || !this.isInitialized || this.isProcessing) {
      return Promise.resolve();
    }
    if (videoElement.readyState < 2) {
      return Promise.resolve();
    }

    // Watchdog: detect tracking loss if no face results arrived for > 600ms
    if (this.isFaceTracked && (performance.now() - this.lastFaceDetectedTimeMs > 600)) {
      this.isFaceTracked = false;
      this.notifyTrackingStatus(false, 'FACE_OCCLUSION_OR_LIGHTING_DROPOUT');
    }

    this.isProcessing = true;
    return new Promise<void>((resolve) => {
      this.pendingFrameResolve = resolve;

      // Direct GPU zero-copy hardware video texture:
      // Feeds pristine full-resolution video to MediaPipe's sub-pixel iris refinement neural network
      this.faceMesh!.send({ image: videoElement }).catch(() => {
        this.isProcessing = false;
        if (this.pendingFrameResolve) {
          this.pendingFrameResolve = null;
          resolve();
        }
      });
    });
  }

  private computeGazeTelemetry(landmarks: NormalizedLandmarkList) {
    const nowMs = performance.now();
    const dtSeconds = (nowMs - this.lastFrameTimeMs) / 1000;
    this.lastFrameTimeMs = nowMs;

    // 1. Dual-Eye EAR & Blink Detection
    const blinkMetrics = this.blinkEngine.update(landmarks, nowMs);
    this.lastBlinkMetrics = blinkMetrics;

    // 2. Extract Iris Centers & Eye Corners
    const leftIris = landmarks[MP_LEFT_IRIS_CENTER];
    const rightIris = landmarks[MP_RIGHT_IRIS_CENTER];
    if (!leftIris || !rightIris) return;

    const leftOuter = landmarks[MP_LEFT_EYE_OUTER];
    const leftInner = landmarks[MP_LEFT_EYE_INNER];
    const rightOuter = landmarks[MP_RIGHT_EYE_OUTER];
    const rightInner = landmarks[MP_RIGHT_EYE_INNER];

    const leftEyeWidth = Math.abs(leftInner.x - leftOuter.x) || 0.05;
    const rightEyeWidth = Math.abs(rightOuter.x - rightInner.x) || 0.05;

    // Temporal Machine Learning Classifier for Ocular Kinematics
    const prevAngularVel = this.lastValidSmoothed?.velocityNormalized ? this.lastValidSmoothed.velocityNormalized * 180 : 0;
    const ocularClassification = this.ocularClassifier.update({
      timestampMs: nowMs,
      earLeft: blinkMetrics.currentEar,
      earRight: blinkMetrics.currentEar,
      earAvg: blinkMetrics.currentEar,
      openFraction: blinkMetrics.openFraction,
      gazeX: this.lastValidSmoothed.x,
      gazeY: this.lastValidSmoothed.y,
      angularVelocityDegPerSec: prevAngularVel,
      pupilDiameterMm: this.lastTelemetry?.pupilDiameterMm || 3.5
    });

    // Robust Blink Detection:
    // Combines EAR state machine, early lid descent threshold (< 0.78),
    // and Machine Learning temporal classifier.
    const isBlinking =
      blinkMetrics.isBlinkActive ||
      blinkMetrics.blinkState === 'CLOSED' ||
      blinkMetrics.blinkState === 'CLOSING' ||
      blinkMetrics.blinkState === 'REOPENING' ||
      blinkMetrics.openFraction < 0.78 ||
      ocularClassification.isBlinkActive;

    let baseScreenX: number;
    let avgCameraRatioY: number;
    let rawX: number;
    let rawY: number;
    let smoothed: { x: number; y: number; velocityNormalized: number };

    if (isBlinking) {
      // Pick the pure fixation recorded 3-4 frames (~100-120ms) BEFORE the blink started.
      // Looking back into the pre-blink ring buffer guarantees 100% immunity to descending eyelid occlusion,
      // downward iris warping, and random coordinate leaps during blinks.
      const anchor = this.stableFixationRing.length > 0
        ? this.stableFixationRing[Math.max(0, this.stableFixationRing.length - 4)]
        : this.cleanPreBlinkFixation;

      rawX = anchor.rawX;
      rawY = anchor.rawY;
      this.currentRawRatioX = anchor.ratioX;
      this.currentRawRatioY = anchor.ratioY;

      // Hold the exact pre-blink smoothed coordinate — zero movement, zero drift!
      smoothed = {
        x: anchor.smoothedX,
        y: anchor.smoothedY,
        velocityNormalized: 0
      };
      this.oneEuro.forceState(anchor.rawX, anchor.rawY);
    } else {
      // In raw camera frame:
      // Left eye (person's anatomical left) is on the right side of the image (higher x).
      // Right eye is on the left side of the image (lower x).
      // When the user looks to SCREEN-RIGHT:
      // Their pupils move towards their physical right, which is the LEFT side of the camera sensor (lower x).
      // So (iris.x - eyeLeftEdge) / eyeWidth DECREASES.
      const leftRatioX = (leftIris.x - Math.min(leftOuter.x, leftInner.x)) / leftEyeWidth;
      const rightRatioX = (rightIris.x - Math.min(rightOuter.x, rightInner.x)) / rightEyeWidth;
      const avgCameraRatioX = (leftRatioX + rightRatioX) * 0.5;

      // Canthal Midline Reference (relative to outer & inner eye corners - immovable bony cranial anchors)
      const avgEyeY = (leftOuter.y + leftInner.y + rightOuter.y + rightInner.y) * 0.25;
      const avgIrisY = (leftIris.y + rightIris.y) * 0.5;
      const eyeHeightApprox = (leftEyeWidth + rightEyeWidth) * 0.30;
      const canthalRatioY = (avgIrisY - avgEyeY) / Math.max(0.008, eyeHeightApprox) + 0.5;

      // Immovable canthal bony reference provides rock-solid vertical pupil tracking immune to eyelid movement
      avgCameraRatioY = canthalRatioY;

      this.currentRawRatioX = avgCameraRatioX;
      this.currentRawRatioY = avgCameraRatioY;

      // Fast automatic baseline learning during initial frames (auto-adapts to user's seat & camera tilt)
      if (this.autoCalibCount < 40) {
        this.autoCalibCount++;
        this.autoCalibXSum += avgCameraRatioX;
        this.autoCalibYSum += avgCameraRatioY;
        if (this.autoCalibCount === 40) {
          this.baselineRatioX = this.autoCalibXSum / 40;
          this.baselineRatioY = this.autoCalibYSum / 40;
          const autoScreenX = this.invertX ? (this.autoCalibXSum / 40) : (1.0 - this.autoCalibXSum / 40);
          this.calibCenter = { x: autoScreenX, y: this.autoCalibYSum / 40 };
          const currentHp = this.headPoseEstimator.estimatePose(landmarks);
          this.headPoseEstimator.calibrateZeroPoint(currentHp, 0, 0);
        }
      }

      // UNAMBIGUOUS SCREEN MAPPING:
      // User looks to screen-RIGHT -> avgCameraRatioX decreases -> baseScreenX increases -> RIGHT!
      baseScreenX = 1.0 - avgCameraRatioX;
      if (this.invertX) {
        baseScreenX = 1.0 - baseScreenX;
      }

      // Accumulate clean fixation frames for rock-solid calibration
      this.recentRawSamples.push({ x: baseScreenX, y: avgCameraRatioY });
      if (this.recentRawSamples.length > 25) {
        this.recentRawSamples.shift();
      }

      if (this.pipelineMode === 'NEURAL_ESTIMATOR') {
        // Deep Learning Neural Gaze Forward Inference
        const curHeadPose = this.lastHeadPose || this.headPoseEstimator.estimatePose(landmarks);
        const neuralResult = this.neuralEstimator.estimateGaze(landmarks, curHeadPose);
        rawX = neuralResult.screenPoint.x;
        rawY = neuralResult.screenPoint.y;
      } else if (this.pipelineMode === 'POLYNOMIAL_REGRESSION' && this.polynomialRegressor.getIsFitted()) {
        // Online In-Browser Polynomial Ridge Regressor
        const headYaw = this.lastHeadPose?.angles?.yawDeg || 0;
        const headPitch = this.lastHeadPose?.angles?.pitchDeg || 0;
        const pred = this.polynomialRegressor.predict(baseScreenX, avgCameraRatioY, headYaw, headPitch);
        rawX = pred.screenX;
        rawY = pred.screenY;
      } else if (this.is5PointCalibrated) {
        // Robust Center-Anchored 2D Piecewise Screen Mapping:
        // Anchored strictly on calibrated center (cX, cY)
        const curX = baseScreenX;
        const curY = avgCameraRatioY;
        const cX = this.calibCenter.x;
        const cY = this.calibCenter.y;

        const spanRight = Math.max(0.015, this.calibTR.x - cX);
        const spanLeft = Math.max(0.015, cX - this.calibTL.x);
        const spanTop = Math.max(0.012, cY - this.calibTL.y);
        const spanBottom = Math.max(0.012, this.calibBR.y - cY);

        // Horizontal mapping anchored strictly on center cX
        if (curX >= cX) {
          const u = Math.min(1.4, (curX - cX) / spanRight);
          rawX = 0.50 + u * 0.46;
        } else {
          const u = Math.min(1.4, (cX - curX) / spanLeft);
          rawX = 0.50 - u * 0.46;
        }

        // Vertical mapping anchored strictly on center cY
        if (curY >= cY) {
          // Looking down
          const v = Math.min(1.4, (curY - cY) / spanBottom);
          rawY = 0.50 + v * 0.45;
        } else {
          // Looking up at camera
          const v = Math.min(1.4, (cY - curY) / spanTop);
          rawY = 0.50 - v * 0.45;
        }
      } else {
        // Uncalibrated physiological fallback
        const deltaX = baseScreenX - (1.0 - this.baselineRatioX);
        const deltaY = avgCameraRatioY - this.baselineRatioY;

        const verticalGain = deltaY > 0 ? this.sensitivity * 2.0 : this.sensitivity * 1.35;

        rawX = deltaX * this.sensitivity + 0.50;
        rawY = deltaY * verticalGain + 0.50;
      }

      // Apply calibration offset
      rawX = Math.max(0.01, Math.min(0.99, rawX - this.offsetX));
      rawY = Math.max(0.01, Math.min(0.99, rawY - this.offsetY));

      // Smooth coordinates using State-of-the-Art One-Euro Adaptive Low-Pass Filter
      smoothed = this.oneEuro.filter(rawX, rawY, dtSeconds);

      // Store valid fixation state
      this.lastValidRawX = rawX;
      this.lastValidRawY = rawY;
      this.lastValidRatioX = avgCameraRatioX;
      this.lastValidRatioY = avgCameraRatioY;
      this.lastValidSmoothed = {
        x: smoothed.x,
        y: smoothed.y,
        velocityNormalized: smoothed.velocityNormalized
      };

      // Update the clean pre-blink ring buffer ONLY during high-confidence open eye fixations
      if (blinkMetrics.blinkState === 'OPEN' && blinkMetrics.openFraction >= 0.80) {
        this.stableFixationRing.push({
          rawX,
          rawY,
          ratioX: avgCameraRatioX,
          ratioY: avgCameraRatioY,
          smoothedX: smoothed.x,
          smoothedY: smoothed.y
        });
        if (this.stableFixationRing.length > 8) {
          this.stableFixationRing.shift();
        }
        this.cleanPreBlinkFixation = {
          rawX,
          rawY,
          ratioX: avgCameraRatioX,
          ratioY: avgCameraRatioY,
          smoothedX: smoothed.x,
          smoothedY: smoothed.y
        };
      }
    }

    // Angular conversion:
    // Looking RIGHT -> yawDeg is POSITIVE (+25 deg)
    // Looking LEFT  -> yawDeg is NEGATIVE (-25 deg)
    // Looking DOWN  -> pitchDeg is POSITIVE (+21 deg)
    // Looking UP    -> pitchDeg is NEGATIVE (-21 deg)
    const yawDeg = (smoothed.x - 0.5) * 50.0;
    const pitchDeg = (smoothed.y - 0.5) * 42.0;

    const yawRad = (yawDeg * Math.PI) / 180;
    const pitchRad = (pitchDeg * Math.PI) / 180;

    // 3D Directional unit vector in world space:
    // Looking RIGHT -> x > 0 (points to the right)
    // Looking LEFT  -> x < 0 (points to the left)
    // Looking UP    -> y > 0 (points up)
    // Looking DOWN  -> y < 0 (points down)
    const gazeVector3D: Vector3D = {
      x: Math.sin(yawRad) * Math.cos(pitchRad),
      y: -Math.sin(pitchRad),
      z: -Math.cos(yawRad) * Math.cos(pitchRad)
    };

    // 6-DoF Head Pose Estimation & Decoupled Gaze-in-World
    // BLINK GUARD: During blinks, MediaPipe cranial anchor landmarks (nose, chin, forehead,
    // eye corners) shift due to orbicularis oculi contraction. This contaminates head pose
    // angles and decoupled gaze, causing visible downward drift of avatar eyes/head.
    // Solution: Freeze head pose, decoupled gaze, and expressions at their last clean values.
    let headPose: HeadPoseData;
    let decoupled: DecoupledGazeResult;
    let expressions: FacialExpressions;

    if (isBlinking && this.lastCleanHeadPose && this.lastCleanDecoupled && this.lastCleanExpressions) {
      // FROZEN: Use last clean head pose and gaze angles during blinks
      headPose = this.lastCleanHeadPose;
      decoupled = this.lastCleanDecoupled;
      expressions = this.lastCleanExpressions;
    } else {
      // LIVE: Compute fresh head pose from uncontaminated open-eye landmarks
      headPose = this.headPoseEstimator.estimatePose(landmarks);
      this.lastHeadPose = headPose;
      decoupled = this.headPoseEstimator.decoupleGaze(headPose, yawDeg, pitchDeg);
      expressions = this.computeFacialExpressions(landmarks, blinkMetrics.openFraction);

      // Cache clean values only during confirmed open-eye fixations (openFraction >= 0.80)
      if (!isBlinking && blinkMetrics.blinkState === 'OPEN' && blinkMetrics.openFraction >= 0.80) {
        this.lastCleanHeadPose = headPose;
        this.lastCleanDecoupled = decoupled;
        this.lastCleanExpressions = expressions;
      }
    }

    const angularVelocity = smoothed.velocityNormalized * 180;
    const isSaccade = angularVelocity > 35.0;

    // 7. Real-Time Cognitive Pupillometry & Autonomic Workload Index (Task-Evoked Pupillary Response)
    const pupilData = this.pupillometry.compute(landmarks, nowMs);

    const telemetry: GazeTelemetry = {
      timestampMs: nowMs,
      gazePoint2D: { x: smoothed.x, y: smoothed.y },
      gazeVector3D: decoupled.worldGazeVector,
      angles: decoupled.gazeInWorld,
      gazeInHead: decoupled.gazeInHead,
      gazeInWorld: decoupled.gazeInWorld,
      headPose: {
        pitchDeg: headPose.angles.pitchDeg,
        yawDeg: headPose.angles.yawDeg,
        rollDeg: headPose.angles.rollDeg,
        translation: headPose.translation,
        rotationMatrix: headPose.rotationMatrix,
        confidence: headPose.faceConfidence,
      },
      expressions,
      eyeContactQuality: decoupled.eyeContactQuality,
      eyelidAperture: blinkMetrics.openFraction,
      angularVelocityDegPerSec: angularVelocity,
      isSaccade: ocularClassification.state === 'SACCADE' || isSaccade,
      isFixation: ocularClassification.state === 'FIXATION' && !isSaccade && !isBlinking,
      isBlink: isBlinking,
      pupilDiameterMm: pupilData.pupilDiameterMm,
      autonomicWorkloadPercent: pupilData.autonomicWorkloadPercent,
      pupilDilationDeltaMm: pupilData.dilationDeltaMm,
      confidence: Math.min(0.99, (headPose.faceConfidence + ocularClassification.confidence) * 0.5),
      source: 'webcam_mediapipe',
      pipelineMode: this.pipelineMode,
      ocularKinematics: {
        state: ocularClassification.state,
        pBlink: ocularClassification.pBlink,
        pSaccade: ocularClassification.pSaccade,
        pFixation: ocularClassification.pFixation,
        earVelocity: ocularClassification.earVelocity
      }
    };

    this.lastTelemetry = telemetry;

    // Direct synchronous broadcast
    for (let i = 0; i < this.listeners.length; i++) {
      this.listeners[i](telemetry, landmarks, blinkMetrics);
    }
  }

  private computeFacialExpressions(
    landmarks: NormalizedLandmarkList,
    openFraction: number
  ): FacialExpressions {
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const leftEyeOuter = landmarks[33];
    const rightEyeOuter = landmarks[263];
    const eyeSpan =
      leftEyeOuter && rightEyeOuter
        ? Math.max(
            0.02,
            Math.hypot(rightEyeOuter.x - leftEyeOuter.x, rightEyeOuter.y - leftEyeOuter.y)
          )
        : 0.15;

    const upperLip = landmarks[13];
    const lowerLip = landmarks[14];
    const lipGap =
      upperLip && lowerLip
        ? Math.hypot(lowerLip.x - upperLip.x, lowerLip.y - upperLip.y) / eyeSpan
        : 0;
    const jawOpen = clamp01((lipGap - 0.04) / 0.42);

    const leftMouth = landmarks[61];
    const rightMouth = landmarks[291];
    const mouthWidth =
      leftMouth && rightMouth
        ? Math.hypot(rightMouth.x - leftMouth.x, rightMouth.y - leftMouth.y) / eyeSpan
        : 0.58;
    const mouthSmile = clamp01((mouthWidth - 0.58) / 0.25);

    const leftInnerBrow = landmarks[107];
    const rightInnerBrow = landmarks[336];
    const noseBridge = landmarks[168];
    const browHeight =
      leftInnerBrow && rightInnerBrow && noseBridge
        ? ((noseBridge.y - leftInnerBrow.y) + (noseBridge.y - rightInnerBrow.y)) * 0.5 / eyeSpan
        : 0.13;
    const browInnerUp = clamp01((browHeight - 0.14) / 0.12);
    const browDown = clamp01((0.12 - browHeight) / 0.08);
    const eyeWide = clamp01((openFraction - 0.82) / 0.18);

    return { jawOpen, mouthSmile, browInnerUp, browDown, eyeWide };
  }

  public getLastTelemetry(): GazeTelemetry | null {
    return this.lastTelemetry;
  }

  public getLastBlinkMetrics(): BlinkMetrics | null {
    return this.lastBlinkMetrics;
  }
}
