'use client';

/* VIEW SHELL. Two views of one ledger, a first-visit welcome that explains them, and a footer
 * switch that stays on every page.
 *
 * The view comes from ?view= first, then the saved choice, then Console. Choosing a view saves it
 * and rewrites ?view= in place, so the window and other parameters survive the switch. Only one
 * view is mounted at a time. The welcome opens on a first visit unless it was turned off, or the
 * URL carries ?welcome=0 for this visit. Start here reopens it either way. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Mark from '@/components/Mark';

type View = 'console' | 'simple';
const VIEW_KEY = 'usageledger:view';
const WELCOME_KEY = 'usageledger:welcome-off';

const read = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v == null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    // storage blocked; the choice lasts for this page only
  }
};

function Welcome({ open, onClose, onChoose, example }: { open: boolean; onClose: () => void; onChoose: (v: View) => void; example: string[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<'open' | 'closing' | 'closed'>('closed');
  const [off, setOff] = useState(false);

  useEffect(() => setOff(read(WELCOME_KEY) === '1'), [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setState('open');
    }
    if (!open && d.open) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setState('closing');
      const t = setTimeout(() => {
        d.close();
        setState('closed');
      }, reduce ? 0 : 220);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="welcome"
      data-state={state}
      aria-labelledby="welcome-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="welcome-body">
        <div className="welcome-top">
          <div className="brand"><Mark size={22} /><span>UsageLedger</span><span className="label">Start here</span></div>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
        </div>
        <h2 id="welcome-title">Where did your Claude Code and Codex tokens go?</h2>
        <p>
          Both tools write a log of every session on this computer. UsageLedger reads those logs and adds up the tokens per day,
          per model and per repo, without storing any file path.
        </p>
        <figure className="welcome-figure">
          <figcaption>Example</figcaption>
          {example.map((line) => <p key={line}>{line}</p>)}
        </figure>
        <div className="welcome-choices">
          <button type="button" onClick={() => onChoose('console')}>
            <b>Console</b>
            <span>See more at once.</span>
            <small>Charts, tables and every session on one screen.</small>
          </button>
          <button type="button" onClick={() => onChoose('simple')}>
            <b>Simple</b>
            <span>Start with the essentials.</span>
            <small>A few sentences, with details when you open them.</small>
          </button>
        </div>
        <p className="small">You can switch anytime.</p>
        <label className="check">
          <input
            type="checkbox"
            checked={off}
            onChange={(e) => {
              setOff(e.target.checked);
              write(WELCOME_KEY, e.target.checked ? '1' : null);
            }}
          />
          <span>Don&apos;t open this when I come back</span>
        </label>
      </div>
    </dialog>
  );
}

export default function ViewShell({ initial, fromUrl, console: consoleView, simple, example }: { initial: View; fromUrl: boolean; console: ReactNode; simple: ReactNode; example: string[] }) {
  const [view, setView] = useState<View>(initial);
  const [welcome, setWelcome] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (fromUrl) write(VIEW_KEY, initial);
    else {
      const saved = read(VIEW_KEY);
      if (saved === 'simple' || saved === 'console') setView(saved);
    }
    const params = new URLSearchParams(window.location.search);
    if (read(WELCOME_KEY) !== '1' && params.get('welcome') !== '0') setWelcome(true);
  }, [fromUrl, initial]);

  const choose = useCallback((v: View) => {
    setView(v);
    write(VIEW_KEY, v);
    const url = new URL(window.location.href);
    url.searchParams.set('view', v);
    window.history.replaceState(null, '', url);
  }, []);

  const close = useCallback(() => {
    setWelcome(false);
    opener.current?.focus();
  }, []);

  return (
    <div data-view={view}>
      {view === 'simple' ? simple : consoleView}
      <footer className="site-foot">
        <div className="brand"><Mark size={18} /><span>UsageLedger</span></div>
        <div className="foot-controls" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'console'} onClick={() => choose('console')}>Console</button>
          <button type="button" aria-pressed={view === 'simple'} onClick={() => choose('simple')}>Simple</button>
          <button
            type="button"
            className="start"
            onClick={(e) => {
              opener.current = e.currentTarget;
              setWelcome(true);
            }}
          >
            Start here
          </button>
        </div>
      </footer>
      <Welcome
        example={example}
        open={welcome}
        onClose={close}
        onChoose={(v) => {
          choose(v);
          close();
        }}
      />
    </div>
  );
}
