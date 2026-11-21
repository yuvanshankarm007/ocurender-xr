import { BaseAgent } from './BaseAgent';
import { AgentEventBus } from './eventBus';
import { AgentMessage } from './types';
import { CognitiveAttentionEngine } from '../core/biomechanics/CognitiveAttentionEngine';
import { CognitiveState } from '../types';

export class BiomechanicsSpecialist extends BaseAgent {
  private cognitiveEngine = new CognitiveAttentionEngine();

  constructor(bus: AgentEventBus) {
    super('agent.specialist.biomechanics', 2, 'Ocular Biomechanics Specialist', bus);
  }

  private isInfillActive = false;

  public async handleMessage(msg: AgentMessage): Promise<void> {
    if (msg.intent === 'SESSION_DIRECTIVE' && msg.topic === 'COGNITIVE_STATE_CHANGED') {
      const state = msg.payload.state as CognitiveState;
      this.cognitiveEngine.setCognitiveState(state);

      await this.sendPeer(
        'agent.specialist.virtual_camera',
        'Virtual Camera Specialist',
        'PEER_PROPOSAL',
        'SACCADIC_SCANPATH_UPDATED',
        { state },
        `Cognitive state set to ${state}. Generating Main Sequence ballistic saccades.`
      );
    }

    if (msg.intent === 'COGNITIVE_GAZE_INFILL') {
      this.isInfillActive = true;
      this.cognitiveEngine.setCognitiveState('conversational');
      this.bus.updateState(() => ({ cognitiveState: 'conversational' }));

      await this.sendPeer(
        'agent.specialist.virtual_camera',
        'Virtual Camera Specialist',
        'PEER_PROPOSAL',
        'COGNITIVE_INFILL_ENGAGED',
        { active: true, model: 'Carpenter_Main_Sequence_v750' },
        'Cognitive Gaze Infill activated: Synthesizing biologically plausible saccades and micro-fixations to avoid dead stare.'
      );
    }

    if (msg.intent === 'SESSION_DIRECTIVE' && msg.topic === 'RESTORE_LIVE_TRACKING') {
      this.isInfillActive = false;
    }
  }

  public getIsInfillActive(): boolean {
    return this.isInfillActive;
  }

  public update(nowMs: number) {
    return this.cognitiveEngine.update(nowMs);
  }

  public setCognitiveState(state: CognitiveState) {
    this.cognitiveEngine.setCognitiveState(state);
    this.bus.updateState(() => ({ cognitiveState: state }));
  }
}
