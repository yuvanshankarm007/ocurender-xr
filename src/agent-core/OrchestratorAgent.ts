import { BaseAgent } from './BaseAgent';
import { AgentEventBus } from './eventBus';
import { AgentMessage } from './types';

export class OrchestratorAgent extends BaseAgent {
  constructor(bus: AgentEventBus) {
    super('agent.executive.orchestrator', 1, 'Chief Telepresence Orchestrator', bus);
  }

  public async handleMessage(msg: AgentMessage): Promise<void> {
    if (msg.intent === 'ARBITRATION_VETO') {
      // Handle cycle or invariant arbitration
      this.bus.updateState((prev) => ({
        governance: {
          ...prev.governance,
          deadlocksPrevented: prev.governance.deadlocksPrevented + 1
        }
      }));
    }
  }

  public async setSessionMode(mode: 'live_webcam' | 'biomechanical_synth'): Promise<void> {
    this.bus.updateState(() => ({ activeMode: mode, currentStep: `MODE_SWITCH_${mode.toUpperCase()}` }));
    await this.broadcast(
      'SESSION_DIRECTIVE',
      'MODE_CHANGED',
      { mode },
      `Directive issued: Switched active pipeline to ${mode}.`
    );
  }

  public async setTelepresenceMode(mode: 'virtual_camera_corrected' | 'headset_passthrough_raw'): Promise<void> {
    this.bus.updateState(() => ({ telepresenceMode: mode }));
    await this.sendPeer(
      'agent.specialist.virtual_camera',
      'Virtual Camera Specialist',
      'SESSION_DIRECTIVE',
      'TELEPRESENCE_MODE_CHANGED',
      { mode },
      `Directive issued: Telepresence mode changed to ${mode}.`
    );
  }

  /**
   * Autonomous Cognitive Gaze Infill:
   * When webcam drops frames, face is occluded, or confidence < 0.4,
   * command BiomechanicsSpecialist to synthesize Carpenter Main Sequence saccades.
   */
  public async triggerCognitiveGazeInfill(reason: string = 'FACE_OCCLUSION_OR_LIGHTING_DROPOUT'): Promise<void> {
    this.bus.updateState(() => ({
      activeMode: 'biomechanical_synth',
      currentStep: 'COGNITIVE_GAZE_INFILL_ENGAGED'
    }));

    await this.sendPeer(
      'agent.specialist.biomechanics',
      'Biomechanics Specialist',
      'COGNITIVE_GAZE_INFILL',
      'ENGAGE_AUTONOMOUS_INFILL',
      { reason, preserveEyeContact: true },
      `Sensory dropout detected (${reason}). Commanding Biomechanics Specialist to activate Cognitive Saccadic Infill to prevent avatar freezing.`
    );
  }

  public async restoreLiveWebcamTracking(): Promise<void> {
    this.bus.updateState(() => ({
      activeMode: 'live_webcam',
      currentStep: 'LIVE_TRACKING_RESTORED'
    }));

    await this.sendPeer(
      'agent.specialist.biomechanics',
      'Biomechanics Specialist',
      'SESSION_DIRECTIVE',
      'RESTORE_LIVE_TRACKING',
      {},
      'Sensory stream confidence restored. Transitioned back to live MediaPipe webcam tracking.'
    );
  }
}
