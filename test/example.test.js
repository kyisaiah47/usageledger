import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleSummary, readSummary } from '../src/index.js';
import { sync } from '../src/sync.js';
import { config, tmpDir, EXPECTED } from './helpers.js';

test('exampleSummary() returns the sample logs summary on any machine', async () => {
  const s = await exampleSummary();
  assert.deepEqual(s.totals.all, EXPECTED.by_tool.all);
  assert.equal(s.since, '2026-09-01');
  assert.equal(s.until, '2026-09-03');
  assert.equal(s.windowDays, 3);
});

test('readSummary() reads a ledger with the CLI defaults', async () => {
  const home = tmpDir();
  const cfg = config(home);
  await sync(cfg);
  const s = await readSummary({ home, all: true, tz: 'UTC', ignoreConfigFile: true });
  assert.deepEqual(s.totals.all, EXPECTED.by_tool.all);
});
