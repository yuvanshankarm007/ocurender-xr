import React from 'react';
import { Eye, Activity, ShieldCheck, Sparkles, Download, Layers } from 'lucide-react';

interface HeaderProps {
  activeMode: 'live_webcam' | 'biomechanical_synth';
  onModeChange: (mode: 'live_webcam' | 'biomechanical_synth') => void;
  fps: number;
  gpuSavingsPercent: number;
  onExportDataset: () => void;
  onOpenJudgeDefense: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeMode,
  onModeChange,
  fps,
  gpuSavingsPercent,
  onExportDataset,
  onOpenJudgeDefense,
}) => {
  return (
    <header className="border-b border-cyber-border bg-cyber-card/90 backdrop-blur-md px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50">
      {/* Brand & Track Info */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-500 p-0.5 shadow-lg shadow-cyan-500/20">
          <div className="w-full h-full bg-cyber-obsidian rounded-[10px] flex items-center justify-center">
            <Eye className="w-5 h-5 text-cyan-400 animate-pulse" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-cyan-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              OcuRender XR
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800 text-cyan-300 font-semibold uppercase tracking-wider">
              PRISM XR 2026
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-800 text-indigo-300 font-semibold">
              TRACK 1
            </span>
          </div>
          <p className="text-xs text-slate-400 hidden sm:block">
            Synthetic Eye Biomechanics &amp; Gaze-Contingent Virtual Camera Pipeline
          </p>
        </div>
      </div>

      {/* Middle Stats Badges */}
      <div className="flex items-center gap-3">
        {/* Real-time FPS lock */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400">FPS:</span>
          <span className="font-bold text-emerald-400">{fps}</span>
        </div>

        {/* GPU Shading Savings */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-950/60 border border-cyan-800/80 text-xs font-mono">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-300">GPU Fill Saved:</span>
          <span className="font-bold text-cyan-300">{gpuSavingsPercent}%</span>
        </div>
      </div>

      {/* Mode Switcher, Defense Dashboard & Export */}
      <div className="flex items-center gap-2.5">
        <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 flex items-center">
          <button
            onClick={() => onModeChange('live_webcam')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeMode === 'live_webcam'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/25'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Live Iris Track
          </button>
          <button
            onClick={() => onModeChange('biomechanical_synth')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeMode === 'biomechanical_synth'
                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/25'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Synthetic Saccade AI
          </button>
        </div>

        <button
          onClick={onOpenJudgeDefense}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-950 to-indigo-950 border border-cyan-500/50 hover:border-cyan-400 text-cyan-200 hover:text-white transition-all flex items-center gap-1.5 shadow-md"
          title="Open Quantitative Judge Defense Dashboard"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Judge Defense</span>
        </button>

        <button
          onClick={onExportDataset}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-700 hover:border-cyan-500 text-slate-200 hover:text-cyan-300 transition-all flex items-center gap-1.5 shadow-sm"
          title="Export OpenXR-compliant gaze trajectory dataset"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden md:inline">OpenXR Data</span>
        </button>
      </div>
    </header>
  );
};
