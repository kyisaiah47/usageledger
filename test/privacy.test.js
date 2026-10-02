import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sync } from '../src/sync.js';
import { openSink } from '../src/sinks/index.js';
import { hashCwd, repoName } from '../src/privacy.js';
import { config, tmpDir, EXAMPLES } from './helpers.js';

const FIXTURE_PATHS = ['/Users/alex', '/home/alex', 'code/acme-web', 'src/billing-api'];

async function allRows(cfg) {
  const sink = await openSink(cfg);
  try {
    return await sink.query({ sql: 'SELECT * FROM {T} ORDER BY row_id', params: [] });
  } finally {
    await sink.close();
  }
}

test('by default no path from the logs is stored in the ledger or the state', async () => {
  const cfg = config(tmpDir());
  await sync(cfg);
  const rows = await allRows(cfg);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.equal(r.cwd, null);
    assert.match(r.cwd_hash, /^[0-9a-f]{16}$/);
    assert.ok(['acme-web', 'infra-scripts', 'billing-api'].includes(r.repo), r.repo);
  }
  // Check the raw bytes too, so a path cannot hide in an index or a free page.
  for (const file of [cfg.db, cfg.db + '-wal', cfg.statePath]) {
    if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file).toString('latin1');
    for (const p of [...FIXTURE_PATHS, EXAMPLES]) assert.equal(bytes.includes(p), false, `${path.basename(file)} holds ${p}`);
  }
});

test('one directory gets one hash, and the salt changes it', () => {
  const a = hashCwd('/work/project', 'salt-one');
  assert.equal(a, hashCwd('/work/project', 'salt-one'));
  assert.notEqual(a, hashCwd('/work/project', 'salt-two'));
  assert.notEqual(a, hashCwd('/work/other', 'salt-one'));
  assert.equal(hashCwd(null, 'salt-one'), null);
});

test('--raw-cwd stores the full path', async () => {
  const cfg = config(tmpDir(), { rawCwd: true });
  await sync(cfg);
  const cwds = new Set((await allRows(cfg)).map((r) => r.cwd));
  assert.deepEqual([...cwds].sort(), ['/Users/alex/code/acme-web', '/Users/alex/code/infra-scripts', '/home/alex/src/billing-api']);
});

test('the repo name is the git root, never the user name', () => {
  const home = os.homedir();
  assert.equal(repoName(home), 'home');
  assert.equal(repoName(home + '/'), 'home');
  assert.equal(repoName('/tmp/build-123'), 'tmp');
  assert.equal(repoName(null), null);
  const root = tmpDir('ul-repo-');
  const repo = path.join(root, 'shop-api');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'packages/db'), { recursive: true });
  assert.equal(repoName(path.join(repo, 'packages/db'), { home: '/nonexistent-home' }), 'shop-api');
  // A path that no longer exists falls back to its own base name.
  assert.equal(repoName('/gone/away/project-x', { home: '/nonexistent-home' }), 'project-x');
});

test('a new salt is created once with owner-only permissions', async () => {
  const home = tmpDir();
  const cfg = config(home, { salt: undefined });
  cfg.salt = null;
  await sync(cfg);
  const st = fs.statSync(cfg.saltPath);
  assert.equal(st.mode & 0o777, 0o600);
  const salt = fs.readFileSync(cfg.saltPath, 'utf8');
  await sync(cfg);
  assert.equal(fs.readFileSync(cfg.saltPath, 'utf8'), salt);
});
