'use client';

/* SIMPLE. The same ledger, read as a few sentences. The answer comes first, the schedule and the
 * full breakdown sit in a bento below it, and the counting rules that make the totals trustworthy
 * get their own band. The first action is the one command that fills the ledger. */

import { useId, useState, type ReactNode } from 'react';
import type { Summary } from 'usageledger';
import { MARK_VIEWBOX, markGlyph } from '@/icons/mark.generated';
import Waves from '@/components/Waves';
import { M, TOOL, TOOLS, href, n, pct, top } from '@/lib/format';
import { WINDOWS, type Win } from '@/lib/window';

/** The mark on the light Simple ground: the registry glyph without its dark plate. */
export function SimpleMark({ size = 26 }: { size?: number }) {
  return <svg width={size} height={size} viewBox={MARK_VIEWBOX} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: markGlyph() }} />;
}

export function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="disclosure" data-open={open}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span>{open ? 'Hide' : 'Show'} {label}</span>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
      <div className="disclosure-body" id={id} inert={!open} aria-hidden={!open}>
        <div>{children}</div>
      </div>
    </div>
  );
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="command">
      <code>{command}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Sentences({ s }: { s: Summary }) {
  const t = s.totals;
  if (!t.all.turns) return <p>The ledger has no usage between {s.since} and {s.until}.</p>;
  return (
    <>
      {TOOLS.filter((tool) => t[tool].turns).map((tool) => (
        <p key={tool}>
          {TOOL[tool].label} used {M(t[tool].total_tokens)} tokens in {n(t[tool].sessions)} sessions and wrote {M(t[tool].output_tokens)} of them.
        </p>
      ))}
      <p>Cache reads were {pct(t.all.cache_read_tokens, t.all.total_tokens)}% of all tokens.</p>
    </>
  );
}

