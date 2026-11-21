import React, { useRef, useEffect, useState } from 'react';
import { Camera, CameraOff, RefreshCw, FlipHorizontal, Target, ArrowRight, ArrowLeft, ArrowDown, ArrowUp, EyeOff } from 'lucide-react';
import { IrisTracker, MP_LEFT_IRIS_CENTER, MP_LEFT_IRIS_BOUNDARY, MP_RIGHT_IRIS_CENTER, MP_RIGHT_IRIS_BOUNDARY } from '../core/vision/IrisTracker';
import { GazeTelemetry } from '../types';
import { NormalizedLandmarkList } from '@mediapipe/face_mesh';
import { BlinkMetrics } from '../agent-core/types';

interface LiveCameraFeedProps {
  tracker: IrisTracker;
  isLiveMode: boolean;
  blinkMetrics: BlinkMetrics;
}

export const LiveCameraFeed: React.FC<LiveCameraFeedProps> = ({ tracker, isLiveMode, blinkMetrics }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [hasCameraAccess, setHasCameraAccess] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [invertX, setInvertX] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [gazeDirectionLabel, setGazeDirectionLabel] = useState<'CENTER' | 'RIGHT' | 'LEFT' | 'DOWN' | 'UP' | 'BLINK'>('CENTER');

  const lastDirectionRef = useRef<'CENTER' | 'RIGHT' | 'LEFT' | 'DOWN' | 'UP' | 'BLINK'>('CENTER');

  useEffect(() => {
    const unsubscribe = tracker.subscribe((telemetry, landmarks, bMetrics) => {
      renderLandmarkOverlay(landmarks, telemetry, bMetrics);

      let nextDirection: 'CENTER' | 'RIGHT' | 'LEFT' | 'DOWN' | 'UP' | 'BLINK' = 'CENTER';

      if (bMetrics.isBlinkActive || telemetry.isBlink) {
        nextDirection = 'BLINK';
      } else if (telemetry.angles.pitch > 7.0) {
        nextDirection = 'DOWN';
      } else if (telemetry.angles.pitch < -7.0) {
        nextDirection = 'UP';
      } else if (telemetry.angles.yaw > 7.0) {
        nextDirection = 'RIGHT';
      } else if (telemetry.angles.yaw < -7.0) {
        nextDirection = 'LEFT';
      } else {
        nextDirection = 'CENTER';
      }

      if (nextDirection !== lastDirectionRef.current) {
        lastDirectionRef.current = nextDirection;
        setGazeDirectionLabel(nextDirection);
      }
    });

    startWebcam();

    return () => {
      unsubscribe();
      stopWebcam();
    };
  }, [tracker]);

  const startWebcam = async () => {
    try {
      setErrorMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 640 },
          height: { ideal: 480, max: 480 },
          facingMode: 'user',
          frameRate: { ideal: 30, max: 30 }
        },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setHasCameraAccess(true);
        };
      }
    } catch (err) {
      console.warn('[Camera] Webcam access denied. Using resilient fallback:', err);
      setHasCameraAccess(false);
      setErrorMessage('Camera access ungranted. Resilient simulated scanpath active.');
    }
  };

  const stopWebcam = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!isLiveMode || !hasCameraAccess) return;

    let isProcessing = false;
    let isDisposed = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    // Decoupled asynchronous inference loop:
    // Completely frees Chrome's video compositor and main thread from long-running callback stalls,
    // allowing Three.js and the UI to render at a smooth, unhindered 60 FPS!
    const runInferenceCycle = async () => {
      if (isDisposed) return;
      const video = videoRef.current;

      if (video && !isProcessing && video.readyState >= 2 && !video.paused) {
        isProcessing = true;
        try {
          await tracker.processVideoFrame(video);
        } catch {
          // Resilient frame fallback
        } finally {
          isProcessing = false;
        }
      }

      if (!isDisposed) {
        // Fast-paced inference loop matching 30 FPS camera for zero-lag ocular response
        timerId = setTimeout(runInferenceCycle, 16);
      }
    };

    // Kick off decoupled background inference
    timerId = setTimeout(runInferenceCycle, 60);

    return () => {
      isDisposed = true;
      if (timerId !== null) {
        clearTimeout(timerId);
      }
    };
  }, [isLiveMode, hasCameraAccess, tracker]);

  const toggleInvert = () => {
    const next = !invertX;
    setInvertX(next);
    tracker.setInvertX(next);
  };

  const handleCalibrate = () => {
    tracker.calibrateCenter();
    setIsCalibrated(true);
    setTimeout(() => setIsCalibrated(false), 2000);
  };

  const renderLandmarkOverlay = (
    landmarks: NormalizedLandmarkList,
    telemetry: GazeTelemetry,
    bMetrics: BlinkMetrics
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Skip 2D canvas blits when in fullscreen to preserve 100% GPU fill rate
    if (document.fullscreenElement) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width;
    const h = canvas.height;

    const isBlinking = bMetrics.isBlinkActive;

    // Draw Left Iris Boundary
    ctx.beginPath();
    MP_LEFT_IRIS_BOUNDARY.forEach((idx, i) => {
      const pt = landmarks[idx];
      if (pt) {
        const x = pt.x * w;
        const y = pt.y * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.fillStyle = isBlinking ? 'rgba(168, 85, 247, 0.4)' : 'rgba(0, 242, 254, 0.35)';
    ctx.fill();
    ctx.strokeStyle = isBlinking ? '#c084fc' : '#00f2fe';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw Right Iris Boundary
    ctx.beginPath();
    MP_RIGHT_IRIS_BOUNDARY.forEach((idx, i) => {
      const pt = landmarks[idx];
      if (pt) {
        const x = pt.x * w;
        const y = pt.y * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.fillStyle = isBlinking ? 'rgba(168, 85, 247, 0.4)' : 'rgba(0, 242, 254, 0.35)';
    ctx.fill();
    ctx.strokeStyle = isBlinking ? '#c084fc' : '#00f2fe';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw Gaze Rays
    // NOTE: Canvas is mirrored with CSS `-scale-x-100`.
    // When looking to screen-RIGHT (vx > 0), drawing (cx - vx*rayLen) puts it to the left on the canvas,
    // which `-scale-x-100` flips to the RIGHT on the user's screen!
    const drawRay = (centerIdx: number) => {
      const center = landmarks[centerIdx];
      if (!center) return;
      const cx = center.x * w;
      const cy = center.y * h;

      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = isBlinking ? '#c084fc' : '#00ff87';
      ctx.fill();

      const rayLen = 45;
      const rx = cx - telemetry.gazeVector3D.x * rayLen;
      const ry = cy - telemetry.gazeVector3D.y * rayLen;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(rx, ry);
      ctx.strokeStyle = isBlinking ? '#c084fc' : '#00ff87';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    };

    drawRay(MP_LEFT_IRIS_CENTER);
    drawRay(MP_RIGHT_IRIS_CENTER);
  };

  return (
    <div className={`border rounded-2xl overflow-hidden flex flex-col shadow-xl transition-all ${
      blinkMetrics.isBlinkActive
        ? 'bg-purple-950/40 border-purple-500 shadow-purple-500/20'
        : 'bg-cyber-card border-cyber-border'
    }`}>
      {/* Header Bar */}
      <div className="px-4 py-2.5 bg-slate-900/90 border-b border-cyber-border flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-200">Iris Tracking Feed</span>
          {/* Real-time direction pill */}
          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider flex items-center gap-1 ${
            gazeDirectionLabel === 'BLINK'
              ? 'bg-purple-900 border border-purple-400 text-purple-200 animate-pulse'
              : gazeDirectionLabel === 'DOWN'
              ? 'bg-amber-950 border border-amber-400 text-amber-200'
              : gazeDirectionLabel === 'UP'
              ? 'bg-blue-950 border border-blue-400 text-blue-200'
              : gazeDirectionLabel === 'RIGHT'
              ? 'bg-cyan-950 border border-cyan-400 text-cyan-200'
              : gazeDirectionLabel === 'LEFT'
              ? 'bg-indigo-950 border border-indigo-400 text-indigo-200'
              : 'bg-slate-900 border border-slate-700 text-slate-400'
          }`}>
            {gazeDirectionLabel === 'BLINK' && <EyeOff className="w-3 h-3 text-purple-300" />}
            {gazeDirectionLabel === 'DOWN' && <ArrowDown className="w-3 h-3 text-amber-400" />}
            {gazeDirectionLabel === 'UP' && <ArrowUp className="w-3 h-3 text-blue-400" />}
            {gazeDirectionLabel === 'RIGHT' && <ArrowRight className="w-3 h-3 text-cyan-400" />}
            {gazeDirectionLabel === 'LEFT' && <ArrowLeft className="w-3 h-3 text-indigo-400" />}
            {gazeDirectionLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleInvert}
            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition flex items-center gap-1 ${
              invertX ? 'bg-amber-950 border-amber-500 text-amber-300 font-bold' : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
            title="Toggle between natural tracking (Right = Right) and inverted"
          >
            <FlipHorizontal className="w-3 h-3" />
            {invertX ? 'Inverted' : 'Natural (R=R)'}
          </button>

          <button
            onClick={handleCalibrate}
            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition flex items-center gap-1 ${
              isCalibrated ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Look at screen center and click to zero out angle"
          >
            <Target className="w-3 h-3 text-cyan-400" />
            {isCalibrated ? 'Centered!' : 'Center'}
          </button>
        </div>
      </div>

      {/* Video / Canvas Stage (ALWAYS MIRRORED LIKE A SELFIE MIRROR) */}
      <div className="relative aspect-[4/3] bg-cyber-obsidian overflow-hidden flex items-center justify-center">
        {hasCameraAccess === false && (
          <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            <CameraOff className="w-10 h-10 text-amber-400 mb-2" />
            <h4 className="text-sm font-semibold text-slate-200">Webcam Inactive</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-[260px]">
              {errorMessage || 'Simulated synthetic stream active.'}
            </p>
            <button
              onClick={startWebcam}
              className="mt-4 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Camera
            </button>
          </div>
        )}

        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
        />

        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10 transform -scale-x-100"
        />

        {/* Center Crosshair for Calibration */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border border-cyan-500/30 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400/50" />
          </div>
        </div>
      </div>

      {/* Footer with Status Badge */}
      <div className="px-4 py-2 bg-slate-900/70 border-t border-cyber-border/60 flex items-center justify-between text-[11px] font-mono">
        <span className="text-slate-400">Status:</span>
        <span className={blinkMetrics.isBlinkActive ? 'text-purple-400 font-bold' : 'text-emerald-400 font-semibold'}>
          {blinkMetrics.isBlinkActive ? '● BLINKING' : '● ACTIVE'} ({blinkMetrics.totalBlinksDetected} blinks)
        </span>
      </div>
    </div>
  );
};
