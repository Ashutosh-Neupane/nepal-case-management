import { useNavigate } from 'react-router-dom';
import { rupeesShort } from '@/lib/format';
import type { NetworkEdge, NetworkNode } from '@/lib/types';

const W = 880;
const ROW = 56;
const COL = [110, 400, 700];
const NODE_W = { subject: 190, account: 150, counterparty: 220 };

/**
 * Money flow around a subject in three columns: the subject, their accounts, and the
 * parties those accounts traded with. Line width follows the amount moved.
 */
export function NetworkGraph({ nodes, edges, focusId }: { nodes: NetworkNode[]; edges: NetworkEdge[]; focusId: string }) {
  const navigate = useNavigate();
  const accounts = nodes.filter((n) => n.kind === 'account');
  const others = nodes.filter((n) => n.id !== focusId && n.kind !== 'account');
  const rows = Math.max(accounts.length, others.length, 1);
  const height = rows * ROW + 40;
  const y = (i: number, count: number) => 20 + ROW / 2 + i * ROW + ((rows - count) * ROW) / 2;

  const pos = new Map<string, { x: number; y: number }>();
  pos.set(focusId, { x: COL[0], y: height / 2 });
  accounts.forEach((n, i) => pos.set(n.id, { x: COL[1], y: y(i, accounts.length) }));
  others.forEach((n, i) => pos.set(n.id, { x: COL[2], y: y(i, others.length) }));

  const maxFlow = Math.max(1, ...edges.map((e) => e.inflow + e.outflow));
  const width = (e: NetworkEdge) => 1.5 + 5 * Math.sqrt((e.inflow + e.outflow) / maxFlow);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${height}`} className="min-w-[720px]" role="img" aria-label="Money flow network">
        {edges.map((e) => {
          const a = pos.get(e.from); const b = pos.get(e.to);
          if (!a || !b) return null;
          const fromNode = byId.get(e.from)!; const toNode = byId.get(e.to)!;
          const x1 = a.x + NODE_W[fromNode.kind] / 2; const x2 = b.x - NODE_W[toNode.kind] / 2;
          const mx = (x1 + x2) / 2;
          const linked = toNode.kind === 'subject';
          const flow = [e.inflow && `in ${rupeesShort(e.inflow)}`, e.outflow && `out ${rupeesShort(e.outflow)}`].filter(Boolean).join(' · ');
          return (
            <g key={`${e.from}>${e.to}`}>
              <title>{`${fromNode.label} ↔ ${toNode.label}: ${flow} (${e.count} transactions)`}</title>
              <path d={`M${x1},${a.y} C${mx},${a.y} ${mx},${b.y} ${x2},${b.y}`} fill="none"
                stroke={linked ? '#c8102e' : '#94a3b8'} strokeOpacity={linked ? 0.8 : 0.55} strokeWidth={width(e)} strokeLinecap="round" />
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const w = NODE_W[n.kind];
          const focus = n.id === focusId;
          const linked = n.kind === 'subject' && !focus;
          const edge = edges.find((e) => e.to === n.id);
          const sub = n.kind === 'counterparty' || linked
            ? [edge?.inflow && `in ${rupeesShort(edge.inflow)}`, edge?.outflow && `out ${rupeesShort(edge.outflow)}`].filter(Boolean).join(' · ')
            : n.sublabel;
          const fill = focus ? '#003893' : linked ? '#fdf2f3' : n.kind === 'account' ? '#eef3fb' : '#fff';
          const stroke = focus ? '#003893' : linked ? '#c8102e' : n.kind === 'account' ? '#d5e1f4' : '#cbd5e1';
          return (
            <g key={n.id} transform={`translate(${p.x - w / 2},${p.y - 20})`}
              className={linked ? 'cursor-pointer' : undefined}
              onClick={linked ? () => navigate(`/subjects/${n.subjectId}`) : undefined}>
              <title>{n.label}{n.sublabel ? ` · ${n.sublabel}` : ''}</title>
              <rect width={w} height={40} rx={8} fill={fill} stroke={stroke} strokeWidth={linked ? 1.5 : 1} />
              <text x={12} y={17} fontSize={12} fontWeight={600} fill={focus ? '#fff' : '#0f172a'} fontFamily={n.kind === 'account' ? 'JetBrains Mono, monospace' : undefined}>
                {n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label}{n.isPep ? ' · PEP' : ''}
              </text>
              {sub && <text x={12} y={31} fontSize={10.5} fill={focus ? '#d5e1f4' : '#64748b'}>{sub}</text>}
            </g>
          );
        })}
      </svg>
      <p className="flex flex-wrap gap-x-5 gap-y-1 px-5 pb-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-crimson-600" /> Another known subject (click to open)</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-slate-400" /> Other counterparty</span>
        <span>Thicker line, more money moved</span>
      </p>
    </div>
  );
}
