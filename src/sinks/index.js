// A sink stores rows and answers the read queries. Every sink has the same five methods:
//   write(rows)        insert rows; a row_id seen before keeps the larger token counts
//   reset()            drop every row (used by sync --full)
//   query({sql, params}) run one of the queries in ../queries.js and return plain objects
//   close()
//   name
// To add a sink, export an async open(cfg) that returns that object and list it below.
import { openSqlite } from './sqlite.js';
import { openDuckdb } from './duckdb.js';
import { openBigQuery } from './bigquery.js';

const SINKS = {
  sqlite: openSqlite,
  duckdb: openDuckdb,
  bigquery: openBigQuery,
};

export const SINK_NAMES = Object.keys(SINKS);

export async function openSink(cfg) {
  const open = SINKS[cfg.sink];
  if (!open) throw new Error(`usageledger: unknown sink "${cfg.sink}". Use one of: ${SINK_NAMES.join(', ')}`);
  return open(cfg);
}
