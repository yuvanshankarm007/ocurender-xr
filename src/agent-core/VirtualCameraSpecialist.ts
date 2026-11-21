import { BaseAgent } from './BaseAgent';
import { AgentEventBus } from './eventBus';
import { AgentMessage } from './types';
import { ParallaxCorrector } from '../core/graphics/ParallaxCorrector';

export class VirtualCameraSpecialist extends BaseAgent {
  private parallaxCorrector = new ParallaxCorrector();

  constructor(bus: AgentEventBus) {
    super('agent.specialist.virtual_camera', 2, 'Virtual Camera & Parallax Specialist', bus);
  }

  public async handleMessage(msg: AgentMessage): Promise<void> {
    if (msg.intent === 'BLINK_DETECTED') {
      // Synchronize ocular eyelid kinematics
      await this.sendPeer(
        'agent.governance.auditor',
        'Spatial Safety Auditor',
        'CONVERGENCE_AUDIT',
        'EYELID_KINEMATICS_SYNCED',
        { bellsApplied: msg.payload.bellsElevationDeg },
        'Eyelid occlusion and Bell upward rotation synchronized.'
      );
    }

    if (msg.intent === 'SESSION_DIRECTIVE' && msg.topic === 'TELEPRESENCE_MODE_CHANGED') {
      const mode = msg.payload.mode;
      const isCorrected = mode === 'virtual_camera_corrected';
      this.parallaxCorrector.setConfig({ correctionEnabled: isCorrected });

      await this.sendPeer(
        'agent.specialist.fovea_optimizer',
        'Foveated Compute Specialist',
        'PEER_PROPOSAL',
        'CAMERA_OPTICAL_AXIS_UPDATED',
        { isCorrected },
        `Camera optical axis set to ${isCorrected ? '1:1 Aligned' : 'Off-Axis Visor'}. Adjusting foveal center.`
      );
    }
  }

  public setBaselineOffset(offsetMm: number) {
    this.parallaxCorrector.setConfig({
      physicalCameraOffsetMm: { x: 0, y: offsetMm, z: 25 }
    });
  }

  public getCorrection() {
    return this.parallaxCorrector.calculateAngleCorrection();
  }
}
