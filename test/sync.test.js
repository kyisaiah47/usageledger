import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sync } from '../src/sync.js';
import { openSink } from '../src/sinks/index.js';
import { summary } from '../src/report.js';
import { EXPECTED, config, copyExamples, tmpDir, byKey, pick } from './helpers.js';

async function readAll(cfg) {
  const sink = await openSink(cfg);
  try {
    return await summary(sink, { all: true, tz: 'UTC' });
  } finally {
    await sink.close();
  }
}

function assertMatchesExpected(s) {
  assert.equal(s.rowCount, EXPECTED.responses, 'responses');
  for (const tool of ['claude_code', 'codex', 'all']) {
    assert.deepEqual(s.totals[tool], EXPECTED.by_tool[tool], `totals for ${tool}`);
  }
  const models = byKey(s.groups.model);
  for (const [model, want] of Object.entries(EXPECTED.by_model)) {
    assert.deepEqual(pick(models[model], Object.keys(want)), want, `model ${model}`);
  }
  assert.equal(Object.keys(models).length, Object.keys(EXPECTED.by_model).length);
  const repos = byKey(s.groups.repo);
  for (const [repo, want] of Object.entries(EXPECTED.by_repo)) {
    assert.deepEqual(pick(repos[repo], Object.keys(want)), want, `repo ${repo}`);
  }
  const origins = byKey(s.groups.origin);
  for (const [origin, want] of Object.entries(EXPECTED.by_origin)) {
    assert.deepEqual(pick(origins[origin], Object.keys(want)), want, `origin ${origin}`);
  }
  const days = {};
  for (const r of s.daily) (days[r.day] ||= {})[r.tool] = r.total_tokens;
  assert.deepEqual(days, EXPECTED.by_day);
  const sessions = Object.fromEntries(s.sessions.map((r) => [r.session_id, { tool: r.tool, turns: r.turns, total_tokens: r.total_tokens }]));
  assert.deepEqual(sessions, EXPECTED.by_session);
}

test('the sample logs sync to the hand-computed totals', async () => {
  const cfg = config(tmpDir());
  const res = await sync(cfg);
  assert.equal(res.written, EXPECTED.responses);
  assert.equal(res.stats.linesMerged, EXPECTED.skipped.claude_lines_merged);
  assert.equal(res.stats.repeatedEvents, EXPECTED.skipped.codex_repeated_events);
  assert.equal(res.stats.badLines, EXPECTED.skipped.bad_lines);
  assertMatchesExpected(await readAll(cfg));
});

test('a second sync reads nothing and changes nothing', async () => {
  const cfg = config(tmpDir());
  await sync(cfg);
  const again = await sync(cfg);
  assert.equal(again.rows.length, 0);
  assert.equal(again.stats.filesRead, 0);
  assertMatchesExpected(await readAll(cfg));
});

test('syncing in pieces gives the same ledger as one sync', async () => {
  const logs = copyExamples(tmpDir('ul-logs-'));
  const claudeFile = path.join(logs, 'claude/projects/-Users-alex-code-acme-web/11111111-1111-4111-8111-111111111111.jsonl');
  const codexFile = path.join(logs, 'codex/sessions/2026/09/02/rollout-2026-09-02T14-00-00-cccccccc-cccc-4ccc-8ccc-cccccccccccc.jsonl');
  const full = { claude: fs.readFileSync(claudeFile), codex: fs.readFileSync(codexFile) };
  // The Claude cut falls between msg_01AAAA's two lines, so its partial output count lands in the
  // first sync. The Codex cut falls between a token event and its repeat, so the second sync needs
  // the model, cwd and last cumulative total carried over in the state.
  const cut = (buf, n) => {
    let at = -1;
    for (let i = 0; i < n; i++) at = buf.indexOf(0x0a, at + 1);
    return at + 1;
  };
  const cc = cut(full.claude, 2);
  const xc = cut(full.codex, 5);
  fs.writeFileSync(claudeFile, full.claude.subarray(0, cc));
  fs.writeFileSync(codexFile, full.codex.subarray(0, xc));
  const cfg = config(tmpDir(), { claudeRoot: path.join(logs, 'claude'), codexRoot: path.join(logs, 'codex') });
  await sync(cfg);
  const mid = await readAll(cfg);
  assert.ok(mid.totals.all.total_tokens < EXPECTED.by_tool.all.total_tokens);
  fs.appendFileSync(claudeFile, full.claude.subarray(cc));
  fs.appendFileSync(codexFile, full.codex.subarray(xc));
  const second = await sync(cfg);
  assert.equal(second.stats.filesRead, 2);
  assertMatchesExpected(await readAll(cfg));
});

