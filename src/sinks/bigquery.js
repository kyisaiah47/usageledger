// BigQuery sink, through the `bq` command-line tool from the Google Cloud SDK.
// Set the table with --bq-table project:dataset.table (or "bigquery": {"table": ...} in config.json).
//
// BigQuery loads are appends, so a response that grew between two syncs can land twice. Every
// read query therefore runs over a de-duplicated view of the table: one row per row_id, the one
// with the largest output count. sync --full replaces the table instead of appending.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { bigQuerySchema } from '../schema.js';
import { NUMERIC_KEYS, plainRow } from './rows.js';

const run = promisify(execFile);

export function parseTable(spec) {
  const m = /^([a-z0-9](?:[a-z0-9.\-:]*[a-z0-9])?)[:.]([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/.exec(spec || '');
  if (!m) throw new Error('usageledger: the bigquery sink needs --bq-table project:dataset.table');
  return { project: m[1], dataset: m[2], table: m[3] };
}

// Turns the shared query text into BigQuery SQL: `{T}` becomes the de-duplicated table and each
// `?` becomes a named parameter.
export function toBigQuery(q, t) {
  const ref = `\`${t.project}.${t.dataset}.${t.table}\``;
  const dedup = `(SELECT * EXCEPT(rn) FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY row_id ORDER BY output_tokens DESC, ts) AS rn FROM ${ref}) WHERE rn = 1)`;
  let i = 0;
  const sql = q.sql.replaceAll('{T}', dedup).replace(/\?/g, () => `@p${i++}`);
  const params = q.params.map((p, k) => `--parameter=p${k}:${p.t}:${p.v}`);
  return { sql, params };
}

const TIME_KEYS = ['started_at', 'ended_at', 'newest', 'ts'];

function isoTime(v) {
  if (typeof v !== 'string') return v;
  // bq prints TIMESTAMP values as "2026-09-01 12:00:00" or "2026-09-01 12:00:00.123 UTC".
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)/.exec(v);
  return m ? new Date(`${m[1]}T${m[2]}Z`).toISOString() : v;
}

export async function openBigQuery(cfg) {
  const t = parseTable(cfg.bigquery.table);
  const bin = cfg.bigquery.bin || 'bq';
  const base = [`--project_id=${t.project}`, '--quiet'];
  if (cfg.bigquery.location) base.push(`--location=${cfg.bigquery.location}`);
  const tableArg = `${t.project}:${t.dataset}.${t.table}`;
  // Global flags (project, location, format) go before the command; command flags after it.
  const bq = (args, globals = []) => run(bin, [...base, ...globals, ...args], { maxBuffer: 256 * 1024 * 1024 });
  let ensured = false;

  const withSchema = async (fn) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usageledger-bq-'));
    try {
      const schema = path.join(dir, 'schema.json');
      fs.writeFileSync(schema, JSON.stringify(bigQuerySchema()));
      return await fn(dir, schema);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  async function ensureTable() {
    if (ensured) return;
    try {
      await bq(['show', tableArg], ['--format=none']);
    } catch {
      await withSchema((_, schema) => bq(['mk', '--table', '--time_partitioning_field=day', '--time_partitioning_type=DAY', '--clustering_fields=tool', tableArg, schema]));
    }
    ensured = true;
  }

  return {
    name: 'bigquery',
    async write(rows) {
      await ensureTable();
      await withSchema(async (dir, schema) => {
        const file = path.join(dir, 'rows.ndjson');
        fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
        await bq(['load', '--source_format=NEWLINE_DELIMITED_JSON', '--noreplace', tableArg, file, schema]);
      });
    },
    async reset() {
      // Dropping and recreating the table needs no DML, so it also works in the BigQuery sandbox.
      await bq(['rm', '-f', '-t', tableArg]);
      ensured = false;
      await ensureTable();
    },
    async query(q) {
      const { sql, params } = toBigQuery(q, t);
      const { stdout } = await bq(['query', '--nouse_legacy_sql', '--max_rows=100000', ...params, sql], ['--format=json']);
      const text = stdout.trim();
      const rows = text ? JSON.parse(text) : [];
      return rows.map((r) => {
        const o = plainRow(r, NUMERIC_KEYS);
        for (const k of TIME_KEYS) if (k in o) o[k] = isoTime(o[k]);
        return o;
      });
    },
    async close() {},
  };
}
