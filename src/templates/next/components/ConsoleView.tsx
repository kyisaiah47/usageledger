'use client';

/* CONSOLE. The dense read of the ledger: what each tool used, per day, per model, per repo and
 * per session, with every row one click away.
 *
 * One ledger row is one model response. A Claude Code response's input is mostly cache reads, so
 * total tokens overstate fresh work by a wide margin. The output column tracks what was written. */

import { useMemo, useState, type ReactNode } from 'react';
import type { Summary, SessionRow, DayRow } from 'usageledger';
import Mark from '@/components/Mark';
import { RankBars, StackBars, type DayBar } from '@/components/Charts';
import { M, TOOL, TOOLS, hoursAgo, href, n, pct, type Tool } from '@/lib/format';
import { WINDOWS, type Win } from '@/lib/window';

const DIMS = [
  { id: 'model', label: 'Model' },
  { id: 'repo', label: 'Repo' },
  { id: 'origin', label: 'Origin' },
] as const;
type Dim = (typeof DIMS)[number]['id'];

const METRICS = [
  { id: 'total_tokens', label: 'Total' },
  { id: 'output_tokens', label: 'Output' },
] as const;
type Metric = (typeof METRICS)[number]['id'];

function Switch<T extends string>({ options, on, set, label }: { options: readonly { id: T; label: string }[]; on: T; set: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === on} onClick={() => set(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

type Col<T> = { id: string; label: string; right?: boolean; sort: (x: T) => string | number; cell: (x: T) => ReactNode };

function Table<T>({ rows, cols, rowKey, initial, empty }: { rows: T[]; cols: Col<T>[]; rowKey: (x: T) => string; initial: { id: string; dir: 'asc' | 'desc' }; empty: string }) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const col = cols.find((c) => c.id === sort.id) ?? cols[0];
    const out = [...rows].sort((a, b) => {
      const x = col.sort(a);
      const y = col.sort(b);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [rows, cols, sort]);
  if (!rows.length) return <p className="void">{empty}</p>;
  return (
    <div className="scroller">
      <table>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.id} className={c.right ? 'num' : undefined} aria-sort={sort.id === c.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" onClick={() => setSort({ id: c.id, dir: sort.id === c.id && sort.dir === 'desc' ? 'asc' : 'desc' })}>
                  {c.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((x) => (
            <tr key={rowKey(x)}>
              {cols.map((c) => (
                <td key={c.id} className={c.right ? 'num' : undefined}>{c.cell(x)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Chip = ({ tool }: { tool: Tool }) => <span className="chip" style={{ color: TOOL[tool].color }}>{TOOL[tool].label}</span>;

export default function ConsoleView({ summary, example, win, query, sink, toggle }: { summary: Summary; example: boolean; win: Win; query: Record<string, string>; sink: string; toggle?: ReactNode }) {
  const [dim, setDim] = useState<Dim>('model');
  const [metric, setMetric] = useState<Metric>('total_tokens');
  const [sec, setSec] = useState<'sessions' | 'days' | 'ranked'>('sessions');
  const [find, setFind] = useState('');
  const s = summary;
  const t = s.totals;

  const daily: DayBar[] = useMemo(
    () =>
      s.days.map((day) => {
        const row: DayBar = { day, claude_code: 0, codex: 0 };
        for (const r of s.daily) if (r.day === day) row[r.tool] += r[metric];
        return row;
      }),
    [s.days, s.daily, metric],
  );

  const ranked = useMemo(() => {
    const out = new Map<string, { value: number; by: Record<Tool, number> }>();
    for (const r of s.ranks) {
      if (r.dim !== dim) continue;
      const e = out.get(r.key) ?? { value: 0, by: { claude_code: 0, codex: 0 } };
      e.value += r[metric];
      e.by[r.tool] += r[metric];
      out.set(r.key, e);
    }
    /* A bar takes the colour of the tool that spent most of it. */
    return [...out.entries()]
      .map(([id, e]) => ({ id, value: e.value, tone: TOOL[e.by.codex > e.by.claude_code ? 'codex' : 'claude_code'].color }))
      .sort((a, b) => b.value - a.value);
  }, [s.ranks, dim, metric]);

  const sessions = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? s.sessions.filter((x) => `${x.tool} ${x.model ?? ''} ${x.repo ?? ''} ${x.origin ?? ''} ${x.session_id}`.toLowerCase().includes(q)) : s.sessions;
  }, [s.sessions, find]);

  const behind = hoursAgo(s.newest);
  const metricLabel = metric === 'total_tokens' ? 'Tokens' : 'Output tokens';

  return (
    <div className="console">
      <header className="viewhead">
        <div className="brand"><Mark /><h1>Claude + Codex</h1></div>
        <nav className="seg" aria-label="Window">
          {WINDOWS.map((w) => (
            <a key={w.id} href={href(query, { days: w.id })} aria-current={w.id === win ? 'page' : undefined}>{w.label}</a>
          ))}
        </nav>
      </header>
      <p className="lede">
        Tokens spent by Claude Code and Codex on this computer, per day, per model, per repo and per session. This view
        counts tokens. It does not price them.
      </p>
      <p className="src">
        {toggle}
        <span>{sink} ledger</span>
        <span>{s.since} to {s.until}</span>
        <span>{n(s.rowCount)} responses in the ledger</span>
      </p>

      {example ? (
        <p className="void" role="note">
          Your ledger is empty, so this is an example built from the sample logs that ship with UsageLedger. Run{' '}
          <code>npx usageledger sync</code> and reload to see your own numbers.
        </p>
      ) : null}
      {!example && behind != null && behind > 3 ? (
        <p className="void" role="note">
          The newest response in the ledger is from {s.newest}, {behind} hours ago. Run <code>npx usageledger sync</code> to
          read newer logs.
        </p>
      ) : null}

      <section className="reads">
        <article className="read">
          <p>Both tools used <b>{M(t.all.total_tokens)}</b> tokens and wrote <b>{M(t.all.output_tokens)}</b> of them.</p>
          <small>{n(t.all.sessions)} sessions over {s.windowDays} days</small>
        </article>
        {TOOLS.map((tool) => (
          <article className="read" key={tool}>
            <p>
              {TOOL[tool].label} used <b>{M(t[tool].total_tokens)}</b> tokens, {pct(t[tool].total_tokens, t.all.total_tokens)}% of
              the window, and wrote <b>{M(t[tool].output_tokens)}</b>.
            </p>
            <small>{n(t[tool].sessions)} sessions, {n(t[tool].turns)} responses</small>
          </article>
        ))}
        <article className="read">
          <p>Cache reads were <b>{pct(t.all.cache_read_tokens, t.all.total_tokens)}%</b> of all tokens.</p>
          <small>Input served from the prompt cache</small>
        </article>
      </section>

      <section className="band">
        <div className="panel">
          <div className="panel-head">
            <h2>{metricLabel} per day, by tool</h2>
            <Switch options={METRICS} on={metric} set={setMetric} label="Metric" />
          </div>
          <StackBars data={daily} label={`${metricLabel} per day by tool`} />
          <div className="legend">
            {TOOLS.map((tool) => <span key={tool}><i style={{ background: TOOL[tool].color }} />{TOOL[tool].label}</span>)}
          </div>
          <p className="foot">Total counts cache reads, which dominate a long Claude Code session. Output is what the models wrote.</p>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Ranked by {dim}</h2>
            <Switch options={DIMS} on={dim} set={setDim} label="Axis" />
          </div>
          {ranked.length ? <RankBars data={ranked.slice(0, 6)} /> : <p className="void">No rows on the {dim} axis in this window.</p>}
          <p className="foot">The top six of {n(ranked.length)}. A bar takes the colour of the tool that spent most of it.</p>
        </div>
      </section>

      <section className="panel">
        <div className="tabs" role="tablist" aria-label="Sections">
          {([
            ['sessions', `Heaviest sessions (${s.sessions.length})`],
            ['days', `Per day, by tool (${s.daily.length})`],
            ['ranked', `Ranked (${ranked.length})`],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={sec === id} onClick={() => setSec(id)}>{label}</button>
          ))}
        </div>

        {sec === 'sessions' ? (
          <>
            <label className="find">
              <span>Find a session</span>
              <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="model, repo, origin or id" />
            </label>
            <Table<SessionRow>
              rows={sessions}
              rowKey={(x) => `${x.tool}:${x.session_id}`}
              initial={{ id: 'tot', dir: 'desc' }}
              empty="No session in this window."
              cols={[
                { id: 'repo', label: 'Where it ran', sort: (x) => x.repo ?? '', cell: (x) => x.repo ?? 'unrecorded' },
                { id: 'tool', label: 'Tool', sort: (x) => x.tool, cell: (x) => <Chip tool={x.tool} /> },
                { id: 'model', label: 'Model', sort: (x) => x.model ?? '', cell: (x) => <code>{x.model ?? 'unrecorded'}</code> },
                { id: 'start', label: 'Started', sort: (x) => x.started_at, cell: (x) => <code>{x.started_at.slice(0, 16).replace('T', ' ')}</code> },
                { id: 'turns', label: 'Turns', right: true, sort: (x) => x.turns, cell: (x) => n(x.turns) },
                { id: 'out', label: 'Output', right: true, sort: (x) => x.output_tokens, cell: (x) => M(x.output_tokens) },
                { id: 'tot', label: 'Total', right: true, sort: (x) => x.total_tokens, cell: (x) => M(x.total_tokens) },
              ]}
            />
          </>
        ) : null}

        {sec === 'days' ? (
          <Table<DayRow>
            rows={s.daily}
            rowKey={(x) => `${x.day}:${x.tool}`}
            initial={{ id: 'day', dir: 'desc' }}
            empty="No usage in this window."
            cols={[
              { id: 'day', label: 'Day', sort: (x) => x.day, cell: (x) => <code>{x.day}</code> },
              { id: 'tool', label: 'Tool', sort: (x) => x.tool, cell: (x) => <Chip tool={x.tool} /> },
              { id: 'ses', label: 'Sessions', right: true, sort: (x) => x.sessions, cell: (x) => n(x.sessions) },
              { id: 'turns', label: 'Turns', right: true, sort: (x) => x.turns, cell: (x) => n(x.turns) },
              { id: 'in', label: 'Input', right: true, sort: (x) => x.input_tokens, cell: (x) => M(x.input_tokens) },
              { id: 'cr', label: 'Cache read', right: true, sort: (x) => x.cache_read_tokens, cell: (x) => M(x.cache_read_tokens) },
              { id: 'cw', label: 'Cache write', right: true, sort: (x) => x.cache_write_tokens, cell: (x) => M(x.cache_write_tokens) },
              { id: 'out', label: 'Output', right: true, sort: (x) => x.output_tokens, cell: (x) => M(x.output_tokens) },
              { id: 'tot', label: 'Total', right: true, sort: (x) => x.total_tokens, cell: (x) => M(x.total_tokens) },
            ]}
          />
        ) : null}

        {sec === 'ranked' ? (
          <div className="ranked-all">
            <Switch options={DIMS} on={dim} set={setDim} label="Axis" />
            {ranked.length ? <RankBars data={ranked.slice(0, 30)} /> : <p className="void">No rows on the {dim} axis in this window.</p>}
          </div>
        ) : null}
      </section>
    </div>
  );
}
