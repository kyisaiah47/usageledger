// DuckDB sink. It needs the optional package @duckdb/node-api, installed next to usageledger:
//   npm install -g usageledger @duckdb/node-api
// Rows are written to a temporary newline-delimited JSON file and inserted in one statement.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { COLUMNS, COLUMN_NAMES } from '../schema.js';
import { bindTable, createTableSql, upsertSql, TABLE } from './sql.js';
import { NUMERIC_KEYS, plainRow } from './rows.js';

async function loadDuckdb() {
  try {
    return await import('@duckdb/node-api');
  } catch {
    throw new Error('usageledger: the duckdb sink needs @duckdb/node-api. Install it next to usageledger: npm install -g usageledger @duckdb/node-api');
  }
}

const DUCK_TYPE = { STRING: 'VARCHAR', TIMESTAMP: 'VARCHAR', DATE: 'VARCHAR', INTEGER: 'BIGINT' };

export async function openDuckdb(cfg) {
  const { DuckDBInstance } = await loadDuckdb();
  fs.mkdirSync(path.dirname(cfg.db), { recursive: true });
  const instance = await DuckDBInstance.create(cfg.db);
  const conn = await instance.connect();
  for (const stmt of createTableSql().split(';').map((s) => s.trim()).filter(Boolean)) await conn.run(stmt);

  const columns = '{' + COLUMNS.map((c) => `${c.name}: '${DUCK_TYPE[c.type]}'`).join(', ') + '}';

  return {
    name: 'duckdb',
    async write(rows) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usageledger-'));
      const file = path.join(dir, 'rows.ndjson');
      try {
        fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
        const source = `SELECT ${COLUMN_NAMES.join(', ')} FROM read_json('${file.replaceAll("'", "''")}', format = 'newline_delimited', columns = ${columns})`;
        await conn.run(upsertSql('greatest', source));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
    async reset() {
      await conn.run(`DELETE FROM ${TABLE}`);
    },
    async query(q) {
      const reader = await conn.runAndReadAll(bindTable(q), q.params.map((p) => p.v));
      return reader.getRowObjectsJS().map((r) => plainRow(r, NUMERIC_KEYS));
    },
    async close() {
      conn.closeSync();
      instance.closeSync();
    },
  };
}
