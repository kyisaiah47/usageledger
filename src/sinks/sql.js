// SQL shared by the SQLite and DuckDB sinks.
import { COLUMNS, COLUMN_NAMES, TOKEN_COLUMNS } from '../schema.js';

export const TABLE = 'usage';

export function createTableSql() {
  const cols = COLUMNS.map((c) => `  ${c.name} ${c.sql}`).join(',\n');
  return `CREATE TABLE IF NOT EXISTS ${TABLE} (\n${cols}\n);
CREATE INDEX IF NOT EXISTS usage_day ON ${TABLE} (day);
CREATE INDEX IF NOT EXISTS usage_session ON ${TABLE} (session_id);`;
}

// On a repeated row_id each token count keeps its larger value and the total is recomputed from
// them. `max2` is the two-argument maximum: max() in SQLite, greatest() in DuckDB.
export function upsertSql(max2, source) {
  const pick = (c) => `CASE WHEN ${TABLE}.${c} IS NULL THEN excluded.${c} WHEN excluded.${c} IS NULL THEN ${TABLE}.${c} ELSE ${max2}(${TABLE}.${c}, excluded.${c}) END`;
  const sets = TOKEN_COLUMNS.map((c) => `${c} = ${pick(c)}`);
  const total = ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens'].map(pick).join(' + ');
  sets.push(`total_tokens = ${total}`);
  return `INSERT INTO ${TABLE} (${COLUMN_NAMES.join(', ')}) ${source}
ON CONFLICT (row_id) DO UPDATE SET ${sets.join(', ')}`;
}

export function bindTable(q) {
  return q.sql.replaceAll('{T}', TABLE);
}