function DaysTable({ s }: { s: Summary }) {
  if (!s.daily.length) return <p className="void">No usage in this window.</p>;
  return (
    <div className="scroller">
      <table>
        <thead>
          <tr><th>Day</th><th>Tool</th><th className="num">Sessions</th><th className="num">Output</th><th className="num">Total</th></tr>
        </thead>
        <tbody>
          {[...s.daily].reverse().map((r) => (
            <tr key={`${r.day}:${r.tool}`}>
              <td><code>{r.day}</code></td>
              <td>{TOOL[r.tool].label}</td>
              <td className="num">{n(r.sessions)}</td>
              <td className="num">{M(r.output_tokens)}</td>
              <td className="num">{M(r.total_tokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const AXES = [
  { id: 'model', label: 'Models' },
  { id: 'repo', label: 'Repos' },
  { id: 'origin', label: 'Origins' },
] as const;

function AxisLedger({ s }: { s: Summary }) {
  const groups = AXES.map((axis) => ({ ...axis, rows: top(s, axis.id).all }));
  if (!groups.some((g) => g.rows.length)) return <p className="void">No rows in this window.</p>;
  return (
    <div className="sv-ledger">
      {groups.map((g) => (
        <div className="sv-grp" key={g.id}>
          <span className="sv-grpk">{g.label}</span>
          <ul>
            {g.rows.length ? (
              g.rows.slice(0, 6).map(([key, value]) => (
                <li key={key}><code>{key}</code><span>{M(value)}</span></li>
              ))
            ) : (
              <li className="sv-empty">None recorded</li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ScheduleTabs() {
  const [tab, setTab] = useState<'cron' | 'launchd'>('cron');
  return (
    <div className="sv-sched">
      <div className="sv-schedtabs" role="tablist" aria-label="Scheduler">
        <span role="tab" aria-selected={tab === 'cron'} onClick={() => setTab('cron')}>cron</span>
        <span role="tab" aria-selected={tab === 'launchd'} onClick={() => setTab('launchd')}>launchd</span>
      </div>
      <pre>
        {tab === 'cron'
          ? '*/30 * * * * npx --yes usageledger sync >> ~/.usageledger/sync.log 2>&1'
          : '<key>StartInterval</key><integer>1800</integer>\n<string>npx --yes usageledger sync</string>'}
      </pre>
    </div>
  );
}

export default function SimpleView({ summary, example, win, query, consoleHref, sink, toggle }: { summary: Summary; example: boolean; win: Win; query: Record<string, string>; consoleHref?: string; sink?: string; toggle?: ReactNode }) {
  const s = summary;
  const label = example ? 'The sample logs' : win === 'all' ? 'Everything in the ledger' : `The last ${win} days`;
  const model = top(s, 'model');
  const repo = top(s, 'repo');

  return (
    <div className="simple sv-a3">
      <div className="sv-herozone">
        <Waves />
        <header className="simple-head sv-nav">
          <div className="navl">
            <div className="brand-lock">
              <a className="brand" href="/"><SimpleMark /><span>UsageLedger</span></a>
              {toggle}
            </div>
            <nav aria-label="Sections">
              <a href="#window">Your window</a>
              <a href="#ledger">Every row</a>
              <a href="#how">Counting</a>
            </nav>
          </div>
          <div className="sv-ctas">
            <a className="sv-txt" href="https://github.com/kyisaiah47/usageledger">GitHub</a>
            <a className="sv-btn" href="https://www.npmjs.com/package/usageledger">View on npm</a>
          </div>
        </header>

        <section className="hero">
          <div>
            <h1>See where your Claude Code and Codex tokens went.</h1>
            <p>
              UsageLedger reads the session logs that Claude Code and Codex keep on this computer. It adds up the tokens each
              tool used, per day, per model and per repo.
            </p>
            <p className="qualifier">It stores no file paths. Nothing leaves this computer.</p>
          </div>
          <div className="sv-cmdbox">
            <div className="sv-cmdtop">
              <span className="sv-dot" style={{ background: TOOL.claude_code.color }} />
              <span className="sv-dot" style={{ background: TOOL.codex.color }} />
              Reads Claude Code and Codex logs, then writes to a local ledger.
            </div>
            <CopyCommand command="npx usageledger sync" />
            <p className="small">Reload this page when it finishes.</p>
            <div className="seg" role="group" aria-label="Window">
              {WINDOWS.map((w) => (
                <a key={w.id} href={href(query, { days: w.id })} aria-current={w.id === win ? 'page' : undefined}>{w.label}</a>
              ))}
            </div>
          </div>
        </section>

        <div className="sv-strip">
          <div>What UsageLedger reads and where it writes.</div>
          <div><span className="sv-dot" style={{ background: TOOL.claude_code.color }} />Claude Code</div>
          <div><span className="sv-dot" style={{ background: TOOL.codex.color }} />Codex</div>
          <div><code>{sink ?? 'sqlite'}</code> ledger</div>
          <div>No network call</div>
        </div>
      </div>

      <section className="sect" id="window">
        <div className="sect-head">
          <p className="label">Your window</p>
          <h2>{label}</h2>
          <p>{s.since} to {s.until}, {example ? 'from the sample logs that ship with UsageLedger' : 'read from the ledger on this computer'}.</p>
        </div>

        <div className="sv-bento">
          <article className="sv-cell sv-s6 sv-report">
            <div className="sv-half">
              <h3>What happened</h3>
              {example ? <p className="example-tag">Example</p> : null}
              <Sentences s={s} />
            </div>
            <div className="sv-half">
              <h3>Where it went</h3>
              {model.first ? (
                <>
                  <p>The model that used the most tokens was <code>{model.first[0]}</code>, with {M(model.first[1])}.</p>
                  {repo.first ? <p>The repo that used the most was <code>{repo.first[0]}</code>, with {M(repo.first[1])}.</p> : null}
                  <a className="sv-more" href="#ledger">Every model, repo and origin</a>
                </>
              ) : (
                <p>Nothing was recorded in this window.</p>
              )}
            </div>
          </article>

          <article className="sv-cell sv-s4">
            <h3>Keep it current</h3>
            <p>Run the sync on a schedule. Each run reads only new bytes, so a run every 30 minutes is cheap.</p>
            <div className="sv-viz">
              <ScheduleTabs />
            </div>
          </article>

          <article className="sv-cell sv-s2">
            <h3>Per day</h3>
            <p>Every day the ledger has a row for.</p>
            <DaysTable s={s} />
          </article>
        </div>
      </section>

      <section className="sect" id="ledger">
        <div className="sect-head">
          <p className="label">Where it went</p>
          <h2>Every model, repo and origin</h2>
          <p>A repo is the base name of the folder a session ran in. The full path is not stored unless you turn on <code>--raw-cwd</code>.</p>
        </div>
        {example ? <p className="example-tag">Example</p> : null}
        <AxisLedger s={s} />
      </section>

      <div className="sv-darkband">
        <div className="sv-darkhead">
          <p className="label">Counting</p>
          <h2>How UsageLedger counts each response once.</h2>
          <p>Claude Code writes one log line per content block of a response, and the early lines carry a partial output count.</p>
        </div>
        <div className="sv-dgrid">
          <div className="sv-dcard">
            <h3>Content blocks</h3>
            <p>Claude Code writes one log line per content block of a response.</p>
            <ul>
              <li><span>Two lines for one response</span><span>coalesced</span></li>
              <li><span>A partial output count on the early line</span><span>replaced</span></li>
              <li><span>The same response in a subagent file</span><span>kept once</span></li>
            </ul>
          </div>
          <div className="sv-dcard">
            <h3>Cache tokens</h3>
            <p>Codex counts cached tokens inside its input count, so UsageLedger subtracts them.</p>
            <ul>
              <li><span>Cached tokens inside Codex input</span><span>subtracted</span></li>
              <li><span>A repeated Codex token event</span><span>skipped</span></li>
              <li><span>Claude Code and Codex input</span><span>mean the same thing</span></li>
            </ul>
          </div>
        </div>
      </div>

      <section className="sect">
        <div className="sect-head">
          <p className="label">Cost</p>
          <h2>Free</h2>
          <p>UsageLedger is free and MIT licensed. It counts tokens and does not price them.</p>
        </div>
      </section>

      <section className="sect" id="next">
        <div className="sect-head">
          <p className="label">Next</p>
          <h2>Other ways to read it</h2>
          <p>The same ledger answers in the terminal and in the dense view.</p>
        </div>
        <div className="next-links">
          {consoleHref ? (
            <a href={consoleHref}><b>Open the Console view</b><span>Charts, every session and every day in one screen.</span></a>
          ) : (
            <a href={href(query, { days: 'all' })}><b>See everything</b><span>Widen the window to every day in the ledger.</span></a>
          )}
          <a href="https://github.com/kyisaiah47/usageledger#keep-it-current"><b>Sync on a schedule</b><span>Run the sync every 30 minutes with cron or launchd.</span></a>
          <a href="https://github.com/kyisaiah47/usageledger#report"><b>Print a report</b><span><code>npx usageledger report</code> prints the same totals as tables.</span></a>
        </div>
      </section>
    </div>
  );
}
