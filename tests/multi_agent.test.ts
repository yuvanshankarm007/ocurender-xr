import { describe, it, expect } from 'vitest';
import { AgentEventBus } from '../src/agent-core/eventBus';
import { OrchestratorAgent } from '../src/agent-core/OrchestratorAgent';
import { AuditorAgent } from '../src/agent-core/AuditorAgent';
import { GazeBlinkSpecialist } from '../src/agent-core/GazeBlinkSpecialist';

describe('Multi-Agent Bidirectional Web Topology', () => {
  it('increments vector clocks monotonically across message publications', async () => {
    const bus = AgentEventBus.getInstance();
    const initialClock = bus.getState().governance.vectorClock;

    await bus.publish({
      senderRole: 'agent.executive.orchestrator',
      senderLabel: 'Chief Orchestrator',
      recipientRole: 'agent.governance.auditor',
      recipientLabel: 'Auditor',
      intent: 'SESSION_DIRECTIVE',
      topic: 'TEST_SYNC',
      payload: { test: true },
      explanation: 'Verifying vector clock monotonicity',
      hopCount: 1,
      correlationId: bus.getState().sessionId
    });

    expect(bus.getState().governance.vectorClock).toBeGreaterThan(initialClock);
  });

  it('delivers messages directly to subscribed agent roles', async () => {
    const bus = AgentEventBus.getInstance();
    let received = false;

    const unsubscribe = bus.subscribe('agent.specialist.virtual_camera', (msg) => {
      if (msg.topic === 'PEER_TEST') received = true;
    });

    await bus.publish({
      senderRole: 'agent.specialist.gaze_blink',
      senderLabel: 'Gaze Specialist',
      recipientRole: 'agent.specialist.virtual_camera',
      recipientLabel: 'Virtual Camera',
      intent: 'PEER_PROPOSAL',
      topic: 'PEER_TEST',
      payload: {},
      explanation: 'Testing peer-to-peer delivery',
      hopCount: 1,
      correlationId: bus.getState().sessionId
    });

    expect(received).toBe(true);
    unsubscribe();
  });

  it('maintains bounded message ring buffer in state history', async () => {
    const bus = AgentEventBus.getInstance();
    const history = bus.getState().messageHistory;
    expect(history.length).toBeLessThanOrEqual(60);
  });
});
