// Typed definitions for Multi-Agent Bidirectional Architecture

export type AgentRole =
  // Tier 1: Supervisory & Governance
  | 'agent.executive.orchestrator'
  | 'agent.governance.auditor'
  // Tier 2: Domain Specialist Web (Horizontal Peer Network)
  | 'agent.specialist.gaze_blink'
  | 'agent.specialist.biomechanics'
  | 'agent.specialist.virtual_camera'
  | 'agent.specialist.fovea_optimizer'
  // Tier 3: Sensory & Execution Layer
  | 'agent.sensory.mediapipe'
  | 'agent.renderer.threejs';

export type AgentTier = 1 | 2 | 3;

export type MessageIntent =
  | 'SESSION_DIRECTIVE'
  | 'PEER_PROPOSAL'
  | 'TELEMETRY_STREAM'
  | 'BLINK_DETECTED'
  | 'PARALLAX_REALIGNED'
  | 'CONVERGENCE_AUDIT'
  | 'ARBITRATION_VETO'
  | 'CALIBRATION_EVENT'
  | 'OPTIMIZE_FILL_RATE'
  | 'COGNITIVE_GAZE_INFILL';

export interface AgentMessage<T = any> {
  messageId: string;
  senderRole: AgentRole;
  senderLabel: string;
  recipientRole: AgentRole | 'broadcast';
  recipientLabel: string;
  intent: MessageIntent;
  topic: string;
  payload: T;
  explanation: string;
  hopCount: number;
  timestampMs: number;
  correlationId: string;
  vectorClock: number;
}

export interface BlinkMetrics {
  currentEar: number;          // Eye Aspect Ratio (typically 0.25 - 0.38 open, < 0.18 closed)
  baselineEar: number;         // Dynamic personalized resting baseline
  earThreshold: number;        // Dynamic trigger threshold
  blinkState: 'OPEN' | 'CLOSING' | 'CLOSED' | 'REOPENING';
  totalBlinksDetected: number;
  lastBlinkDurationMs: number;
  blinksPerMinute: number;
  isBlinkActive: boolean;
  bellsElevationDeg: number;   // Upward ocular elevation during blink
  openFraction: number;        // Continuous smoothed aperture [0.0 = closed, 1.0 = open]
}

export interface GovernanceMetrics {
  totalMessagesAudited: number;
  invariantsPassed: number;
  maxHopRecorded: number;
  deadlocksPrevented: number;
  vectorClock: number;
  avgInferenceLatencyMs: number;
}

export interface ActiveEdge {
  from: AgentRole;
  to: AgentRole;
  label: string;
  pulseTimeMs: number;
  color: string;
}

export interface MultiAgentState {
  sessionId: string;
  currentStep: string;
  activeMode: 'live_webcam' | 'biomechanical_synth';
  cognitiveState: 'conversational' | 'reading' | 'visual_search' | 'daydreaming';
  telepresenceMode: 'virtual_camera_corrected' | 'headset_passthrough_raw';
  blinkMetrics: BlinkMetrics;
  governance: GovernanceMetrics;
  activeEdges: ActiveEdge[];
  messageHistory: AgentMessage[];
}
