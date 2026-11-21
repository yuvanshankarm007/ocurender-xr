import React from 'react';
import { AgentMessage } from '../agent-core/types';
import { Terminal, Shield, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';

interface LiveAgentLogProps {
  messages: AgentMessage[];
}

export const LiveAgentLog: React.FC<LiveAgentLogProps> = ({ messages }) => {
  return (
    <div className="bg-cyber-card border border-cyber-border rounded-2xl p-4 shadow-xl flex flex-col h-[280px]">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-cyber-border/60">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Live Multi-Agent Communication Bus
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping-slow" />
          <span className="text-[10px] font-mono text-emerald-300">INTER-AGENT NEGOTIATION STREAM</span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[11px]">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 italic">
            Connecting agents to decentralized peer bus...
          </div>
        ) : (
          messages.slice(0, 30).map((msg) => {
            const isExecutive = msg.senderRole.includes('executive');
            const isGovernance = msg.senderRole.includes('governance');
            const isBlink = msg.intent === 'BLINK_DETECTED';

            const badgeColor = isBlink
              ? 'bg-purple-950 border-purple-800 text-purple-300'
              : isExecutive
              ? 'bg-cyan-950 border-cyan-800 text-cyan-300'
              : isGovernance
              ? 'bg-violet-950 border-violet-800 text-violet-300'
              : 'bg-slate-900 border-slate-700 text-slate-300';

            return (
              <div
                key={msg.messageId}
                className="p-2 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition flex flex-col gap-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Sender */}
                    <span className="font-bold text-slate-200">{msg.senderLabel}</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                    {/* Recipient */}
                    <span className="text-slate-400">{msg.recipientLabel}</span>
                  </div>

                  {/* Hop Count & Vector Clock */}
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800">
                      Hop {msg.hopCount}/5
                    </span>
                    <span>T={msg.vectorClock}</span>
                  </div>
                </div>

                {/* Intent & Explanation */}
                <div className="flex items-start gap-2">
                  <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold border ${badgeColor}`}>
                    {msg.intent}
                  </span>
                  <span className="text-slate-300 flex-1 leading-snug">
                    {msg.explanation}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
