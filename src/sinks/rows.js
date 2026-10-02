// Read results as plain objects. Numbers come back as bigint from DuckDB and as strings from
// BigQuery; both become JavaScript numbers here.
export const NUMERIC_KEYS = new Set([
  'sessions',
  'turns',
  'input_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
  'output_tokens',
  'total_tokens',
  'row_count',
]);

export function plainRow(row, numeric = NUMERIC_KEYS) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'bigint') out[k] = Number(v);
    else if (numeric.has(k) && typeof v === 'string' && v !== '') out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}
