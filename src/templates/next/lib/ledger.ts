// Server-side reads of the local ledger, through the usageledger package. Client components
// import from ./window and ./format only, so node built-ins never reach the browser bundle.
// The ledger home is ~/.usageledger unless USAGELEDGER_HOME says otherwise, and its config.json
// picks the sink, exactly as for the command-line tool.
import { exampleSummary, readSummary, resolveConfig, type Summary } from 'usageledger';

export type { Summary };
import type { Win } from '@/lib/window';

export { flatQuery, parseWindow, WINDOWS, type Query, type Win } from '@/lib/window';

export type Ledger = {
  win: Win;
  summary: Summary | null;
  error: string | null;
  /** The labeled example from the sample logs, shown while the ledger is empty. */
  example: Summary | null;
  /** The sink named in the ledger's config: sqlite, duckdb or bigquery. */
  sink: string;
};

export async function loadLedger(win: Win): Promise<Ledger> {
  let summary: Summary | null = null;
  let error: string | null = null;
  try {
    summary = await readSummary(win === 'all' ? { all: true } : { days: Number(win) });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const empty = !summary || summary.rowCount === 0;
  const example = empty ? await exampleSummary() : null;
  let sink = 'sqlite';
  try {
    sink = resolveConfig().sink;
  } catch {
    // an unreadable config.json already surfaced as `error`
  }
  return { win, summary, error, example, sink };
}

export { exampleSummary };

/** What the page shows: the ledger, or the labeled example while the ledger is empty. */
export function shown(l: Ledger): { summary: Summary; example: boolean } {
  if (l.summary && l.summary.rowCount > 0) return { summary: l.summary, example: false };
  return { summary: l.example as Summary, example: true };
}
