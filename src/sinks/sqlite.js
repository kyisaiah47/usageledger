// The default sink: one SQLite file, through Node's built-in node:sqlite. No dependency.
import fs from 'node:fs';
import path from 'node:path';
import { COLUMN_NAMES } from '../schema.js';
import { bindTable, createTableSql, upsertSql, TABLE } from './sql.js';
import { NUMERIC_KEYS, plainRow } from './rows.js';

// node:sqlite prints an ExperimentalWarning on some Node versions. The warning is about the
// module's API status, not about this data, so it is not shown to UsageLedger users.
function quietSqliteWarning() {
  if (process.__usageledgerQuiet) return;
  process.__usageledgerQuiet = true;
  const emit = process.emitWarning;
  process.emitWarning = function (warning, ...rest) {
    const text = typeof warning === 'string' ? warning : warning?.message;
    if (text && /SQLite is an experimental feature/i.test(text)) return;
    return emit.call(this, warning, ...rest);
  };
}

export async function openSqlite(cfg, { readOnly = false } = {}) {
  quietSqliteWarning();
  const { DatabaseSync } = await import('node:sqlite');
  if (!readOnly) fs.mkdirSync(path.dirname(cfg.db), { recursive: true });
  if (readOnly && !fs.existsSync(cfg.db)) throw new Error(`usageledger: no ledger at ${cfg.db}. Run \`usageledger sync\` first.`);
  const db = new DatabaseSync(cfg.db, readOnly ? { readOnly: true } : {});
  if (!readOnly) {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(createTableSql());
  }
  const placeholders = COLUMN_NAMES.map(() => '?').join(', ');
  let insert = null;

  return {
    name: 'sqlite',
    async write(rows) {
      insert ||= db.prepare(upsertSql('max', `VALUES (${placeholders})`));
      db.exec('BEGIN');
      try {
        for (const r of rows) insert.run(...COLUMN_NAMES.map((c) => r[c] ?? null));
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async reset() {
      db.exec(`DELETE FROM ${TABLE}`);
    },
    async query(q) {
      const stmt = db.prepare(bindTable(q));
      return stmt.all(...q.params.map((p) => p.v)).map((r) => plainRow(r, NUMERIC_KEYS));
    },
    async close() {
      db.close();
    },
  };
}
