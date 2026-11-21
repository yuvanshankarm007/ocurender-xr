import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Header } from './components/Header';
import { LiveCameraFeed } from './components/LiveCameraFeed';
import { XRStageViewport } from './components/XRStageViewport';
import { TelemetryHUD } from './components/TelemetryHUD';
import { ControlsBar } from './components/ControlsBar';
import { JudgeDefenseDashboard } from './components/JudgeDefenseDashboard';

import { AgentEventBus } from './agent-core/eventBus';
import { OrchestratorAgent } from './agent-core/OrchestratorAgent';
import { AuditorAgent } from './agent-core/AuditorAgent';
import { GazeBlinkSpecialist } from './agent-core/GazeBlinkSpecialist';
import { VirtualCameraSpecialist } from './agent-core/VirtualCameraSpecialist';
import { BiomechanicsSpecialist } from './agent-core/BiomechanicsSpecialist';
import { FoveaOptimizerSpecialist } from './agent-core/FoveaOptimizerSpecialist';
import { MultiAgentState } from './agent-core/types';

import { IrisTracker } from './core/vision/IrisTracker';
import { XRSceneManager } from './core/graphics/XRSceneManager';
import { GazeTelemetry, CognitiveState, FoveatedSettings, GPUWorkloadStats } from './types';

