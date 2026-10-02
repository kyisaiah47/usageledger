// One row is one model response: a Claude Code assistant message, or a Codex token_count event.
//
// Token columns mean the same thing for both tools:
//   input_tokens                 input that was neither read from nor written to the prompt cache
//   cache_read_input_tokens      input served from the prompt cache
//   cache_creation_input_tokens  input written to the prompt cache
//   output_tokens                tokens the model wrote, reasoning included
//   reasoning_output_tokens      the reasoning part of output_tokens, when the log records it
//   total_tokens                 input + cache read + cache write + output
// Codex counts cached tokens inside input_tokens, so UsageLedger subtracts them to match Claude.
export const COLUMNS = [
  { name: 'row_id', type: 'STRING', sql: 'TEXT PRIMARY KEY' },
  { name: 'ts', type: 'TIMESTAMP', sql: 'TEXT NOT NULL' },
  { name: 'day', type: 'DATE', sql: 'TEXT NOT NULL' },
  { name: 'tool', type: 'STRING', sql: 'TEXT NOT NULL' },
  { name: 'session_id', type: 'STRING', sql: 'TEXT' },
  { name: 'model', type: 'STRING', sql: 'TEXT' },
  { name: 'origin', type: 'STRING', sql: 'TEXT' },
  { name: 'repo', type: 'STRING', sql: 'TEXT' },
  { name: 'cwd_hash', type: 'STRING', sql: 'TEXT' },
  { name: 'cwd', type: 'STRING', sql: 'TEXT' },
  { name: 'input_tokens', type: 'INTEGER', sql: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'cache_read_input_tokens', type: 'INTEGER', sql: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'cache_creation_input_tokens', type: 'INTEGER', sql: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'output_tokens', type: 'INTEGER', sql: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'reasoning_output_tokens', type: 'INTEGER', sql: 'INTEGER' },
  { name: 'total_tokens', type: 'INTEGER', sql: 'INTEGER NOT NULL DEFAULT 0' },
];

export const COLUMN_NAMES = COLUMNS.map((c) => c.name);

export const TOKEN_COLUMNS = [
  'input_tokens',
  'cache_read_input_tokens',
  'cache_creation_input_tokens',
  'output_tokens',
  'reasoning_output_tokens',
];

// BigQuery load schema, the same shape `bq load` takes as a JSON file.
export function bigQuerySchema() {
  return COLUMNS.map((c) => ({ name: c.name, type: c.type, mode: c.name === 'row_id' || c.name === 'ts' || c.name === 'tool' ? 'REQUIRED' : 'NULLABLE' }));
}

const n = (v) => (Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0);

export function makeRow(fields) {
  const input = n(fields.input_tokens);
  const cacheRead = n(fields.cache_read_input_tokens);
  const cacheWrite = n(fields.cache_creation_input_tokens);
  const output = n(fields.output_tokens);
  const reasoning = fields.reasoning_output_tokens == null ? null : n(fields.reasoning_output_tokens);
  return {
    row_id: fields.row_id,
    ts: fields.ts,
    day: fields.day,
    tool: fields.tool,
    session_id: fields.session_id ?? null,
    model: fields.model ?? null,
    origin: fields.origin ?? null,
    repo: fields.repo ?? null,
    cwd_hash: fields.cwd_hash ?? null,
    cwd: fields.cwd ?? null,
    input_tokens: input,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheWrite,
    output_tokens: output,
    reasoning_output_tokens: reasoning,
    total_tokens: input + cacheRead + cacheWrite + output,
  };
}

// Two rows with one row_id are the same model response seen twice. Claude Code writes one line
// per content block and the early lines carry a partial output count, so each count keeps its
// largest value. The first row's timestamp and identity fields are kept, which is also what the
// SQL sinks do on conflict, so one sync and many small syncs give the same ledger.
export function mergeRows(a, b) {
  const out = { ...a };
  for (const k of TOKEN_COLUMNS) {
    if (a[k] == null && b[k] == null) continue;
    out[k] = Math.max(a[k] ?? 0, b[k] ?? 0);
  }
  out.total_tokens = out.input_tokens + out.cache_read_input_tokens + out.cache_creation_input_tokens + out.output_tokens;
  return out;
}

// Local calendar day of a timestamp, in the configured time zone.
export function dayFormatter(tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (ts) => {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return f.format(d);
  };
}
