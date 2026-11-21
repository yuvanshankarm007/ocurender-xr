import { BaseAgent } from './BaseAgent';
import { AgentEventBus } from './eventBus';
import { AgentMessage } from './types';

export class AuditorAgent extends BaseAgent {
  constructor(bus: AgentEventBus) {
    super('agent.governance.auditor', 1, 'Spatial Safety & Convergence Auditor', bus);
  }

  public async handleMessage(msg: AgentMessage): Promise<void> {
    // 1. Audit Monotonic Hop-Count Invariant (Must be <= 5)
    if (msg.hopCount <= 5) {
      this.bus.updateState((prev) => ({
        governance: {
          ...prev.governance,
          invariantsPassed: prev.governance.invariantsPassed + 1
        }
      }));
    } else {
      await this.escalate(
        'INVARIANT_VIOLATION_HOP_EXCEEDED',
        { offendingMsg: msg },
        `Message ${msg.messageId} exceeded max hop-count bound of 5.`
      );
      return;
    }

    // 2. Audit Telemetry & Blink Events
    if (msg.intent === 'BLINK_DETECTED') {
      this.bus.updateState((prev) => ({
        governance: {
          ...prev.governance,
          invariantsPassed: prev.governance.invariantsPassed + 1
        }
      }));
    }

    // 3. Audit Workload & Foveated Optimizations
    if (msg.intent === 'CONVERGENCE_AUDIT') {
      this.bus.updateState((prev) => ({
        governance: {
          ...prev.governance,
          invariantsPassed: prev.governance.invariantsPassed + 1
        }
      }));
    }
  }

  private isThrottled = false;
  private highFpsStreak = 0;

  /**
   * Autonomous Dynamic Foveated Budgeting:
   * When FPS drops below 55, issue OPTIMIZE_FILL_RATE directive to contract foveal cone (3.0° -> 2.2°)
   */
  public async auditFramerate(currentFps: number): Promise<void> {
    if (currentFps < 55 && !this.isThrottled) {
      this.isThrottled = true;
      this.highFpsStreak = 0;
      await this.sendPeer(
        'agent.specialist.fovea_optimizer',
        'Foveated Compute Specialist',
        'OPTIMIZE_FILL_RATE',
        'FRAME_DROP_THROTTLING',
        {
          currentFps,
          targetFoveaRadiusDeg: 2.2,
          reason: `Frame rate dropped to ${currentFps} FPS (< 55 FPS bound). Contracting fovea radius to 2.2° to restore 60 FPS.`
        },
        `Auditor detected frame drop to ${currentFps} FPS (< 55 threshold). Issued OPTIMIZE_FILL_RATE directive to fovea specialist.`
      );
    } else if (currentFps >= 58 && this.isThrottled) {
      this.highFpsStreak++;
      if (this.highFpsStreak >= 3) {
        this.isThrottled = false;
        this.highFpsStreak = 0;
      }
    }
  }
}
