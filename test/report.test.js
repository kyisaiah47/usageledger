import test from 'node:test';
import assert from 'node:assert/strict';
import { sync } from '../src/sync.js';
import { openSink } from '../src/sinks/index.js';
import { summary, formatReport, listDays, compact } from '../src/report.js';
import { dayFormatter } from '../src/schema.js';
import { config, tmpDir } from './helpers.js';

async function exampleSummary(opts) {
  const cfg = config(tmpDir());
  await sync(cfg);
  const sink = await openSink(cfg);
  try {
    return await summary(sink, { tz: 'UTC', ...opts });
  } finally {
    await sink.close();
  }
}

test('the text report leads with sentences and prints the four tables', async () => {
  const s = await exampleSummary({ since: '2026-09-01', until: '2026-09-03' });
  const text = formatReport(s);
  assert.match(text, /^Claude Code used 8,110 tokens in 2 sessions and wrote 590 of them\.$/m);
  assert.match(text, /^Codex used 9,300 tokens in 2 sessions and wrote 1,100 of them\.$/m);
  assert.match(text, /^Per day$/m);
  assert.match(text, /^Per model$/m);
  assert.match(text, /^Per repo$/m);
  assert.match(text, /^Per session, top 4 by total tokens$/m);
  assert.match(text, /^2026-09-02\s+Codex\s+1\s+2\s+400\s+2,800\s+0\s+400\s+3,600$/m);
  assert.match(text, /^gpt-5-codex\s+Codex\s+2\s+2\s+1,200\s+5,000\s+1,000\s+7,200$/m);
  assert.match(text, /^billing-api\s+Codex\s+2\s+3\s+1,400\s+6,800\s+1,100\s+9,300$/m);
});

test('a window filters by day and a tool filter keeps one tool', async () => {
  const one = await exampleSummary({ since: '2026-09-02', until: '2026-09-02' });
  assert.equal(one.totals.all.total_tokens, 5696 + 3600);
  assert.deepEqual(one.days, ['2026-09-02']);
  const codex = await exampleSummary({ all: true, tool: 'codex' });
  assert.equal(codex.totals.all.total_tokens, 9300);
  assert.equal(codex.totals.claude_code.total_tokens, 0);
});

test('--by picks one table and rejects unknown axes', async () => {
  const s = await exampleSummary({ all: true });
  const text = formatReport(s, { by: 'origin' });
  assert.match(text, /^codex_exec\s+Codex/m);
  assert.doesNotMatch(text, /^Per day$/m);
  assert.throws(() => formatReport(s, { by: 'colour' }), /--by takes/);
});

test('every day in the window is listed, including empty ones', () => {
  assert.deepEqual(listDays('2026-08-30', '2026-09-02'), ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
  assert.deepEqual(listDays('2026-09-02', '2026-09-01'), []);
});

test('calendar days follow the configured time zone', () => {
  const ts = '2026-09-02T02:30:00.000Z';
  assert.equal(dayFormatter('UTC')(ts), '2026-09-02');
  assert.equal(dayFormatter('America/New_York')(ts), '2026-09-01');
  assert.equal(dayFormatter('Asia/Tokyo')(ts), '2026-09-02');
  assert.equal(dayFormatter('UTC')('not a time'), null);
});

test('compact numbers', () => {
  assert.equal(compact(950), '950');
  assert.equal(compact(17410), '17k');
  assert.equal(compact(5696), '5.7k');
  assert.equal(compact(2000), '2k');
  assert.equal(compact(2_500_000), '2.5M');
  assert.equal(compact(3_629_000_000), '3.6B');
});