test('a line without its newline waits for the next sync', async () => {
  const logs = tmpDir('ul-logs-');
  const dir = path.join(logs, 'claude/projects/-tmp-x');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 's.jsonl');
  const line = JSON.stringify({ type: 'assistant', sessionId: 's1', cwd: '/srv/x', timestamp: '2026-09-05T10:00:00.000Z', requestId: 'r1', message: { id: 'm1', model: 'claude-sonnet-4-5', usage: { input_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3, output_tokens: 4 } } });
  fs.writeFileSync(file, line.slice(0, 40));
  const cfg = config(tmpDir(), { claudeRoot: path.join(logs, 'claude'), codexRoot: path.join(logs, 'codex') });
  const first = await sync(cfg);
  assert.equal(first.rows.length, 0);
  fs.appendFileSync(file, line.slice(40) + '\n');
  const second = await sync(cfg);
  assert.equal(second.rows.length, 1);
  assert.equal(second.rows[0].total_tokens, 10);
});

test('a file that shrank is read again from the start', async () => {
  const logs = copyExamples(tmpDir('ul-logs-'));
  const file = path.join(logs, 'codex/sessions/2026/09/03/rollout-2026-09-03T09-30-00-dddddddd-dddd-4ddd-8ddd-dddddddddddd.jsonl');
  const cfg = config(tmpDir(), { claudeRoot: path.join(logs, 'claude'), codexRoot: path.join(logs, 'codex') });
  await sync(cfg);
  const before = fs.statSync(file).size;
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  // Same session, rewritten shorter: session_meta, turn_context and a smaller token event.
  const event = JSON.parse(lines[2]);
  event.payload.info.last_token_usage = { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 15 };
  event.payload.info.total_token_usage = event.payload.info.last_token_usage;
  event.timestamp = '2026-09-03T09:40:00.000Z';
  fs.writeFileSync(file, [lines[0], lines[1], JSON.stringify(event)].join('\n') + '\n');
  assert.ok(fs.statSync(file).size < before);
  const res = await sync(cfg);
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0].model, 'gpt-5-codex');
  assert.equal(res.rows[0].session_id, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
});

test('--full rebuilds the ledger with the same totals', async () => {
  const cfg = config(tmpDir());
  await sync(cfg);
  await sync(cfg, { full: true });
  assertMatchesExpected(await readAll(cfg));
});

test('symlinked config dirs are read once', async () => {
  const home = tmpDir('ul-home-');
  fs.mkdirSync(path.join(home, '.claude'));
  fs.cpSync(path.join(copyExamples(tmpDir('ul-logs-')), 'claude/projects'), path.join(home, '.claude/projects'), { recursive: true });
  for (const name of ['.claude-work', '.claude-personal']) {
    fs.mkdirSync(path.join(home, name));
    fs.symlinkSync(path.join(home, '.claude/projects'), path.join(home, name, 'projects'));
  }
  const cfg = config(tmpDir(), { claude: [path.join(home, '.claude*/projects/**/*.jsonl')] });
  const res = await sync(cfg);
  assert.equal(res.stats.claudeFiles, 3);
  assertMatchesExpected(await readAll(cfg));
});

test('--exclude skips files whose path contains the text', async () => {
  const cfg = config(tmpDir(), { exclude: ['INFRA-SCRIPTS'] });
  await sync(cfg);
  const s = await readAll(cfg);
  assert.equal(s.totals.claude_code.total_tokens, 2414);
  assert.equal(s.totals.codex.total_tokens, EXPECTED.by_tool.codex.total_tokens);
});

test('--dry-run reads and counts but writes nothing', async () => {
  const cfg = config(tmpDir());
  const res = await sync(cfg, { dryRun: true });
  assert.equal(res.rows.length, EXPECTED.responses);
  assert.equal(res.written, 0);
  assert.equal(fs.existsSync(cfg.db), false);
  assert.equal(fs.existsSync(cfg.statePath), false);
});

test('a second sync waits while another holds the lock', async () => {
  const cfg = config(tmpDir());
  fs.mkdirSync(cfg.home, { recursive: true });
  fs.writeFileSync(path.join(cfg.home, 'sync.lock'), '1');
  await assert.rejects(sync(cfg), /another sync holds/);
});
