#!/usr/bin/env node
// usageledger: token ledger for Claude Code and Codex.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from './config.js';
import { sync } from './sync.js';
import { openSink, SINK_NAMES } from './sinks/index.js';
import { summary, formatReport } from './report.js';
import { startServer } from './serve.js';
import { scaffold, APP_MODES } from './scaffold.js';
import { bigQuerySchema } from './schema.js';
import { createTableSql } from './sinks/sql.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8')).version;

const HELP = `usageledger ${VERSION}
Counts the tokens Claude Code and Codex used on this computer, from their local session logs.

Usage
  usageledger sync                 read new log lines into the ledger
  usageledger report               print totals per day, model, repo and session
  usageledger serve                open a local web view at http://127.0.0.1:4477
  usageledger init --app <mode>    write a Next.js app that reads the ledger (console, simple or both)
  usageledger schema               print the table schema as BigQuery JSON (--sql for the SQLite table)

Sync options
  --claude <glob>      Claude Code logs (repeatable). Default: ~/.claude*/projects/**/*.jsonl
  --codex <glob>       Codex logs (repeatable). Default: ~/.codex/sessions/**/*.jsonl
  --exclude <text>     skip files whose path contains this text (repeatable, case-insensitive)
  --full               forget the byte offsets, re-read every file and rebuild the ledger
  --dry-run            read and count, but write nothing
  --raw-cwd            also store full working-directory paths (off by default)

Report options
  --by <axis>          day, model, repo, origin or session (default: all four of day, model, repo, session)
  --days <n>           window ending today (default 30)
  --since <date>       window start, YYYY-MM-DD
  --until <date>       window end, YYYY-MM-DD
  --all                every day in the ledger
  --tool <tool>        claude_code or codex
  --limit <n>          rows per table (default 20)
  --json               print the summary as JSON

Serve options
  --port <n>           default 4477
  --host <addr>        default 127.0.0.1

Init options
  --app <mode>         console, simple or both
  --out <dir>          where to write the app (default ./usageledger-app)
  --force              write into a directory that is not empty

Storage options (all commands)
  --home <dir>         ledger home for state, salt and the default database (default ~/.usageledger)
  --sink <name>        ${SINK_NAMES.join(', ')} (default sqlite)
  --db <file>          database file for sqlite or duckdb
  --bq-table <ref>     BigQuery table as project:dataset.table
  --bq-bin <path>      bq command (default bq)
  --bq-location <loc>  BigQuery location, for example US
  --tz <zone>          time zone for calendar days (default: this computer's)
`;

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  home: { type: 'string' },
  sink: { type: 'string' },
  db: { type: 'string' },
  'bq-table': { type: 'string' },
  'bq-bin': { type: 'string' },
  'bq-location': { type: 'string' },
  tz: { type: 'string' },
  claude: { type: 'string', multiple: true },
  codex: { type: 'string', multiple: true },
  exclude: { type: 'string', multiple: true },
  full: { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  'raw-cwd': { type: 'boolean' },
  by: { type: 'string' },
  days: { type: 'string' },
  since: { type: 'string' },
  until: { type: 'string' },
  all: { type: 'boolean' },
  tool: { type: 'string' },
  limit: { type: 'string' },
  json: { type: 'boolean' },
  sql: { type: 'boolean' },
  port: { type: 'string' },
  host: { type: 'string' },
  app: { type: 'string' },
  out: { type: 'string' },
  force: { type: 'boolean' },
};

function flagsToConfig(v) {
  const flags = {};
  if (v.home) flags.home = v.home;
  if (v.sink) flags.sink = v.sink;
  if (v.db) flags.db = v.db;
  if (v.tz) flags.tz = v.tz;
  if (v.claude) flags.claude = v.claude;
  if (v.codex) flags.codex = v.codex;
  if (v.exclude) flags.exclude = v.exclude;
  if (v['raw-cwd']) flags.rawCwd = true;
  const bq = {};
  if (v['bq-table']) bq.table = v['bq-table'];
  if (v['bq-bin']) bq.bin = v['bq-bin'];
  if (v['bq-location']) bq.location = v['bq-location'];
  if (Object.keys(bq).length) flags.bigquery = bq;
  return resolveConfig(flags);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function main(argv = process.argv.slice(2), out = process.stdout) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  let cmd = positionals[0];
  if (!cmd && v.app) cmd = 'init';
  if (v.version) {
    out.write(VERSION + '\n');
    return 0;
  }
  if (v.help || !cmd || cmd === 'help') {
    out.write(HELP);
    return 0;
  }

  if (cmd === 'init') {
    const app = v.app || positionals[1];
    if (!APP_MODES.includes(app)) throw new Error('usageledger: init needs --app console, --app simple or --app both');
    const res = scaffold({ app, out: v.out || positionals[2] || 'usageledger-app', force: v.force });
    const rel = path.relative(process.cwd(), res.out);
    const where = !rel ? '.' : rel.startsWith('..') ? res.out : rel;
    out.write(`Wrote a Next.js app with the ${app === 'both' ? 'Console and Simple views' : `${app[0].toUpperCase()}${app.slice(1)} view`} to ${res.out} (${res.files.length} files).\n`);
    out.write(`Next: cd ${where} && npm install && npm run dev\n`);
    return 0;
  }

  if (cmd === 'schema') {
    out.write(v.sql ? createTableSql() + '\n' : JSON.stringify(bigQuerySchema(), null, 2) + '\n');
    return 0;
  }

  const cfg = flagsToConfig(v);

  if (cmd === 'sync') {
    const res = await sync(cfg, { full: v.full, dryRun: v['dry-run'] });
    const s = res.stats;
    const verb = v['dry-run'] ? 'found' : 'wrote';
    out.write(`usageledger: ${verb} ${res.rows.length} responses from ${s.filesRead} of ${s.claudeFiles + s.codexFiles} log files into ${cfg.sink === 'bigquery' ? cfg.bigquery.table : cfg.db}.\n`);
    if (s.linesMerged || s.repeatedEvents) out.write(`usageledger: merged ${s.linesMerged} repeated Claude Code lines and skipped ${s.repeatedEvents} repeated Codex events.\n`);
    return 0;
  }

  if (cmd === 'report') {
    for (const k of ['since', 'until']) if (v[k] && !DATE.test(v[k])) throw new Error(`usageledger: --${k} takes YYYY-MM-DD`);
    if (v.tool && v.tool !== 'claude_code' && v.tool !== 'codex') throw new Error('usageledger: --tool takes claude_code or codex');
    const sink = await openSink(cfg);
    try {
      const limit = Number(v.limit) || 20;
      const s = await summary(sink, { days: Number(v.days) || 30, since: v.since, until: v.until, all: v.all, tool: v.tool, tz: cfg.tz, limit: Math.max(limit, 300) });
      out.write(v.json ? JSON.stringify(s, null, 2) + '\n' : formatReport(s, { by: v.by, limit }));
    } finally {
      await sink.close();
    }
    return 0;
  }

  if (cmd === 'serve') {
    const { url } = await startServer(cfg, { port: v.port ? Number(v.port) : 4477, host: v.host || '127.0.0.1' });
    out.write(`usageledger: serving ${url}\n`);
    return null; // keep running
  }

  throw new Error(`usageledger: unknown command "${cmd}". Run usageledger --help.`);
}

const invokedDirectly = (() => {
  try {
    return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().then(
    (code) => {
      if (code != null) process.exitCode = code;
    },
    (e) => {
      process.stderr.write((e && e.message ? e.message : String(e)) + '\n');
      process.exitCode = 1;
    },
  );
}
