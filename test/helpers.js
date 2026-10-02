import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from '../src/config.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EXAMPLES = path.join(ROOT, 'examples');
export const EXPECTED = JSON.parse(fs.readFileSync(path.join(EXAMPLES, 'expected.json'), 'utf8'));

export function tmpDir(prefix = 'ul-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// A config that reads only the given log roots, with a fixed salt and UTC days.
export function config(home, { claudeRoot = path.join(EXAMPLES, 'claude'), codexRoot = path.join(EXAMPLES, 'codex'), ...extra } = {}) {
  return resolveConfig({
    home,
    ignoreConfigFile: true,
    salt: 'test-salt',
    tz: 'UTC',
    claude: [path.join(claudeRoot, 'projects/**/*.jsonl')],
    codex: [path.join(codexRoot, 'sessions/**/*.jsonl')],
    ...extra,
  });
}

export function copyExamples(dest) {
  fs.cpSync(EXAMPLES, dest, { recursive: true });
  return dest;
}

export function byKey(rows, key = 'key') {
  const out = {};
  for (const r of rows) {
    const k = r[key];
    out[k] ||= { sessions: 0, turns: 0, output_tokens: 0, total_tokens: 0 };
    for (const f of ['sessions', 'turns', 'output_tokens', 'total_tokens']) out[k][f] += r[f] || 0;
  }
  return out;
}

export function pick(obj, keys) {
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}
