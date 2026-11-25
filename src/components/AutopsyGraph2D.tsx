import React from 'react';
import { Network } from 'lucide-react';
import { GraphEdge2D, GraphNode2D } from '../types/necromancer';

interface AutopsyGraph2DProps {
  nodes: GraphNode2D[];
  edges: GraphEdge2D[];
  onSelectLine: (line: number) => void;
  highlightedLine: number | null;
}

export const AutopsyGraph2D: React.FC<AutopsyGraph2DProps> = ({
  nodes,
  edges,
  onSelectLine,
  highlightedLine,
}) => {
  const nodeMap = new Map<string, GraphNode2D>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  return (
    <div className="flex flex-col h-full bg-[#090d14] border border-slate-800/90 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="h-9 shrink-0 px-3 border-b border-slate-800/90 bg-[#0d121c] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-300">
            2D Taint &amp; Call Topology
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">
          Click any node to jump to line
        </span>
      </div>

      {/* Crisp Interactive SVG Canvas */}
      <div className="relative flex-1 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:18px_18px] overflow-hidden">
        <svg
          viewBox="0 0 600 280"
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker
              id="arrow-clean"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#334155" />
            </marker>
            <marker
              id="arrow-tainted"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to) return null;

            const x1 = from.x + 62;
            const y1 = from.y;
            const x2 = to.x - 62;
            const y2 = to.y;
            const cx1 = x1 + (x2 - x1) * 0.5;
            const cx2 = x2 - (x2 - x1) * 0.5;

            return (
              <path
                key={edge.id}
                d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={edge.tainted ? '#f43f5e' : '#334155'}
                strokeWidth={edge.tainted ? 2 : 1.5}
                strokeDasharray={edge.tainted ? '5 4' : undefined}
                markerEnd={edge.tainted ? 'url(#arrow-tainted)' : 'url(#arrow-clean)'}
                className={edge.tainted ? 'animate-pulse' : ''}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const isActive = highlightedLine === node.line;
            const palette =
              node.kind === 'CURSE'
                ? node.severity === 'CRITICAL'
                  ? { fill: '#1f0b14', stroke: '#f43f5e', text: '#fda4af' }
                  : { fill: '#1f160a', stroke: '#f59e0b', text: '#fcd34d' }
                : node.kind === 'SINK'
                ? { fill: '#071c15', stroke: '#10b981', text: '#6ee7b7' }
                : node.kind === 'ENTRY'
                ? { fill: '#131129', stroke: '#8b5cf6', text: '#c4b5fd' }
                : { fill: '#0c1626', stroke: '#38bdf8', text: '#bae6fd' };

            const shortLabel =
              node.label.length > 18 ? `${node.label.slice(0, 16)}..` : node.label;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => onSelectLine(node.line)}
                className="cursor-pointer group"
              >
                <rect
                  x={-62}
                  y={-18}
                  width={124}
                  height={36}
                  rx={8}
                  fill={palette.fill}
                  stroke={isActive ? '#ffffff' : palette.stroke}
                  strokeWidth={isActive ? 2 : 1.4}
                />
                <text
                  x={0}
                  y={4}
                  textAnchor="middle"
                  fill={palette.text}
                  fontSize="10.5"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fontWeight="600"
                >
                  {shortLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