export const App: React.FC = () => {
  // Global Event Bus & Agents
  const busRef = useRef<AgentEventBus>(AgentEventBus.getInstance());
  const orchestratorRef = useRef<OrchestratorAgent | null>(null);
  const auditorRef = useRef<AuditorAgent | null>(null);
  const gazeBlinkSpecialistRef = useRef<GazeBlinkSpecialist | null>(null);
  const cameraSpecialistRef = useRef<VirtualCameraSpecialist | null>(null);
  const biomechanicsSpecialistRef = useRef<BiomechanicsSpecialist | null>(null);
  const foveaOptimizerRef = useRef<FoveaOptimizerSpecialist | null>(null);

  const trackerRef = useRef<IrisTracker | null>(null);
  if (!trackerRef.current) {
    trackerRef.current = new IrisTracker();
  }
  const sceneManagerRef = useRef<XRSceneManager | null>(null);

  // Multi-Agent State
  const [agentState, setAgentState] = useState<MultiAgentState>(busRef.current.getState());
  const [fps, setFps] = useState(60);
  const [isJudgeDefenseOpen, setIsJudgeDefenseOpen] = useState(false);

  // Settings
  const [foveatedSettings, setFoveatedSettings] = useState<FoveatedSettings>({
    enabled: true,
    foveaRadiusDeg: 2.5,
    parafoveaRadiusDeg: 5.5,
    peripheralSamplingRate: 0.25,
    blurStrength: 3.5,
    visualizeFoveaCone: true, // Enabled by default so eye tracking fovea rings are immediately visible
    depthOfFieldEnabled: true,
    focalDepthMeters: 1.2,
  });

  // Throttled Telemetry for UI display (10 FPS)
  const [telemetry, setTelemetry] = useState<GazeTelemetry>({
    timestampMs: performance.now(),
    gazePoint2D: { x: 0.5, y: 0.5 },
    gazeVector3D: { x: 0, y: 0, z: -1 },
    angles: { pitch: 0, yaw: 0, roll: 0 },
    angularVelocityDegPerSec: 0,
    isSaccade: false,
    isFixation: true,
    isBlink: false,
    eyelidAperture: 1.0,
    eyeContactQuality: 0.98,
    pupilDiameterMm: 3.6,
    confidence: 1.0,
    source: 'webcam_mediapipe',
  });

  const trajectoryHistoryRef = useRef<GazeTelemetry[]>([]);
  const lastReactUpdateTimeRef = useRef(0);

  // Initialize Agents
  useEffect(() => {
    const bus = busRef.current;
    orchestratorRef.current = new OrchestratorAgent(bus);
    auditorRef.current = new AuditorAgent(bus);
    gazeBlinkSpecialistRef.current = new GazeBlinkSpecialist(bus);
    cameraSpecialistRef.current = new VirtualCameraSpecialist(bus);
    biomechanicsSpecialistRef.current = new BiomechanicsSpecialist(bus);
    const foveaOpt = new FoveaOptimizerSpecialist(bus);
    foveaOptimizerRef.current = foveaOpt;

    // Listen to autonomous dynamic foveated budgeting directives
    foveaOpt.onSettingsAdjustment((adj) => {
      setFoveatedSettings((prev) => {
        const next = { ...prev, ...adj };
        if (sceneManagerRef.current) sceneManagerRef.current.setFoveatedSettings(next);
        return next;
      });
    });

    const unsubscribeState = bus.subscribeState((newState) => {
      setAgentState(newState);
    });

    return () => {
      unsubscribeState();
      orchestratorRef.current?.dispose();
      auditorRef.current?.dispose();
      gazeBlinkSpecialistRef.current?.dispose();
      cameraSpecialistRef.current?.dispose();
      biomechanicsSpecialistRef.current?.dispose();
      foveaOptimizerRef.current?.dispose();
    };
  }, []);

  // Compute live GPU stats
  const workloadStats: GPUWorkloadStats = foveaOptimizerRef.current
    ? foveaOptimizerRef.current.computeStats(foveatedSettings)
    : {
        nativePixelCount: 2073600,
        foveatedEffectivePixels: 742348,
        pixelShadingReductionPercent: 64.2,
        framerateFps: 60,
        renderLatencyMs: 3.2
      };

  // Subscribe IrisTracker directly to 60 FPS Three.js & Agent Network
  useEffect(() => {
    const tracker = trackerRef.current;
    if (!tracker) return;

    const unsubscribe = tracker.subscribe((t, landmarks, blinkMetrics) => {
      if (agentState.activeMode === 'live_webcam') {
        // Direct Three.js update (zero React lag)
        if (sceneManagerRef.current) {
          sceneManagerRef.current.setLatestTelemetry(t);
        }

        // Notify Gaze & Blink Specialist Agent
        if (gazeBlinkSpecialistRef.current) {
          gazeBlinkSpecialistRef.current.processLandmarks(landmarks, t);
        }

        // Responsive UI telemetry update throttled to 4 FPS (250ms) for text HUD labels
        // 3D Avatar and Reticle update directly and immediately via their own subscriptions at 60 FPS
        const now = performance.now();
        if (now - lastReactUpdateTimeRef.current > 250) {
          lastReactUpdateTimeRef.current = now;
          setTelemetry(t);
        }

        trajectoryHistoryRef.current.push(t);
        if (trajectoryHistoryRef.current.length > 300) trajectoryHistoryRef.current.shift();
      }
    });

    // Autonomous Cognitive Gaze Infill: Trigger infill when face is occluded or lighting drops
    const unsubscribeTracking = tracker.subscribeTrackingStatus((isTracking, reason) => {
      if (!isTracking) {
        if (agentState.activeMode === 'live_webcam') {
          orchestratorRef.current?.triggerCognitiveGazeInfill(reason || 'FACE_OCCLUSION_OR_LIGHTING_DROPOUT');
        }
      } else {
        if (biomechanicsSpecialistRef.current?.getIsInfillActive()) {
          orchestratorRef.current?.restoreLiveWebcamTracking();
        }
      }
    });

    return () => {
      unsubscribe();
      unsubscribeTracking();
    };
  }, [agentState.activeMode]);

  // Frame loop for Synthetic AI mode & FPS counter
  useEffect(() => {
    let animId: number;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const loop = (now: number) => {
      frameCount++;
      if (now - lastFpsTime >= 1000) {
        setFps(frameCount);
        // Autonomous Dynamic Foveated Budgeting: AuditorAgent checks FPS (< 55 triggers OPTIMIZE_FILL_RATE)
        if (auditorRef.current) {
          auditorRef.current.auditFramerate(frameCount);
        }
        frameCount = 0;
        lastFpsTime = now;
      }

      if (agentState.activeMode === 'biomechanical_synth' && biomechanicsSpecialistRef.current) {
        const synth = biomechanicsSpecialistRef.current.update(now);

        const screenX = Math.max(0.05, Math.min(0.95, 0.5 + (synth.angles.yaw / 35.0)));
        const screenY = Math.max(0.05, Math.min(0.95, 0.5 + (synth.angles.pitch / 25.0)));

        const synthTelemetry: GazeTelemetry = {
          timestampMs: now,
          gazePoint2D: { x: screenX, y: screenY },
          gazeVector3D: synth.gazeVector3D,
          angles: synth.angles,
          angularVelocityDegPerSec: synth.angularVelocityDegPerSec,
          isSaccade: synth.isSaccade,
          isFixation: synth.isFixation,
          isBlink: synth.isBlink,
          eyelidAperture: synth.isBlink ? 0.0 : 1.0,
          eyeContactQuality: 0.98,
          pupilDiameterMm: 3.7 + Math.sin(now * 0.003) * 0.3,
          confidence: 0.99,
          source: 'biomechanical_synth',
        };

        if (sceneManagerRef.current) {
          sceneManagerRef.current.setLatestTelemetry(synthTelemetry);
        }

        if (now - lastReactUpdateTimeRef.current > 100) {
          lastReactUpdateTimeRef.current = now;
          setTelemetry(synthTelemetry);
        }

        trajectoryHistoryRef.current.push(synthTelemetry);
        if (trajectoryHistoryRef.current.length > 300) trajectoryHistoryRef.current.shift();
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [agentState.activeMode]);

  const handleModeChange = (mode: 'live_webcam' | 'biomechanical_synth') => {
    orchestratorRef.current?.setSessionMode(mode);
  };

  const handleCognitiveStateChange = (state: CognitiveState) => {
    biomechanicsSpecialistRef.current?.setCognitiveState(state);
  };

  const handleTriggerBlink = () => {
    if (gazeBlinkSpecialistRef.current) {
      gazeBlinkSpecialistRef.current.triggerManualBlink();
    }
  };

  const handleExportDataset = () => {
    const dataset = {
      spec: 'XR_EXT_eye_gaze_interaction',
      version: '1.0.0',
      standard: 'Khronos OpenXR / W3C Immersive Web Working Group',
      recordedAt: new Date().toISOString(),
      metadata: {
        sessionMode: agentState.activeMode,
        cognitiveState: agentState.cognitiveState,
        telepresenceView: agentState.telepresenceMode,
        sampleCount: trajectoryHistoryRef.current.length,
        vectorClockTicks: agentState.governance.vectorClock,
        invariantsAudited: agentState.governance.invariantsPassed,
        gpuSavingsPercent: workloadStats.pixelShadingReductionPercent,
      },
      samples: trajectoryHistoryRef.current.map((t, idx) => ({
        index: idx,
        timestampNanos: Math.round(t.timestampMs * 1_000_000),
        gazeOriginMeters: { x: 0.0, y: 0.08, z: 0.0 },
        gazeDirection: t.gazeVector3D,
        gazeAnglesDeg: t.angles,
        headPose: t.headPose || { pitchDeg: 0, yawDeg: 0, rollDeg: 0 },
        eyelidOpenness: {
          continuousAperture: t.eyelidAperture ?? 1.0,
          isBlink: t.isBlink,
        },
        eyeContactQuality: t.eyeContactQuality ?? 0.98,
        angularVelocityDegPerSec: t.angularVelocityDegPerSec,
        isSaccade: t.isSaccade,
        isFixation: t.isFixation,
        confidence: t.confidence,
      })),
    };

    const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OcuRender_XR_OpenXR_Dataset_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.2 },
      colors: ['#00f2fe', '#818cf8', '#00ff87']
    });
  };

  return (
    <div className="min-h-screen bg-cyber-obsidian text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      <Header
        activeMode={agentState.activeMode}
        onModeChange={handleModeChange}
        fps={fps}
        gpuSavingsPercent={workloadStats.pixelShadingReductionPercent}
        onExportDataset={handleExportDataset}
        onOpenJudgeDefense={() => setIsJudgeDefenseOpen(true)}
      />

      <JudgeDefenseDashboard
        isOpen={isJudgeDefenseOpen}
        onClose={() => setIsJudgeDefenseOpen(false)}
        telemetry={telemetry}
        foveatedSettings={foveatedSettings}
        agentState={agentState}
        trajectoryHistory={trajectoryHistoryRef.current}
      />

      {/* Main Container */}
      <main className="flex-1 p-3 lg:p-5 flex flex-col gap-4 max-w-[1720px] mx-auto w-full">
        {/* Top 3-Column Studio Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
              {/* Left Column: Live Sensory Feed & EAR */}
              <div className="lg:col-span-3 flex flex-col">
                <LiveCameraFeed
                  tracker={trackerRef.current!}
                  isLiveMode={agentState.activeMode === 'live_webcam'}
                  blinkMetrics={agentState.blinkMetrics}
                />
              </div>

              {/* Center Column: XR Stage Viewport */}
              <div className="lg:col-span-6 flex flex-col">
                <XRStageViewport
                  sceneManagerRef={sceneManagerRef}
                  foveatedSettings={foveatedSettings}
                  onUpdateFoveatedSettings={(s) => {
                    setFoveatedSettings((prev) => {
                      const updated = { ...prev, ...s };
                      if (sceneManagerRef.current) sceneManagerRef.current.setFoveatedSettings(updated);
                      return updated;
                    });
                  }}
                  telemetry={telemetry}
                  tracker={trackerRef.current!}
                />
              </div>

              {/* Right Column: Telemetry HUD with EAR & Blink stats */}
              <div className="lg:col-span-3 flex flex-col">
                <TelemetryHUD
                  telemetry={telemetry}
                  workloadStats={workloadStats}
                  blinkMetrics={agentState.blinkMetrics}
                />
              </div>
            </div>

            {/* Bottom Controls Bar */}
            <ControlsBar
              activeMode={agentState.activeMode}
              cognitiveState={agentState.cognitiveState}
              onCognitiveStateChange={handleCognitiveStateChange}
              foveatedSettings={foveatedSettings}
              onUpdateFoveatedSettings={(s) => {
                setFoveatedSettings((prev) => {
                  const updated = { ...prev, ...s };
                  if (sceneManagerRef.current) sceneManagerRef.current.setFoveatedSettings(updated);
                  return updated;
                });
              }}
              onTriggerBlink={handleTriggerBlink}
              parallaxCorrectionEnabled={true}
              onToggleParallaxCorrection={() => {}}
            />
      </main>
    </div>
  );
};
export default App;
