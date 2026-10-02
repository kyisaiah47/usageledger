// Reads the ledger back: per day, per model, per repo, per origin and per session.
// summary() returns the shape the web view and the Next.js app draw from.
import { boundsQuery, dailyQuery, groupQuery, sessionsQuery, toolQuery, whereClause, DIMS } from './queries.js';
import { dayFormatter } from './schema.js';

const DAY_MS = 86400_000;

function addDays(day, n) {
  const d = new Date(day + 'T12:00:00Z');
  return new Date(d.getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

export function listDays(since, until) {
  const out = [];
  if (!since || !until || since > until) return out;
  for (let d = since; d <= until; d = addDays(d, 1)) out.push(d);
  return out;
}

// Resolves the reporting window. `days` counts back from today in the ledger's time zone.
export async function resolveWindow(sink, { days = 30, since, until, all = false, tz = 'UTC' } = {}) {
  const today = dayFormatter(tz)(Date.now());
  if (all) {
    const [b] = await sink.query(boundsQuery());
    return { since: b?.first_day || today, until: b?.last_day && b.last_day > today ? b.last_day : today };
  }
  const end = until || today;
  const start = since || addDays(end, -(Math.max(1, Math.trunc(Number(days) || 30)) - 1));
  return { since: start, until: end };
}

const blankTotals = () => ({ sessions: 0, turns: 0, input_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, output_tokens: 0, total_tokens: 0 });

// Per tool, plus `all`. A session id belongs to one tool, so the session counts add up.
export function totalsByTool(perTool) {
  const out = { claude_code: blankTotals(), codex: blankTotals(), all: blankTotals() };
  for (const r of perTool) {
    const t = (out[r.tool] ||= blankTotals());
    for (const k of Object.keys(t)) {
      t[k] += r[k] || 0;
      out.all[k] += r[k] || 0;
    }
  }
  return out;
}

export async function summary(sink, opts = {}) {
  const { since, until } = await resolveWindow(sink, opts);
  const w = whereClause({ since, until, tool: opts.tool });
  const [perTool, daily, model, repo, origin, sessions, bounds] = await Promise.all([
    sink.query(toolQuery(w)),
    sink.query(dailyQuery(w)),
    sink.query(groupQuery('model', w)),
    sink.query(groupQuery('repo', w)),
    sink.query(groupQuery('origin', w)),
    sink.query(sessionsQuery(w, opts.limit ?? 300)),
    sink.query(boundsQuery()),
  ]);
  const groups = { model, repo, origin };
  const ranks = DIMS.flatMap((dim) => groups[dim].map((r) => ({ dim, tool: r.tool, key: r.key, sessions: r.sessions, turns: r.turns, total_tokens: r.total_tokens, output_tokens: r.output_tokens })));
  const totals = totalsByTool(perTool);
  const days = listDays(since, until);
  return {
    since,
    until,
    windowDays: days.length,
    days,
    daily,
    groups,
    ranks,
    sessions,
    totals,
    newest: bounds[0]?.newest ?? null,
    rowCount: bounds[0]?.row_count ?? 0,
  };
}

// ── text output ────────────────────────────────────────────────────────────────────────────────

const LABEL = { claude_code: 'Claude Code', codex: 'Codex' };
const int = (v) => Math.round(v || 0).toLocaleString('en-US');

export function compact(t) {
  const v = t || 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e4) return `${Math.round(v / 1e3)}k`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return String(v);
}

function table(headers, rows, right) {
  const cells = [headers, ...rows.map((r) => r.map((c) => (c == null ? '' : String(c))))];
  const widths = headers.map((_, i) => Math.max(...cells.map((r) => r[i].length)));
  return cells
    .map((r, ri) => {
      const line = r.map((c, i) => (right.has(i) ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  ').trimEnd();
      return ri === 0 ? line + '\n' + widths.map((w) => '-'.repeat(w)).join('  ') : line;
    })
    .join('\n');
}

export function headline(s) {
  const lines = [];
  for (const tool of ['claude_code', 'codex']) {
    const t = s.totals[tool];
    if (!t || !t.turns) continue;
    lines.push(`${LABEL[tool]} used ${int(t.total_tokens)} tokens in ${int(t.sessions)} sessions and wrote ${int(t.output_tokens)} of them.`);
  }
  if (!lines.length) lines.push(`The ledger has no usage between ${s.since} and ${s.until}.`);
  else {
    const a = s.totals.all;
    const share = a.total_tokens ? Math.round((a.cache_read_tokens / a.total_tokens) * 100) : 0;
    lines.push(`Cache reads were ${share}% of all tokens between ${s.since} and ${s.until}.`);
  }
  return lines.join('\n');
}

export function formatDaily(s) {
  const right = new Set([2, 3, 4, 5, 6, 7, 8]);
  return table(
    ['DAY', 'TOOL', 'SESSIONS', 'TURNS', 'INPUT', 'CACHE READ', 'CACHE WRITE', 'OUTPUT', 'TOTAL'],
    s.daily.map((r) => [r.day, LABEL[r.tool] || r.tool, int(r.sessions), int(r.turns), int(r.input_tokens), int(r.cache_read_tokens), int(r.cache_write_tokens), int(r.output_tokens), int(r.total_tokens)]),
    right,
  );
}

export function formatGroup(s, dim, limit = 20) {
  const rows = s.groups[dim].slice(0, limit);
  return table(
    [dim.toUpperCase(), 'TOOL', 'SESSIONS', 'TURNS', 'INPUT', 'CACHE READ', 'OUTPUT', 'TOTAL'],
    rows.map((r) => [r.key, LABEL[r.tool] || r.tool, int(r.sessions), int(r.turns), int(r.input_tokens), int(r.cache_read_tokens), int(r.output_tokens), int(r.total_tokens)]),
    new Set([2, 3, 4, 5, 6, 7]),
  );
}

export function formatSessions(s, limit = 20) {
  return table(
    ['SESSION', 'TOOL', 'MODEL', 'REPO', 'STARTED', 'TURNS', 'OUTPUT', 'TOTAL'],
    s.sessions.slice(0, limit).map((r) => [
      String(r.session_id).slice(0, 8),
      LABEL[r.tool] || r.tool,
      r.model || 'unrecorded',
      r.repo || 'unrecorded',
      String(r.started_at || '').slice(0, 16).replace('T', ' '),
      int(r.turns),
      int(r.output_tokens),
      int(r.total_tokens),
    ]),
    new Set([5, 6, 7]),
  );
}

export function formatReport(s, { by, limit = 20 } = {}) {
  const parts = [headline(s)];
  const want = by ? [by] : ['day', 'model', 'repo', 'session'];
  for (const b of want) {
    if (b === 'day') parts.push('Per day\n' + formatDaily(s));
    else if (b === 'session') parts.push(`Per session, top ${Math.min(limit, s.sessions.length)} by total tokens\n` + formatSessions(s, limit));
    else if (DIMS.includes(b)) parts.push(`Per ${b}\n` + formatGroup(s, b, limit));
    else throw new Error(`usageledger: --by takes day, model, repo, origin or session, not "${b}"`);
  }
  return parts.join('\n\n') + '\n';
}
