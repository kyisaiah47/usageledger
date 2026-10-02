import { M, TOOL, TOOLS, n, type Tool } from '@/lib/format';

export type DayBar = { day: string } & Record<Tool, number>;

/** Tokens per day, stacked by tool. Every day in the window gets a slot, empty days included. */
export function StackBars({ data, label }: { data: DayBar[]; label: string }) {
  const W = 640;
  const H = 220;
  const padL = 44;
  const padB = 22;
  const count = Math.max(1, data.length);
  const max = Math.max(1, ...data.map((d) => d.claude_code + d.codex));
  const slot = (W - padL) / count;
  const bw = Math.max(2, slot - 2);
  const step = Math.max(1, Math.ceil(count / 8));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      {[0, 0.5, 1].map((f) => {
        const y = H - padB - f * (H - padB - 10);
        return (
          <g key={f}>
            <line x1={padL} x2={W} y1={y} y2={y} stroke="var(--rule)" />
            <text x={padL - 6} y={y + 4} textAnchor="end">{M(max * f)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        let y = H - padB;
        const x = padL + i * slot + 1;
        return (
          <g key={d.day}>
            {TOOLS.map((t) => {
              const h = (d[t] / max) * (H - padB - 10);
              if (h <= 0) return null;
              y -= h;
              return (
                <rect key={t} x={x} y={y} width={bw} height={h} fill={TOOL[t].color}>
                  <title>{`${d.day} ${TOOL[t].label}: ${n(d[t])}`}</title>
                </rect>
              );
            })}
            {i % step === 0 ? (
              <text x={x + bw / 2} y={H - 6} textAnchor="middle">{d.day.slice(5)}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export type RankItem = { id: string; value: number; tone: string };

/** Horizontal bars, longest first. */
export function RankBars({ data }: { data: RankItem[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ol className="rank">
      {data.map((d) => (
        <li key={d.id}>
          <span className="rank-name" title={d.id}>{d.id}</span>
          <span className="rank-value">{M(d.value)}</span>
          <span className="rank-bar"><span style={{ width: `${(d.value / max) * 100}%`, background: d.tone }} /></span>
        </li>
      ))}
    </ol>
  );
}
