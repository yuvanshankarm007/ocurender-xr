import React, { useMemo } from 'react';
import { MultiAgentState, AgentRole } from '../agent-core/types';
import { Sparkles, Shield, Eye, Brain, Compass, Cpu, Layers, Activity } from 'lucide-react';

interface VisualizerProps {
  state: MultiAgentState;
}

interface NodeCoord {
  id: AgentRole;
  label: string;
  sublabel: string;
  tier: number;
  x: number;
  y: number;
  icon: any;
  color: string;
}

export const AgentWebVisualizer: React.FC<VisualizerProps> = ({ state }) => {
  const width = 840;
  const height = 280;

  const nodes: NodeCoord[] = useMemo(() => [
    // Tier 1: Executive & Governance
    {
      id: 'agent.executive.orchestrator',
      label: 'Chief Orchestrator',
      sublabel: 'Tier 1 Executive',
      tier: 1,
      x: 320,
      y: 45,
      icon: Sparkles,
      color: '#00f2fe' // Cyan
    },
    {
      id: 'agent.governance.auditor',
      label: 'Convergence Auditor',
      sublabel: 'Tier 1 Governance',
      tier: 1,
      x: 520,
      y: 45,
      icon: Shield,
      color: '#8b5cf6' // Violet
    },

    // Tier 2: Horizontal Peer Web
    {
      id: 'agent.specialist.gaze_blink',
      label: 'Gaze & EAR Blink Specialist',
      sublabel: 'Tier 2 Sensory Peer',
      tier: 2,
      x: 130,
      y: 145,
      icon: Eye,
      color: '#10b981' // Emerald
    },
    {
      id: 'agent.specialist.biomechanics',
      label: 'Ocular Biomechanics',
      sublabel: 'Tier 2 Kinematics Peer',
      tier: 2,
      x: 330,
      y: 145,
      icon: Brain,
      color: '#ec4899' // Pink
    },
    {
      id: 'agent.specialist.virtual_camera',
      label: 'Virtual Camera & Parallax',
      sublabel: 'Tier 2 Graphics Peer',
      tier: 2,
      x: 510,
      y: 145,
      icon: Compass,
      color: '#3b82f6' // Blue
    },
    {
      id: 'agent.specialist.fovea_optimizer',
      label: 'Foveated Compute',
      sublabel: 'Tier 2 Compute Peer',
      tier: 2,
      x: 710,
      y: 145,
      icon: Cpu,
      color: '#f59e0b' // Amber
    },

    // Tier 3: Execution Layer
    {
      id: 'agent.sensory.mediapipe',
      label: 'MediaPipe 478-pt Wasm',
      sublabel: 'Tier 3 Sensory Ingestion',
      tier: 3,
      x: 230,
      y: 235,
      icon: Activity,
      color: '#06b6d4'
    },
    {
      id: 'agent.renderer.threejs',
      label: 'Three.js 60 FPS Stage',
      sublabel: 'Tier 3 WebGL Pipeline',
      tier: 3,
      x: 610,
      y: 235,
      icon: Layers,
      color: '#6366f1'
    }
  ], []);

  // Map nodes by id for coordinates
  const nodeMap = useMemo(() => {
    const map = new Map<AgentRole, NodeCoord>();
    nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [nodes]);

  // Static bidirectional backbone connections
  const baseEdges = useMemo(() => [
    // Tier 1 Supervisory
    { from: 'agent.executive.orchestrator', to: 'agent.governance.auditor' },
    { from: 'agent.executive.orchestrator', to: 'agent.specialist.gaze_blink' },
    { from: 'agent.executive.orchestrator', to: 'agent.specialist.biomechanics' },
    { from: 'agent.executive.orchestrator', to: 'agent.specialist.virtual_camera' },

    // Tier 2 Horizontal Peer-to-Peer Web
    { from: 'agent.specialist.gaze_blink', to: 'agent.specialist.virtual_camera' },
    { from: 'agent.specialist.biomechanics', to: 'agent.specialist.virtual_camera' },
    { from: 'agent.specialist.virtual_camera', to: 'agent.specialist.fovea_optimizer' },
    { from: 'agent.specialist.fovea_optimizer', to: 'agent.governance.auditor' },

    // Tier 3 Execution Bindings
    { from: 'agent.sensory.mediapipe', to: 'agent.specialist.gaze_blink' },
    { from: 'agent.specialist.virtual_camera', to: 'agent.renderer.threejs' },
  ], []);

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-2xl p-4 shadow-xl flex flex-col">
      {/* Visualizer Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-cyber-border/60">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            3-Tier Bidirectional Multi-Agent Web Topology
          </h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-300">
            BOUNDED HOP ≤ 5
          </span>
        </div>

        {/* Live Governance Stats */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-slate-400">
            <span>Vector Clock:</span>
            <span className="font-bold text-cyan-300">{state.governance.vectorClock}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span>Audited Messages:</span>
            <span className="font-bold text-emerald-400">{state.governance.totalMessagesAudited}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span>Invariants Passed:</span>
            <span className="font-bold text-purple-400">{state.governance.invariantsPassed}</span>
          </div>
        </div>
      </div>

      {/* SVG Interactive Canvas */}
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[700px] select-none">
          {/* Subtle grid background */}
          <defs>
            <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.6" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Tier Separator Bands */}
          <rect x="10" y="10" width={width - 20} height="70" rx="10" fill="#0b1322" stroke="#1e293b" strokeDasharray="3 3" opacity="0.5" />
          <text x="25" y="32" fill="#64748b" fontSize="10" fontFamily="monospace" fontWeight="bold">TIER 1: SUPERVISORY &amp; GOVERNANCE</text>

          <rect x="10" y="90" width={width - 20} height="95" rx="10" fill="#080e1a" stroke="#1e293b" strokeDasharray="3 3" opacity="0.5" />
          <text x="25" y="110" fill="#64748b" fontSize="10" fontFamily="monospace" fontWeight="bold">TIER 2: DOMAIN SPECIALIST WEB (PEER-TO-PEER)</text>

          <rect x="10" y="195" width={width - 20} height="75" rx="10" fill="#060b14" stroke="#1e293b" strokeDasharray="3 3" opacity="0.5" />
          <text x="25" y="215" fill="#64748b" fontSize="10" fontFamily="monospace" fontWeight="bold">TIER 3: SENSORY &amp; EXECUTION</text>

          {/* Static Backbone Edges */}
          {baseEdges.map((edge, idx) => {
            const n1 = nodeMap.get(edge.from as AgentRole);
            const n2 = nodeMap.get(edge.to as AgentRole);
            if (!n1 || !n2) return null;
            return (
              <line
                key={`base_${idx}`}
                x1={n1.x}
                y1={n1.y}
                x2={n2.x}
                y2={n2.y}
                stroke="#1e2e4d"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            );
          })}

          {/* Active Pulsing Dynamic Edges from EventBus */}
          {state.activeEdges.map((edge, idx) => {
            const n1 = nodeMap.get(edge.from);
            const n2 = nodeMap.get(edge.to);
            if (!n1 || !n2) return null;
            const midX = (n1.x + n2.x) / 2;
            const midY = (n1.y + n2.y) / 2;
            return (
              <g key={`active_${idx}`}>
                {/* Glow line */}
                <line
                  x1={n1.x}
                  y1={n1.y}
                  x2={n2.x}
                  y2={n2.y}
                  stroke={edge.color}
                  strokeWidth="3"
                  filter="url(#glow)"
                />
                {/* Traveling packet circle */}
                <circle
                  r="5"
                  fill="#ffffff"
                  stroke={edge.color}
                  strokeWidth="2"
                  filter="url(#glow)"
                >
                  <animate
                    attributeName="cx"
                    from={n1.x}
                    to={n2.x}
                    dur="0.6s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    from={n1.y}
                    to={n2.y}
                    dur="0.6s"
                    repeatCount="indefinite"
                  />
                </circle>
                {/* Secondary wave packet */}
                <circle
                  cx={midX}
                  cy={midY}
                  r="8"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  opacity="0.8"
                  className="animate-ping"
                />
                {/* Packet payload label tag */}
                {edge.label && (
                  <g transform={`translate(${midX}, ${midY - 10})`}>
                    <rect
                      x="-42"
                      y="-9"
                      width="84"
                      height="18"
                      rx="5"
                      fill="#020617"
                      stroke={edge.color}
                      strokeWidth="1"
                      opacity="0.95"
                    />
                    <text
                      x="0"
                      y="3.5"
                      fill="#e2e8f0"
                      fontSize="8"
                      fontFamily="monospace"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {edge.label.length > 14 ? edge.label.slice(0, 13) + '…' : edge.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const Icon = node.icon;
            const isTop = node.tier === 1;
            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                {/* Node Box */}
                <rect
                  x="-75"
                  y="-22"
                  width="150"
                  height="44"
                  rx="10"
                  fill="#0e172a"
                  stroke={node.color}
                  strokeWidth={isTop ? '2' : '1.5'}
                  filter={isTop ? 'url(#glow)' : undefined}
                />

                {/* Icon Box */}
                <circle cx="-52" cy="0" r="12" fill={node.color} opacity="0.2" />
                <foreignObject x="-60" y="-8" width="16" height="16">
                  <Icon className="w-4 h-4" style={{ color: node.color }} />
                </foreignObject>

                {/* Node Text */}
                <text x="-34" y="-3" fill="#f8fafc" fontSize="10.5" fontWeight="bold" fontFamily="sans-serif">
                  {node.label}
                </text>
                <text x="-34" y="11" fill="#94a3b8" fontSize="8.5" fontFamily="monospace">
                  {node.sublabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
