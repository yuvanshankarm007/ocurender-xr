import { AgentMessage, AgentRole, MultiAgentState, ActiveEdge } from './types';

export type MessageSubscriber = (msg: AgentMessage) => void | Promise<void>;
export type StateSubscriber = (state: MultiAgentState) => void;

export class AgentEventBus {
  private static instance: AgentEventBus;
  private messageSubscribers: Map<string, Set<MessageSubscriber>> = new Map();
  private globalSubscribers: Set<MessageSubscriber> = new Set();
  private stateSubscribers: Set<StateSubscriber> = new Set();

  private state: MultiAgentState = {
    sessionId: 'session_xr_' + Math.random().toString(36).substring(2, 9),
    currentStep: 'INITIALIZED',
    activeMode: 'live_webcam',
    cognitiveState: 'conversational',
    telepresenceMode: 'virtual_camera_corrected',
    blinkMetrics: {
      currentEar: 0.32,
      baselineEar: 0.32,
      earThreshold: 0.21,
      blinkState: 'OPEN',
      totalBlinksDetected: 0,
      lastBlinkDurationMs: 0,
      blinksPerMinute: 16,
      isBlinkActive: false,
      bellsElevationDeg: 0,
      openFraction: 1.0,
    },
    governance: {
      totalMessagesAudited: 0,
      invariantsPassed: 0,
      maxHopRecorded: 1,
      deadlocksPrevented: 0,
      vectorClock: 1,
      avgInferenceLatencyMs: 6.4,
    },
    activeEdges: [],
    messageHistory: []
  };

  private constructor() {}

  public static getInstance(): AgentEventBus {
    if (!AgentEventBus.instance) {
      AgentEventBus.instance = new AgentEventBus();
    }
    return AgentEventBus.instance;
  }

  public getState(): MultiAgentState {
    return { ...this.state };
  }

  public updateState(updater: (prev: MultiAgentState) => Partial<MultiAgentState>) {
    const changes = updater(this.state);
    this.state = {
      ...this.state,
      ...changes,
      blinkMetrics: changes.blinkMetrics ? { ...this.state.blinkMetrics, ...changes.blinkMetrics } : this.state.blinkMetrics,
      governance: changes.governance ? { ...this.state.governance, ...changes.governance } : this.state.governance
    };
    this.notifyStateSubscribers();
  }

  public subscribe(role: AgentRole, subscriber: MessageSubscriber): () => void {
    if (!this.messageSubscribers.has(role)) {
      this.messageSubscribers.set(role, new Set());
    }
    this.messageSubscribers.get(role)!.add(subscriber);

    return () => {
      this.messageSubscribers.get(role)?.delete(subscriber);
    };
  }

  public subscribeGlobal(subscriber: MessageSubscriber): () => void {
    this.globalSubscribers.add(subscriber);
    return () => {
      this.globalSubscribers.delete(subscriber);
    };
  }

  public subscribeState(subscriber: StateSubscriber): () => void {
    this.stateSubscribers.add(subscriber);
    subscriber(this.state);
    return () => {
      this.stateSubscribers.delete(subscriber);
    };
  }

  private notifyStateSubscribers() {
    this.stateSubscribers.forEach(sub => sub(this.state));
  }

  public async publish(msg: Omit<AgentMessage, 'messageId' | 'timestampMs' | 'vectorClock'>): Promise<AgentMessage> {
    this.state.governance.vectorClock++;

    const fullMessage: AgentMessage = {
      ...msg,
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestampMs: performance.now(),
      vectorClock: this.state.governance.vectorClock,
    };

    // Update governance audits
    this.state.governance.totalMessagesAudited++;
    if (fullMessage.hopCount > this.state.governance.maxHopRecorded) {
      this.state.governance.maxHopRecorded = fullMessage.hopCount;
    }

    // Keep ring buffer of last 60 messages for live log
    const updatedHistory = [fullMessage, ...this.state.messageHistory].slice(0, 60);
    this.state.messageHistory = updatedHistory;

    // Record dynamic edge for visualizer
    if (msg.recipientRole !== 'broadcast') {
      this.recordEdge(msg.senderRole, msg.recipientRole as AgentRole, msg.topic);
    }

    // Route message to direct recipient
    if (msg.recipientRole !== 'broadcast') {
      const recipientSet = this.messageSubscribers.get(msg.recipientRole);
      if (recipientSet) {
        recipientSet.forEach(handler => handler(fullMessage));
      }
    } else {
      // Broadcast to all roles
      this.messageSubscribers.forEach(handlers => {
        handlers.forEach(handler => handler(fullMessage));
      });
    }

    // Global listeners (Live log, visualizer)
    this.globalSubscribers.forEach(handler => handler(fullMessage));

    return fullMessage;
  }

  public recordEdge(from: AgentRole, to: AgentRole, label: string) {
    const color = from.includes('executive') ? '#00f2fe' : from.includes('governance') ? '#8b5cf6' : '#10b981';
    const edge: ActiveEdge = {
      from,
      to,
      label,
      pulseTimeMs: performance.now(),
      color
    };

    // Keep recent edges
    this.state.activeEdges = [edge, ...this.state.activeEdges.filter(e => performance.now() - e.pulseTimeMs < 1200)].slice(0, 8);
  }
}
