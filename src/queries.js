// The read queries, written once. `{T}` is the table, and `?` marks a parameter.
// SQLite and DuckDB run them as written. The BigQuery sink swaps `{T}` for a de-duplicating
// subquery and `?` for named parameters, because BigQuery tables are append-only.
//
// Each parameter is { v, t }: the value and its BigQuery type.

const SUMS = `SUM(input_tokens) AS input_tokens, SUM(cache_read_input_tokens) AS cache_read_tokens,
  SUM(cache_creation_input_tokens) AS cache_write_tokens, SUM(output_tokens) AS output_tokens,
  SUM(total_tokens) AS total_tokens`;

export const DIMS = ['model', 'repo', 'origin'];

export function whereClause({ since, until, tool } = {}) {
  const parts = [];
  const params = [];
  if (since) {
    parts.push('day >= ?');
    params.push({ v: since, t: 'DATE' });
  }
  if (until) {
    parts.push('day <= ?');
    params.push({ v: until, t: 'DATE' });
  }
  if (tool) {
    parts.push('tool = ?');
    params.push({ v: tool, t: 'STRING' });
  }
  return { sql: parts.length ? 'WHERE ' + parts.join(' AND ') : '', params };
}

export function dailyQuery(w) {
  return {
    sql: `SELECT day, tool, COUNT(DISTINCT session_id) AS sessions, COUNT(*) AS turns, ${SUMS}
FROM {T} ${w.sql} GROUP BY day, tool ORDER BY day, tool`,
    params: w.params,
  };
}

export function toolQuery(w) {
  return {
    sql: `SELECT tool, COUNT(DISTINCT session_id) AS sessions, COUNT(*) AS turns, ${SUMS}
FROM {T} ${w.sql} GROUP BY tool ORDER BY tool`,
    params: w.params,
  };
}

export function groupQuery(dim, w) {
  if (!DIMS.includes(dim)) throw new Error(`usageledger: unknown dimension ${dim}`);
  return {
    sql: `SELECT COALESCE(${dim}, 'unrecorded') AS key, tool, COUNT(DISTINCT session_id) AS sessions, COUNT(*) AS turns, ${SUMS}
FROM {T} ${w.sql} GROUP BY 1, tool ORDER BY total_tokens DESC, key`,
    params: w.params,
  };
}

export function sessionsQuery(w, limit = 300) {
  const n = Math.max(1, Math.min(100000, Math.trunc(Number(limit) || 300)));
  return {
    sql: `WITH s AS (
  SELECT COALESCE(session_id, '') AS sid, tool, MIN(ts) AS started_at, MAX(ts) AS ended_at, COUNT(*) AS turns, ${SUMS}
  FROM {T} ${w.sql} GROUP BY 1, tool
), l AS (
  SELECT COALESCE(session_id, '') AS sid, tool, model, repo, origin, cwd_hash,
    ROW_NUMBER() OVER (PARTITION BY COALESCE(session_id, ''), tool ORDER BY ts DESC) AS rn
  FROM {T} ${w.sql}
)
SELECT s.sid AS session_id, s.tool, l.model, l.repo, l.origin, l.cwd_hash, s.started_at, s.ended_at, s.turns,
  s.input_tokens, s.cache_read_tokens, s.cache_write_tokens, s.output_tokens, s.total_tokens
FROM s JOIN l ON l.sid = s.sid AND l.tool = s.tool AND l.rn = 1
ORDER BY s.total_tokens DESC, s.sid LIMIT ${n}`,
    params: [...w.params, ...w.params],
  };
}

export function boundsQuery() {
  return { sql: 'SELECT MIN(day) AS first_day, MAX(day) AS last_day, MAX(ts) AS newest, COUNT(*) AS row_count FROM {T}', params: [] };
}
