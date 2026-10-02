import test from 'node:test';
import assert from 'node:assert/strict';
import { sync } from '../src/sync.js';
import { startServer } from '../src/serve.js';
import { config, tmpDir, EXPECTED } from './helpers.js';

test('the web view serves the page and the summary JSON', async () => {
  const cfg = config(tmpDir());
  await sync(cfg);
  const { server, url } = await startServer(cfg, { port: 0 });
  try {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<title>UsageLedger<\/title>/);
    assert.doesNotMatch(html, /<script[^>]+src=/, 'the page loads no outside script');
    const api = await fetch(url + 'api/summary?all=1');
    assert.equal(api.status, 200);
    const s = await api.json();
    assert.deepEqual(s.totals.all, EXPECTED.by_tool.all);
    const codex = await (await fetch(url + 'api/summary?all=1&tool=codex')).json();
    assert.equal(codex.totals.all.total_tokens, 9300);
    assert.equal((await fetch(url + 'nope')).status, 404);
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  } finally {
    server.close();
  }
});

test('the server binds to the loopback address by default', async () => {
  const cfg = config(tmpDir());
  await sync(cfg);
  const { server, url } = await startServer(cfg, { port: 0 });
  try {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.equal(server.address().address, '127.0.0.1');
  } finally {
    server.close();
  }
});
