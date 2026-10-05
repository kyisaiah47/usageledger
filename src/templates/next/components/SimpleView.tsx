'use client';

/* SIMPLE. The same ledger, read as a few sentences. The answer comes first and the tables open
 * on request. The first action is the one command that fills the ledger. */

import { useId, useState, type ReactNode } from 'react';
import type { Summary } from 'usageledger';
import Mark from '@/components/Mark';
import { M, TOOL, TOOLS, href, n, pct, top } from '@/lib/format';
import { WINDOWS, type Win } from '@/lib/window';

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
  if (!s.daily.length) return <p>No usage in this window.</p>;
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

function WhereItWent({ s }: { s: Summary }) {
  const model = top(s, 'model');
  const repo = top(s, 'repo');
  if (!model.first) return <p>Nothing was recorded in this window.</p>;
  return (
    <>
      <p>The model that used the most tokens was <code>{model.first[0]}</code>, with {M(model.first[1])}.</p>
      {repo.first ? <p>The repo that used the most was {repo.first[0]}, with {M(repo.first[1])}.</p> : null}
      <Disclosure label="every model and repo">
        <div className="two">
          {[['Models', model.all], ['Repos', repo.all]].map(([title, rows]) => (
            <div key={title as string}>
              <h4>{title as string}</h4>
              <ul className="plain">
                {(rows as [string, number][]).map(([k, v]) => (
                  <li key={k}><span>{k}</span><span>{M(v)}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Disclosure>
    </>
  );
}

export default function SimpleView({ summary, example, win, query, consoleHref, toggle }: { summary: Summary; example: boolean; win: Win; query: Record<string, string>; consoleHref?: string; toggle?: ReactNode }) {
  const s = summary;
  const label = example ? 'The sample logs' : win === 'all' ? 'Everything in the ledger' : `The last ${win} days`;
  return (
    <div className="simple">
      <header className="simple-head">
        <div className="brand-lock"><div className="brand"><Mark /><span>UsageLedger</span></div>{toggle}</div>
        <nav aria-label="Sections">
          <a href="#window">Your window</a>
          <a href="#where">Where it went</a>
          <a href="#next">Commands</a>
        </nav>
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
        <div className="action">
          <h2>Read the newest logs</h2>
          <p>Run this in a terminal. It reads only what the logs gained since the last run.</p>
          <CopyCommand command="npx usageledger sync" />
          <p className="small">Reload this page when it finishes.</p>
          <div className="seg" role="group" aria-label="Window">
            {WINDOWS.map((w) => (
              <a key={w.id} href={href(query, { days: w.id })} aria-current={w.id === win ? 'page' : undefined}>{w.label}</a>
            ))}
          </div>
        </div>
      </section>

      <section className="sect" id="window">
        <div className="sect-head">
          <p className="label">Your window</p>
          <h2>{label}</h2>
          <p>{s.since} to {s.until}, {example ? 'from the sample logs that ship with UsageLedger' : 'read from the ledger on this computer'}.</p>
        </div>
        <article className="card">
          {example ? <p className="example-tag">Example</p> : null}
          <Sentences s={s} />
          <Disclosure label="each day">
            <DaysTable s={s} />
          </Disclosure>
          {example ? (
            <p className="small">
              This is an example built from the sample logs that ship with UsageLedger. Your numbers appear here after the first sync.
            </p>
          ) : null}
        </article>
      </section>

      <section className="sect" id="where">
        <div className="sect-head">
          <p className="label">Where it went</p>
          <h2>Models and repos</h2>
          <p>A repo is the base name of the folder a session ran in. The full path is not stored unless you turn on <code>--raw-cwd</code>.</p>
        </div>
        <article className="card">
          {example ? <p className="example-tag">Example</p> : null}
          <WhereItWent s={s} />
        </article>
      </section>

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
