import { AgentEventBus } from './eventBus';
import { AgentMessage, AgentRole, AgentTier, MessageIntent } from './types';

export abstract class BaseAgent {
  private unsubscribe: (() => void) | null = null;

  constructor(
    public readonly role: AgentRole,
    public readonly tier: AgentTier,
    public readonly label: string,
    protected readonly bus: AgentEventBus
  ) {
    this.unsubscribe = this.bus.subscribe(this.role, (msg) => this.dispatchIncoming(msg));
  }

  abstract handleMessage(msg: AgentMessage): Promise<void>;

  public async dispatchIncoming(msg: AgentMessage): Promise<void> {
    const currentSessionId = this.bus.getState().sessionId;
    if (msg.correlationId && msg.correlationId !== currentSessionId) {
      return;
    }
    await this.handleMessage(msg);
  }

  public dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Horizontal Peer-to-Peer Communication (Tier 2 to Tier 2)
   */
  protected async sendPeer<T = any>(
    recipientRole: AgentRole,
    recipientLabel: string,
    intent: MessageIntent,
    topic: string,
    payload: T,
    explanation: string,
    parentMsg?: AgentMessage
  ): Promise<void> {
    const currentSessionId = this.bus.getState().sessionId;
    const correlationId = parentMsg?.correlationId || currentSessionId;
    const hop = parentMsg ? parentMsg.hopCount + 1 : 1;

    // Monotonic Hop-Count Invariant (Bounds deliberation cycles to <= 5 hops)
    if (hop > 5) {
      await this.escalate(
        'CYCLE_DETECTED_MAX_HOPS_EXCEEDED',
        { originalTopic: topic, payload, offendingHop: hop },
        `Interrupted cyclical loop at hop ${hop}. Escalating to Tier 1 Orchestrator for decisive arbitration.`,
        parentMsg
      );
      return;
    }

    await this.bus.publish({
      senderRole: this.role,
      senderLabel: this.label,
      recipientRole,
      recipientLabel,
      intent,
      topic,
      payload,
      explanation,
      hopCount: hop,
      correlationId
    });
  }

  /**
   * Vertical Escalation to Tier 1 Governance & Executive Layer
   */
  protected async escalate<T = any>(
    topic: string,
    payload: T,
    explanation: string,
    parentMsg?: AgentMessage
  ): Promise<void> {
    const currentSessionId = this.bus.getState().sessionId;
    await this.bus.publish({
      senderRole: this.role,
      senderLabel: this.label,
      recipientRole: 'agent.executive.orchestrator',
      recipientLabel: 'Chief Telepresence Orchestrator',
      intent: 'ARBITRATION_VETO',
      topic,
      payload,
      explanation,
      hopCount: parentMsg ? parentMsg.hopCount + 1 : 1,
      correlationId: parentMsg?.correlationId || currentSessionId
    });
  }

  /**
   * Broadcast message to all active agents in the topology
   */
  protected async broadcast<T = any>(
    intent: MessageIntent,
    topic: string,
    payload: T,
    explanation: string
  ): Promise<void> {
    const currentSessionId = this.bus.getState().sessionId;
    await this.bus.publish({
      senderRole: this.role,
      senderLabel: this.label,
      recipientRole: 'broadcast',
      recipientLabel: 'All Agents',
      intent,
      topic,
      payload,
      explanation,
      hopCount: 1,
      correlationId: currentSessionId
    });
  }
}
