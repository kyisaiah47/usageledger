import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT, EXAMPLES, EXPECTED, tmpDir } from './helpers.js';

const CLI = path.join(ROOT, 'src/cli.js');
const base = (home) => [
  '--home', home,
  '--tz', 'UTC',
  '--claude', path.join(EXAMPLES, 'claude/projects/**/*.jsonl'),
  '--codex', path.join(EXAMPLES, 'codex/sessions/**/*.jsonl'),
];

test('sync, then report --json, from the command line', () => {
  const home = tmpDir();
  const out = execFileSync(process.execPath, [CLI, 'sync', ...base(home)], { encoding: 'utf8' });
  assert.match(out, /wrote 8 responses from 5 of 5 log files/);
  assert.match(out, /merged 2 repeated Claude Code lines and skipped 1 repeated Codex events/);
  const json = JSON.parse(execFileSync(process.execPath, [CLI, 'report', '--json', '--all', ...base(home)], { encoding: 'utf8' }));
  assert.deepEqual(json.totals.all, EXPECTED.by_tool.all);
  const again = execFileSync(process.execPath, [CLI, 'sync', ...base(home)], { encoding: 'utf8' });
  assert.match(again, /wrote 0 responses from 0 of 5 log files/);
});

test('report --by model prints one table', () => {
  const home = tmpDir();
  execFileSync(process.execPath, [CLI, 'sync', ...base(home)]);
  const out = execFileSync(process.execPath, [CLI, 'report', '--by', 'model', '--since', '2026-09-01', '--until', '2026-09-03', ...base(home)], { encoding: 'utf8' });
  assert.match(out, /^Per model$/m);
  assert.match(out, /^claude-opus-4-1\s+Claude Code\s+1\s+2\s+5\s+4,500\s+350\s+5,355$/m);
});

test('schema prints the BigQuery schema and the SQLite table', () => {
  const bq = JSON.parse(execFileSync(process.execPath, [CLI, 'schema'], { encoding: 'utf8' }));
  assert.deepEqual(bq.map((c) => c.name).slice(0, 3), ['row_id', 'ts', 'day']);
  assert.ok(bq.find((c) => c.name === 'cwd_hash'));
  const sql = execFileSync(process.execPath, [CLI, 'schema', '--sql'], { encoding: 'utf8' });
  assert.match(sql, /CREATE TABLE IF NOT EXISTS usage/);
  assert.match(sql, /row_id TEXT PRIMARY KEY/);
});

test('help, version and errors', () => {
  const help = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /usageledger sync/);
  const version = spawnSync(process.execPath, [CLI, '--version'], { encoding: 'utf8' });
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/);
  const bad = spawnSync(process.execPath, [CLI, 'explode', '--home', tmpDir()], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unknown command "explode"/);
  const badDate = spawnSync(process.execPath, [CLI, 'report', '--since', 'yesterday', '--home', tmpDir()], { encoding: 'utf8' });
  assert.equal(badDate.status, 1);
  assert.match(badDate.stderr, /--since takes YYYY-MM-DD/);
  const noLedger = spawnSync(process.execPath, [CLI, 'report', '--home', tmpDir(), '--sink', 'nowhere'], { encoding: 'utf8' });
  assert.equal(noLedger.status, 1);
  assert.match(noLedger.stderr, /unknown sink "nowhere"/);
});
