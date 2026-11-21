import React from 'react';
import { Sliders, Eye, Brain, Focus, Sparkles, RefreshCw, Layers } from 'lucide-react';
import { CognitiveState, FoveatedSettings } from '../types';

interface ControlsBarProps {
  activeMode: 'live_webcam' | 'biomechanical_synth';
  cognitiveState: CognitiveState;
  onCognitiveStateChange: (state: CognitiveState) => void;
  foveatedSettings: FoveatedSettings;
  onUpdateFoveatedSettings: (settings: Partial<FoveatedSettings>) => void;
  onTriggerBlink: () => void;
  parallaxCorrectionEnabled: boolean;
  onToggleParallaxCorrection: (enabled: boolean) => void;
}

export const ControlsBar: React.FC<ControlsBarProps> = ({
  activeMode,
  cognitiveState,
  onCognitiveStateChange,
  foveatedSettings,
  onUpdateFoveatedSettings,
  onTriggerBlink,
  parallaxCorrectionEnabled,
  onToggleParallaxCorrection,
}) => {
  return (
    <div className="bg-cyber-card border border-cyber-border rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
      {/* Left: Mode Context Controls */}
      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
        {activeMode === 'biomechanical_synth' ? (
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold text-slate-300">Cognitive State:</span>
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl p-0.5">
              {(['conversational', 'reading', 'visual_search', 'daydreaming'] as CognitiveState[]).map((state) => (
                <button
                  key={state}
                  onClick={() => onCognitiveStateChange(state)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-all ${
                    cognitiveState === state
                      ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {state.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-slate-300">
              Tracking <span className="font-semibold text-cyan-300">Pupil &amp; Iris 3D Vectors</span> at 60 FPS
            </span>
          </div>
        )}

        {/* Action Button: Trigger Manual Blink */}
        <button
          onClick={onTriggerBlink}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-700 hover:border-purple-500 text-slate-200 hover:text-purple-300 transition-all flex items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          Test Blink (Bell's Law)
        </button>
      </div>

      {/* Right: Shader Sliders */}
      <div className="flex flex-wrap items-center gap-6 w-full md:w-auto justify-end">
        {/* Fovea Radius Slider */}
        <div className="flex items-center gap-2">
          <Focus className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-mono text-slate-400">Fovea Radius:</span>
          <input
            type="range"
            min="1.0"
            max="6.0"
            step="0.5"
            value={foveatedSettings.foveaRadiusDeg}
            onChange={(e) => onUpdateFoveatedSettings({ foveaRadiusDeg: parseFloat(e.target.value) })}
            className="w-20 accent-cyan-400 cursor-pointer"
          />
          <span className="text-xs font-mono text-cyan-300 font-bold w-10">
            {foveatedSettings.foveaRadiusDeg}°
          </span>
        </div>

        {/* Peripheral Blur Strength Slider */}
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-xs font-mono text-slate-400">Blur Power:</span>
          <input
            type="range"
            min="1.0"
            max="8.0"
            step="0.5"
            value={foveatedSettings.blurStrength}
            onChange={(e) => onUpdateFoveatedSettings({ blurStrength: parseFloat(e.target.value) })}
            className="w-20 accent-purple-400 cursor-pointer"
          />
          <span className="text-xs font-mono text-purple-300 font-bold w-6">
            {foveatedSettings.blurStrength}x
          </span>
        </div>

        {/* Foveated Shader Toggle */}
        <button
          onClick={() => onUpdateFoveatedSettings({ enabled: !foveatedSettings.enabled })}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            foveatedSettings.enabled
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
              : 'bg-slate-900 border-slate-700 text-slate-400'
          }`}
        >
          {foveatedSettings.enabled ? 'Foveated Shader: ON' : 'Foveated Shader: OFF'}
        </button>
      </div>
    </div>
  );
};
