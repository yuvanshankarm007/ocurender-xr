import React, { useRef, useEffect } from 'react';
import { Activity, Cpu, Compass, Eye, BatteryCharging, Sparkles, AlertCircle, Brain, Gauge } from 'lucide-react';
import { GazeTelemetry, GPUWorkloadStats } from '../types';
import { BlinkMetrics } from '../agent-core/types';

interface TelemetryHUDProps {
  telemetry: GazeTelemetry;
  workloadStats: GPUWorkloadStats;
  blinkMetrics: BlinkMetrics;
}

export const TelemetryHUD: React.FC<TelemetryHUDProps> = ({ telemetry, workloadStats, blinkMetrics }) => {
  const scanpathCanvasRef = useRef<HTMLCanvasElement>(null);
  const scanpathHistoryRef = useRef<{ x: number; y: number; isSaccade: boolean }[]>([]);

  useEffect(() => {
    const history = scanpathHistoryRef.current;
    history.push({
      x: telemetry.gazePoint2D.x,
      y: telemetry.gazePoint2D.y,
      isSaccade: telemetry.isSaccade
    });

    if (history.length > 50) history.shift();
    renderScanpath();
  }, [telemetry]);

  const renderScanpath = () => {
    const canvas = scanpathCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width;
    const h = canvas.height;

    ctx.strokeStyle = 'rgba(31, 46, 77, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const history = scanpathHistoryRef.current;
    if (history.length < 2) return;

    for (let i = 0; i < history.length - 1; i++) {
      const p1 = history[i];
      const p2 = history[i + 1];
      const alpha = (i / history.length) * 0.8;

      ctx.beginPath();
      ctx.moveTo(p1.x * w, p1.y * h);
      ctx.lineTo(p2.x * w, p2.y * h);
      ctx.lineWidth = p2.isSaccade ? 1.5 : 2.5;
      ctx.strokeStyle = p2.isSaccade
        ? `rgba(245, 158, 11, ${alpha})`
        : `rgba(0, 242, 254, ${alpha})`;
      ctx.stroke();
    }

    const current = history[history.length - 1];
    ctx.beginPath();
    ctx.arc(current.x * w, current.y * h, 5, 0, Math.PI * 2);
    ctx.fillStyle = blinkMetrics.isBlinkActive ? '#a855f7' : telemetry.isSaccade ? '#f59e0b' : '#00ff87';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  };

  return (
    <div className="w-full lg:w-80 flex flex-col gap-4">
      {/* Precision Dual-Eye Blink & EAR Card */}
      <div className={`border rounded-2xl p-4 shadow-xl transition-all duration-150 ${
        blinkMetrics.isBlinkActive
          ? 'bg-purple-950/60 border-purple-500 shadow-purple-500/20'
          : 'bg-cyber-card border-cyber-border'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Dual-Eye EAR &amp; Blink Telemetry
            </h3>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider ${
              blinkMetrics.isBlinkActive
                ? 'bg-purple-900 border border-purple-400 text-purple-200 animate-pulse'
                : 'bg-slate-900 border border-slate-700 text-slate-400'
            }`}
          >
            {blinkMetrics.blinkState}
          </span>
        </div>

        {/* EAR Gauge Bar */}
        <div className="space-y-1 mb-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">Eye Aspect Ratio (EAR):</span>
            <span className="font-bold text-slate-200">
              {blinkMetrics.currentEar} <span className="text-slate-500 font-normal">/ Base: {blinkMetrics.baselineEar}</span>
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden relative">
            {/* Dynamic threshold marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
              style={{ left: `${Math.min(100, (blinkMetrics.earThreshold / 0.45) * 100)}%` }}
              title={`Trigger Threshold: ${blinkMetrics.earThreshold}`}
            />
            <div
              className={`h-full transition-all duration-75 ${
                blinkMetrics.isBlinkActive ? 'bg-purple-500' : 'bg-gradient-to-r from-red-500 via-amber-500 to-emerald-400'
              }`}
              style={{ width: `${Math.min(100, (blinkMetrics.currentEar / 0.45) * 100)}%` }}
            />
          </div>
        </div>

        {/* Blink Rate & Stats Grid */}
        <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
          <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
            <span className="text-slate-400 text-[9.5px] block">Blinks</span>
            <span className="font-bold text-purple-300 text-xs">{blinkMetrics.totalBlinksDetected}</span>
          </div>
          <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
            <span className="text-slate-400 text-[9.5px] block">Rate</span>
            <span className="font-bold text-cyan-300 text-xs">{blinkMetrics.blinksPerMinute} BPM</span>
          </div>
          <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
            <span className="text-slate-400 text-[9.5px] block">Duration</span>
            <span className="font-bold text-emerald-300 text-xs">{blinkMetrics.lastBlinkDurationMs}ms</span>
          </div>
        </div>
      </div>

      {/* Eye Contact Quality & Head Pose Card */}
      <div className="bg-cyber-card border border-cyber-border rounded-2xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Mutual Eye Contact Quality
            </h3>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-300">
            {Math.round((telemetry.eyeContactQuality ?? 0.98) * 100)}%
          </span>
        </div>

        <div className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden mb-3">
          <div
            className="h-full bg-gradient-to-r from-amber-500 via-cyan-400 to-emerald-400 transition-all duration-150"
            style={{ width: `${Math.round((telemetry.eyeContactQuality ?? 0.98) * 100)}%` }}
          />
        </div>

        {/* Head-Pose & World-Gaze Decoupled Summary */}
        <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
          <div>
            <span className="text-cyan-400 block font-semibold">Head Pose (6-DoF)</span>
            <span className="text-slate-300">
              Y: {telemetry.headPose?.yawDeg ?? 0}° | P: {telemetry.headPose?.pitchDeg ?? 0}°
            </span>
          </div>
          <div>
            <span className="text-emerald-400 block font-semibold">Gaze-in-World</span>
            <span className="text-slate-300">
              Y: {telemetry.angles.yaw.toFixed(1)}° | P: {telemetry.angles.pitch.toFixed(1)}°
            </span>
          </div>
        </div>
      </div>

      {/* Cognitive Pupillometry & Autonomic Workload Card (TEPR Model) */}
      <div className="bg-gradient-to-b from-indigo-950/40 via-cyber-card to-cyber-card border border-indigo-500/30 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Cognitive Pupillometry (TEPR)
            </h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-900/60 border border-indigo-500/50 text-indigo-300 font-bold">
            {(telemetry.autonomicWorkloadPercent ?? 32) > 65
              ? 'HIGH EFFORT'
              : (telemetry.autonomicWorkloadPercent ?? 32) > 35
              ? 'ACTIVE FLOW'
              : 'RESTING'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2.5 font-mono">
          <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800/80">
            <span className="text-[9.5px] text-slate-400 block">Pupil Diameter</span>
            <span className="text-sm font-bold text-indigo-300">
              {telemetry.pupilDiameterMm.toFixed(2)} mm
            </span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800/80">
            <span className="text-[9.5px] text-slate-400 block">Autonomic Workload</span>
            <span className="text-sm font-bold text-cyan-300">
              {telemetry.autonomicWorkloadPercent ?? 34}%
            </span>
          </div>
        </div>

        {/* Workload Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>Mental Load Index:</span>
            <span className="text-indigo-300 font-semibold">{telemetry.autonomicWorkloadPercent ?? 34} / 100</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-rose-500 transition-all duration-150"
              style={{ width: `${Math.max(5, Math.min(100, telemetry.autonomicWorkloadPercent ?? 34))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Ocular State Card */}
      <div className="bg-cyber-card border border-cyber-border rounded-2xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Ocular Velocity</h3>
          </div>
          <span className="text-xs font-mono font-bold text-slate-200">
            {telemetry.angularVelocityDegPerSec.toFixed(1)} °/s
          </span>
        </div>

        <div className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden mb-1">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-amber-500 transition-all duration-75"
            style={{ width: `${Math.min(100, (telemetry.angularVelocityDegPerSec / 600) * 100)}%` }}
          />
        </div>
      </div>

      {/* GPU Workload Reduction Card */}
      <div className="bg-gradient-to-b from-cyan-950/40 via-cyber-card to-cyber-card border border-cyan-500/30 rounded-2xl p-4 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-200">Foveated Power Saving</h3>
          </div>
          <span className="text-xs font-mono text-emerald-400 flex items-center gap-1 font-bold">
            <BatteryCharging className="w-3.5 h-3.5" /> +1.8h
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold font-mono text-cyan-300">
            {workloadStats.pixelShadingReductionPercent}%
          </span>
          <span className="text-xs text-slate-400">GPU Fill Load Cut</span>
        </div>
      </div>

      {/* Scanpath Saliency */}
      <div className="bg-cyber-card border border-cyber-border rounded-2xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Spatial Scanpath</h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400">LAST 50 FRAMES</span>
        </div>

        <div className="aspect-[4/3] bg-cyber-obsidian rounded-xl overflow-hidden border border-cyber-border/80">
          <canvas ref={scanpathCanvasRef} width={280} height={210} className="w-full h-full object-contain" />
        </div>
      </div>
    </div>
  );
};
