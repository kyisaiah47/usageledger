import type { Summary } from 'usageledger';

export type Tool = 'claude_code' | 'codex';
export const TOOLS: Tool[] = ['claude_code', 'codex'];
export const TOOL: Record<Tool, { label: string; color: string }> = {
  claude_code: { label: 'Claude Code', color: 'var(--claude)' },
  codex: { label: 'Codex', color: 'var(--codex)' },
};

export const M = (t: number) =>
  t >= 1e9
    ? `${(t / 1e9).toFixed(1)}B`
    : t >= 1e6
      ? `${(t / 1e6).toFixed(1)}M`
      : t >= 1e4
        ? `${Math.round(t / 1e3)}k`
        : t >= 1e3
          ? `${(t / 1e3).toFixed(1).replace(/\.0$/, '')}k`
          : String(t || 0);
export const n = (v: number) => Math.round(v || 0).toLocaleString('en-US');
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Hours since an ISO time, or null. */
export const hoursAgo = (iso: string | null) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 36e5) : null);

export function href(q: Record<string, string>, patch: Record<string, string>) {
  const p = new URLSearchParams({ ...q, ...patch });
  return `?${p.toString()}`;
}

/** The key with the most tokens on one axis, both tools together. */
export function top(s: Summary, dim: 'model' | 'repo' | 'origin') {
  const by = new Map<string, number>();
  for (const r of s.groups[dim]) by.set(r.key, (by.get(r.key) ?? 0) + r.total_tokens);
  const sorted = [...by.entries()].sort((a, b) => b[1] - a[1]);
  return { first: sorted[0] ?? null, all: sorted };
}

