// The reporting window, shared by the server page and the client views.
export type Win = '7' | '30' | '90' | 'all';
export const WINDOWS: { id: Win; label: string }[] = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: 'all', label: 'All' },
];

export type Query = Record<string, string>;

export function flatQuery(sp: Record<string, string | string[] | undefined>): Query {
  const out: Query = {};
  for (const [k, v] of Object.entries(sp)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s != null) out[k] = s;
  }
  return out;
}

export function parseWindow(q: Query): Win {
  const v = q.days;
  return v === '7' || v === '30' || v === '90' || v === 'all' ? v : '30';
}
