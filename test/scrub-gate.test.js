import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, tmpDir } from './helpers.js';

const GATE = path.join(ROOT, 'scripts/scrub-gate.mjs');
const run = (dir) => spawnSync(process.execPath, [GATE, dir], { encoding: 'utf8' });
// Each planted value is assembled at run time, so this file passes the gate itself.
const j = (...p) => p.join('');

test('the repository passes its own scrub gate', () => {
  const r = run(ROOT);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /passed, \d+ files scanned, 0 findings/);
});

test('every class of leak fails the gate', () => {
  const planted = {
    'personal email address': j('write to kyisaiah47', '@gmail.com'),
    'maintainer home path': j('/Users', '/admin/CompoundLabs/x'),
    'internal BigQuery project': j('local-service', '-ai:compound_telemetry.agent_usage'),
    'internal Supabase project id': j('https://xowekqdstt', 'xwbhfxvusa.supabase.co'),
    'Stripe account id': j('acct', '_1AbCdEfGhIjKlMnO'),
    'internal secret tool': j('compound', '-secret STRIPE_SECRET_KEY'),
    'account handle': j('follow @compound', 'labsinc'),
    'account DID': j('did:', 'plc:abcdefghijklmnopqrstuvwx'),
    'Anthropic or OpenAI key': j('sk', '-ant-api03-', 'a'.repeat(30)),
    'Stripe key': j('sk', '_live_', 'Z'.repeat(24)),
    'Google API key': j('AI', 'za', 'B'.repeat(35)),
    'GitHub token': j('gh', 'p_', 'c'.repeat(36)),
    'AWS access key': j('AK', 'IA', 'ABCDEFGHIJKLMNOP'),
    'private key block': j('-----BEGIN ', 'RSA PRIVATE KEY-----'),
    'bot-detection bypass': j('require("puppeteer-extra', '-plugin-stealth")'),
  };
  const dir = tmpDir('ul-scrub-');
  const names = Object.keys(planted);
  names.forEach((name, i) => fs.writeFileSync(path.join(dir, `f${i}.txt`), `clean line\n${planted[name]}\n`));
  const r = run(dir);
  assert.equal(r.status, 1);
  names.forEach((name, i) => assert.match(r.stderr, new RegExp(`f${i}\\.txt:2: ${name.replace(/[()]/g, '\\$&')}`), `missed ${name}`));
  assert.doesNotMatch(r.stderr, new RegExp(j('a'.repeat(30)), ''), 'the gate redacts what it found');
});

test('a navigator.webdriver override fails the gate', () => {
  const dir = tmpDir('ul-scrub-');
  fs.writeFileSync(path.join(dir, 'x.js'), j('Object.defineProperty(navigator, ', "'web", "driver', { get: () => false });\n"));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /bot-detection bypass/);
});

test('an empty tree fails closed', () => {
  const r = run(tmpDir('ul-scrub-empty-'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refusing to pass an empty scan/);
});
