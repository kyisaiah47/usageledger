import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sync } from '../src/sync.js';
import { openSink } from '../src/sinks/index.js';
import { summary } from '../src/report.js';
import { parseTable, toBigQuery } from '../src/sinks/bigquery.js';
import { dailyQuery, whereClause } from '../src/queries.js';
import { makeRow } from '../src/schema.js';
import { config, tmpDir, EXPECTED } from './helpers.js';

let duckdbAvailable = true;
try {
  await import('@duckdb/node-api');
} catch {
  duckdbAvailable = false;
}

const row = (id, output) =>
  makeRow({ row_id: id, ts: '2026-09-05T10:00:00.000Z', day: '2026-09-05', tool: 'claude_code', session_id: 's', model: 'm', input_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3, output_tokens: output, reasoning_output_tokens: null });

for (const name of ['sqlite', 'duckdb']) {
  test(`${name}: a repeated row id keeps the larger counts`, { skip: name === 'duckdb' && !duckdbAvailable }, async () => {
    const cfg = config(tmpDir(), { sink: name });
    const sink = await openSink(cfg);
    try {
      await sink.write([row('r1', 5)]);
      await sink.write([row('r1', 120)]);
      await sink.write([row('r1', 7)]);
      const rows = await sink.query({ sql: 'SELECT row_id, output_tokens, total_tokens, reasoning_output_tokens FROM {T}', params: [] });
      assert.deepEqual(rows, [{ row_id: 'r1', output_tokens: 120, total_tokens: 126, reasoning_output_tokens: null }]);
    } finally {
      await sink.close();
    }
  });
}

test('duckdb: the sample logs give the same totals as sqlite', { skip: !duckdbAvailable }, async () => {
  const cfg = config(tmpDir(), { sink: 'duckdb' });
  assert.match(cfg.db, /ledger\.duckdb$/);
  await sync(cfg);
  const sink = await openSink(cfg);
  try {
    const s = await summary(sink, { all: true, tz: 'UTC' });
    for (const tool of ['claude_code', 'codex', 'all']) assert.deepEqual(s.totals[tool], EXPECTED.by_tool[tool]);
    const sessions = Object.fromEntries(s.sessions.map((r) => [r.session_id, r.total_tokens]));
    assert.equal(sessions['22222222-2222-4222-8222-222222222222'], 5696);
  } finally {
    await sink.close();
  }
});

test('bigquery: table names parse in both forms', () => {
  assert.deepEqual(parseTable('my-proj:usage.agent_usage'), { project: 'my-proj', dataset: 'usage', table: 'agent_usage' });
  assert.deepEqual(parseTable('my-proj.usage.agent_usage'), { project: 'my-proj', dataset: 'usage', table: 'agent_usage' });
  assert.throws(() => parseTable(''), /--bq-table/);
});

test('bigquery: queries read a de-duplicated table with typed parameters', () => {
  const q = toBigQuery(dailyQuery(whereClause({ since: '2026-09-01', tool: 'codex' })), parseTable('p:d.t'));
  assert.match(q.sql, /ROW_NUMBER\(\) OVER \(PARTITION BY row_id ORDER BY output_tokens DESC, ts\)/);
  assert.match(q.sql, /FROM \(SELECT \* EXCEPT\(rn\)/);
  assert.match(q.sql, /day >= @p0 AND tool = @p1/);
  assert.doesNotMatch(q.sql, /\?|\{T\}/);
  assert.deepEqual(q.params, ['--parameter=p0:DATE:2026-09-01', '--parameter=p1:STRING:codex']);
});

// A stand-in for the `bq` tool. It records every call and answers `query` with a fixed result.
function fakeBq(dir) {
  const log = path.join(dir, 'calls.jsonl');
  const bin = path.join(dir, 'bq');
  fs.writeFileSync(
    bin,
    `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
const entry = { args };
const load = args.indexOf('load');
if (load !== -1) entry.rows = fs.readFileSync(args[args.length - 2], 'utf8').trim().split('\\n').length, entry.schema = JSON.parse(fs.readFileSync(args[args.length - 1], 'utf8')).map((c) => c.name);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(entry) + '\\n');
if (args.includes('show')) process.exit(fs.existsSync(${JSON.stringify(path.join(dir, 'made'))}) ? 0 : 2);
if (args.includes('mk')) fs.writeFileSync(${JSON.stringify(path.join(dir, 'made'))}, '1');
if (args.includes('query')) process.stdout.write(JSON.stringify([{ day: '2026-09-02', tool: 'codex', sessions: '1', turns: '2', total_tokens: '3600', newest: '2026-09-02 14:05:30' }]));
`,
    { mode: 0o755 },
  );
  return { bin, calls: () => fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) };
}

test('bigquery: sync creates the table once, then appends rows', async () => {
  const dir = tmpDir('ul-bq-');
  const bq = fakeBq(dir);
  const cfg = config(tmpDir(), { sink: 'bigquery', bigquery: { table: 'my-proj:usage.agent_usage', bin: bq.bin } });
  await sync(cfg);
  const calls = bq.calls();
  assert.deepEqual(calls.map((c) => c.args.find((a) => ['show', 'mk', 'load'].includes(a))), ['show', 'mk', 'load']);
  const load = calls[2];
  assert.equal(load.rows, EXPECTED.responses);
  assert.ok(load.args.includes('--noreplace'));
  assert.ok(load.args.includes('--project_id=my-proj'));
  assert.ok(load.args.includes('my-proj:usage.agent_usage'));
  assert.deepEqual(load.schema.slice(0, 4), ['row_id', 'ts', 'day', 'tool']);
  assert.ok(calls[1].args.includes('--time_partitioning_field=day'));
});

test('bigquery: --full drops and recreates the table before loading', async () => {
  const dir = tmpDir('ul-bq-');
  const bq = fakeBq(dir);
  const cfg = config(tmpDir(), { sink: 'bigquery', bigquery: { table: 'p:d.t', bin: bq.bin } });
  await sync(cfg);
  await sync(cfg, { full: true });
  const verbs = bq.calls().map((c) => c.args.find((a) => ['show', 'mk', 'load', 'rm'].includes(a)));
  assert.deepEqual(verbs, ['show', 'mk', 'load', 'rm', 'show', 'load']);
});

test('bigquery: query results come back as numbers and ISO times', async () => {
  const dir = tmpDir('ul-bq-');
  const bq = fakeBq(dir);
  const cfg = config(tmpDir(), { sink: 'bigquery', bigquery: { table: 'p:d.t', bin: bq.bin } });
  const sink = await openSink(cfg);
  const rows = await sink.query(dailyQuery(whereClause({ since: '2026-09-01' })));
  assert.deepEqual(rows, [{ day: '2026-09-02', tool: 'codex', sessions: 1, turns: 2, total_tokens: 3600, newest: '2026-09-02T14:05:30.000Z' }]);
  const query = bq.calls().find((c) => c.args.includes('query'));
  assert.ok(query.args.indexOf('--format=json') < query.args.indexOf('query'), '--format is a global flag');
});
