import React, { useRef, useEffect, useState } from 'react';
import { Eye, Compass, Video, CheckCircle2, Crosshair, Maximize2, Minimize2, AlertCircle, Target, X } from 'lucide-react';
import { XRSceneManager, TelepresenceViewMode, AvatarStyle } from '../core/graphics/XRSceneManager';
import { GazeTelemetry, FoveatedSettings } from '../types';
import { IrisTracker } from '../core/vision/IrisTracker';
import { GazeCalibrationModal } from './GazeCalibrationModal';

interface XRStageViewportProps {
  sceneManagerRef: React.MutableRefObject<XRSceneManager | null>;
  foveatedSettings: FoveatedSettings;
  onUpdateFoveatedSettings: (settings: Partial<FoveatedSettings>) => void;
  telemetry: GazeTelemetry;
  tracker?: IrisTracker | null;
}

export const XRStageViewport: React.FC<XRStageViewportProps> = ({
  sceneManagerRef,
  foveatedSettings,
  onUpdateFoveatedSettings,
  telemetry,
  tracker,
}) => {
  const moduleWrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<TelepresenceViewMode>('virtual_camera_corrected');
  const [showGazeReticle, setShowGazeReticle] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>('photoreal_human');
  const [justCalibrated, setJustCalibrated] = useState(false);
  // Auto-launch 5-point calibration on startup as requested
  const [showCalibModal, setShowCalibModal] = useState(true);
  const reticleRef = useRef<HTMLDivElement>(null);

  // Zero-lag 60 FPS direct Reticle positioning bypassing React reconciliation
  useEffect(() => {
    if (!tracker) return;
    const unsub = tracker.subscribe((t) => {
      if (reticleRef.current && showGazeReticle) {
        const xPct = (t.gazePoint2D?.x ?? 0.5) * 100;
        const yPct = (t.gazePoint2D?.y ?? 0.5) * 100;
        reticleRef.current.style.left = `${xPct}%`;
        reticleRef.current.style.top = `${yPct}%`;
      }
    });
    return unsub;
  }, [tracker, showGazeReticle]);

  useEffect(() => {
    if (!containerRef.current) return;

    const manager = new XRSceneManager(containerRef.current);
    manager.setFoveatedSettings(foveatedSettings);
    manager.setAvatarStyle(avatarStyle);
    sceneManagerRef.current = manager;

    return () => {
      manager.destroy();
      sceneManagerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setFoveatedSettings(foveatedSettings);
    }
  }, [foveatedSettings]);

  const handleCalibrateCenter = () => {
    if (tracker) {
      tracker.calibrateCenter();
      setJustCalibrated(true);
      setTimeout(() => setJustCalibrated(false), 2000);
    }
  };

  const handleToggleAvatar = () => {
    const nextStyle = avatarStyle === 'photoreal_human' ? 'cyber_hologram' : 'photoreal_human';
    setAvatarStyle(nextStyle);
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setAvatarStyle(nextStyle);
    }
  };

  // Handle Fullscreen events and dynamic resizing & keybindings
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement
      );
      setIsFullscreen(isNowFs);
      setTimeout(() => {
        if (sceneManagerRef.current) {
          sceneManagerRef.current.resize();
        }
        window.dispatchEvent(new Event('resize'));
      }, 80);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleCalibrateCenter();
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setShowCalibModal(true);
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setShowGazeReticle(prev => !prev);
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleToggleAvatar();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [tracker, avatarStyle]);

  const toggleFullscreen = async () => {
    const wrapper = moduleWrapperRef.current;
    if (!wrapper) return;

    try {
      const isCurrentlyFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement
      );

      if (!isCurrentlyFs) {
        if (wrapper.requestFullscreen) {
          await wrapper.requestFullscreen();
        } else if ((wrapper as any).webkitRequestFullscreen) {
          await (wrapper as any).webkitRequestFullscreen();
        } else {
          setIsFullscreen(true);
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else {
          setIsFullscreen(false);
        }
      }
    } catch (err) {
      setIsFullscreen((prev) => !prev);
    }

    setTimeout(() => {
      if (sceneManagerRef.current) {
        sceneManagerRef.current.resize();
      }
      window.dispatchEvent(new Event('resize'));
    }, 100);
  };

  const handleViewModeChange = (mode: TelepresenceViewMode) => {
    setViewMode(mode);
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setViewMode(mode);
    }
  };

  return (
    <div
      ref={moduleWrapperRef}
      className={`bg-cyber-card border border-cyber-border overflow-hidden shadow-2xl flex flex-col ${
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen rounded-none'
          : 'relative flex-1 min-h-[500px] rounded-2xl'
      }`}
    >
      {/* Top Streamlined Viewport Bar: Non-overlapping, spacious, clean */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-3 pointer-events-none">
        {/* Left: View Mode Toggle Segmented Pill & Eye Contact Quality */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 flex items-center gap-1 shadow-lg">
            <button
              onClick={() => handleViewModeChange('virtual_camera_corrected')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === 'virtual_camera_corrected'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
              <span>1:1 Eyeline</span>
            </button>

            <button
              onClick={() => handleViewModeChange('headset_passthrough_raw')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === 'headset_passthrough_raw'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-300" />
              <span>Visor Cam</span>
            </button>

            <button
              onClick={() => handleViewModeChange('split_view')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === 'split_view'
                  ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md shadow-cyan-600/30 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Video className="w-3.5 h-3.5 text-cyan-300" />
              <span>Split View</span>
            </button>
          </div>

          {/* Eye Contact Quality Badge */}
          <div className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-all ${
            viewMode === 'headset_passthrough_raw'
              ? 'bg-amber-950/85 border-amber-500/60 text-amber-300'
              : (telemetry.eyeContactQuality ?? 0.98) > 0.6
              ? 'bg-emerald-950/85 border-emerald-500/60 text-emerald-300'
              : 'bg-cyan-950/85 border-cyan-500/60 text-cyan-300'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              viewMode === 'headset_passthrough_raw'
                ? 'bg-amber-400'
                : (telemetry.eyeContactQuality ?? 0.98) > 0.6
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-cyan-400'
            }`} />
            <span>
              {viewMode === 'headset_passthrough_raw'
                ? 'Parallax: -14°'
                : `1:1 Contact: ${Math.round((telemetry.eyeContactQuality ?? 0.98) * 100)}%`}
            </span>
          </div>
        </div>

        {/* Right: Only Essential Actions (Center, Calibrate, Fullscreen) */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Quick Center Gaze Calibration Button (Press C) */}
          <button
            onClick={handleCalibrateCenter}
            title="Lock your resting gaze to screen center (Shortcut: Press C)"
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md transition-all flex items-center gap-1.5 border shadow-lg ${
              justCalibrated
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold shadow-emerald-500/40 animate-pulse'
                : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white hover:border-cyan-500'
            }`}
          >
            <Target className="w-3.5 h-3.5 text-cyan-400" />
            <span>{justCalibrated ? 'Centered!' : 'Center [C]'}</span>
          </button>

          {/* Interactive 5-Point Corner Calibration (Press K) */}
          <button
            onClick={() => setShowCalibModal(true)}
            title="Calibrate gaze boundaries by fixating on screen corners (Shortcut: Press K)"
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md transition-all flex items-center gap-1.5 border shadow-lg ${
              tracker?.getIs5PointCalibrated()
                ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-cyan-500/20 font-bold'
                : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white hover:border-cyan-500'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span>{tracker?.getIs5PointCalibrated() ? 'Calibrated ✓' : 'Calib [K]'}</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen (Esc or F)' : 'Enter Fullscreen Stage View (Shortcut: F)'}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md transition-all flex items-center gap-1.5 border shadow-lg ${
              isFullscreen
                ? 'bg-purple-600/35 border-purple-400 text-purple-200 shadow-purple-500/30'
                : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'
            }`}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-purple-300" />
                <span>Exit [F]</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-slate-300" />
                <span>Fullscreen [F]</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Calibration Confirmation Toast */}
      {justCalibrated && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-bounce">
          <div className="px-4 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-2xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-slate-950" />
            Resting Optical Axis Calibrated to 0.0°!
          </div>
        </div>
      )}

      {/* Split-View Overlay Banners when in Side-by-Side Mode */}
      {viewMode === 'split_view' && (
        <div className="absolute top-14 left-3 right-3 z-20 grid grid-cols-2 gap-3 pointer-events-none">
          <div className="bg-amber-950/80 border border-amber-500/40 backdrop-blur-md rounded-xl p-2 text-center text-xs">
            <span className="font-bold text-amber-300 block">🔴 Standard Visor Cam (+65mm)</span>
            <span className="text-[10px] text-amber-200/80">-14.2° Parallax Deficit | Gaze looking down at chest</span>
          </div>
          <div className="bg-emerald-950/80 border border-emerald-500/40 backdrop-blur-md rounded-xl p-2 text-center text-xs">
            <span className="font-bold text-emerald-300 block">🟢 OcuRender XR Synthesized Eyeline</span>
            <span className="text-[10px] text-emerald-200/80">0.0° Optical Center | 1:1 Mutual Eye Contact Locked</span>
          </div>
        </div>
      )}

      {/* Floating 2D Gaze Reticle overlay traveling across the 3D screen */}
      {showGazeReticle && telemetry && (
        <div
          ref={reticleRef}
          className="absolute pointer-events-none z-20 will-change-transform"
          style={{
            left: `${(telemetry.gazePoint2D?.x ?? 0.5) * 100}%`,
            top: `${(telemetry.gazePoint2D?.y ?? 0.5) * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="relative flex items-center justify-center">
            {/* Outer High-Tech Targeting Ring */}
            <div className={`w-14 h-14 rounded-full border-2 ${
              telemetry.isBlink
                ? 'border-amber-400 bg-amber-500/10 scale-75'
                : telemetry.isSaccade
                ? 'border-indigo-400 bg-indigo-500/10 scale-125'
                : 'border-cyan-400 bg-cyan-500/5'
            } transition-transform duration-75 flex items-center justify-center animate-spin-slow`} />

            {/* Inner Concentric Fixation Ring */}
            <div className={`absolute w-7 h-7 rounded-full border ${
              telemetry.isBlink ? 'border-amber-300' : 'border-white/80'
            }`} />

            {/* Center High-Precision Core Pip */}
            <div className={`absolute w-1.5 h-1.5 rounded-full ${
              telemetry.isBlink ? 'bg-amber-300' : 'bg-white'
            } shadow-[0_0_8px_#ffffff]`} />

            {/* 4 Crosshair Tick Marks */}
            <div className="absolute -top-2 w-0.5 h-2 bg-cyan-400/80" />
            <div className="absolute -bottom-2 w-0.5 h-2 bg-cyan-400/80" />
            <div className="absolute -left-2 w-2 h-0.5 bg-cyan-400/80" />
            <div className="absolute -right-2 w-2 h-0.5 bg-cyan-400/80" />
          </div>
        </div>
      )}

      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="w-full h-full flex-1 relative cursor-crosshair" />

      {/* Bottom Floating Telepresence Diagnostics Pill */}
      <div className="absolute bottom-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Parallax Status Badge */}
        <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800 text-xs font-mono shadow-xl flex items-center gap-2 pointer-events-auto">
          {viewMode === 'virtual_camera_corrected' ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping-slow" />
              <span className="text-emerald-300 font-bold">1:1 EYE CONTACT RESTORED</span>
              <span className="text-slate-400 text-[11px] hidden sm:inline">(Virtual camera aligned to optical axis)</span>
            </>
          ) : viewMode === 'split_view' ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <span className="text-cyan-300 font-bold">SIDE-BY-SIDE TELEPRESENCE BENCHMARK</span>
              <span className="text-slate-400 text-[11px] hidden sm:inline">(Uncorrected -14.2° vs 1:1 Eyeline)</span>
            </>
          ) : (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="text-amber-300 font-bold">BROKEN EYE CONTACT (-14° DOWNWARD STARE)</span>
              <span className="text-slate-400 text-[11px] hidden sm:inline">(Forehead sensor parallax deficit)</span>
            </>
          )}
        </div>

        {/* Fullscreen Exit Hint Badge */}
        {isFullscreen && (
          <div className="px-3 py-1.5 rounded-xl bg-purple-950/85 backdrop-blur-md border border-purple-500/40 text-[11px] font-mono text-purple-200 shadow-xl flex items-center gap-2 pointer-events-auto">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <span>FULLSCREEN (Press <b>F</b> or <b>Esc</b> to return)</span>
          </div>
        )}

      </div>

      {/* 5-Point Interactive Gaze Calibration Modal */}
      {tracker && (
        <GazeCalibrationModal
          isOpen={showCalibModal}
          onClose={() => setShowCalibModal(false)}
          tracker={tracker}
        />
      )}
    </div>
  );
};
