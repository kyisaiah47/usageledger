'use client';

/* VIEW SHELL. Two views of one ledger and a Console / Simple toggle that each view draws by its
 * name or in its rail.
 *
 * The view comes from ?view= first, then the saved choice, then Console. Choosing a view saves it
 * and rewrites ?view= in place, so the window and other parameters survive the switch. Only one
 * view is mounted at a time. */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type View = 'console' | 'simple';
const VIEW_KEY = 'usageledger:view';

const read = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    // storage blocked; the choice lasts for this page only
  }
};

const ViewContext = createContext<{ view: View; choose: (v: View) => void } | null>(null);

export function ViewToggle() {
  const ctx = useContext(ViewContext);
  if (!ctx) return null;
  return (
    <div className="view-toggle" role="group" aria-label="Page view">
      <button type="button" aria-pressed={ctx.view === 'console'} onClick={() => ctx.choose('console')} title="Console view">
        <svg viewBox="0 0 256 256" aria-hidden="true"><path d="M128,128a8,8,0,0,1-3,6.25l-40,32a8,8,0,1,1-10-12.5L107.19,128,75,102.25a8,8,0,1,1,10-12.5l40,32A8,8,0,0,1,128,128Zm48,24H136a8,8,0,0,0,0,16h40a8,8,0,0,0,0-16Zm56-96V200a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V56A16,16,0,0,1,40,40H216A16,16,0,0,1,232,56ZM216,200V56H40V200H216Z" /></svg>
        Console
      </button>
      <button type="button" aria-pressed={ctx.view === 'simple'} onClick={() => ctx.choose('simple')} title="Simple view">
        <svg viewBox="0 0 256 256" aria-hidden="true"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM184,96a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,96Zm0,32a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,128Zm0,32a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,160Z" /></svg>
        Simple
      </button>
    </div>
  );
}

export default function ViewShell({ initial, fromUrl, console: consoleView, simple }: { initial: View; fromUrl: boolean; console: ReactNode; simple: ReactNode }) {
  const [view, setView] = useState<View>(initial);

  useEffect(() => {
    if (fromUrl) write(VIEW_KEY, initial);
    else {
      const saved = read(VIEW_KEY);
      if (saved === 'simple' || saved === 'console') setView(saved);
    }
  }, [fromUrl, initial]);

  const choose = useCallback((v: View) => {
    setView(v);
    write(VIEW_KEY, v);
    /* Switching views always starts the reader at the top of the page. */
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    const url = new URL(window.location.href);
    url.searchParams.set('view', v);
    window.history.replaceState(null, '', url);
  }, []);

  return (
    <ViewContext.Provider value={{ view, choose }}>
      <div className="site-surface" data-view={view}>{view === 'simple' ? simple : consoleView}</div>
    </ViewContext.Provider>
  );
}
