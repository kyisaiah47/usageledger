#!/usr/bin/env node
// Scrub gate. It fails closed when a file in the repo holds something that must not ship in a
// public package: a personal email address, a home path from the maintainers' machine, an
// internal project id, an account handle or DID, a key-shaped string, or bot-detection bypass
// code. It has no allow list and no override flag. A finding is fixed in the file.
//
//   node scripts/scrub-gate.mjs [dir]
//
// In a git work tree it scans every tracked or unignored file. Elsewhere it walks the directory
// and skips node_modules and .git. It exits 1 on any finding, on an unreadable file, and when it
// finds nothing to scan.
//
// Every needle below is assembled from pieces, so this file never matches itself.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const j = (...parts) => parts.join('');
const lit = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const anyOf = (list, flags = 'i') => new RegExp(list.map(lit).join('|'), flags);

export const RULES = [
  {
    name: 'personal email address',
    re: anyOf([j('kyisaiah47', '@gmail'), j('kyisaiah96', '@'), j('isaiah', '.kynth@'), j('kynth', '.studios@'), j('fetchdue', '@gmail'), j('kyysaua', '@')]),
  },
  { name: 'maintainer home path', re: anyOf([j('/Users', '/admin')], '') },
  { name: 'internal BigQuery project', re: anyOf([j('local-service', '-ai')]) },
  { name: 'internal Supabase project id', re: anyOf([j('xowekqdstt', 'xwbhfxvusa')]) },
  { name: 'Stripe account id', re: new RegExp(j('\\bacct', '_[0-9A-Za-z]{14,}')) },
  { name: 'internal secret tool', re: anyOf([j('compound', '-secret'), j('compound', '-vault')]) },
  {
    name: 'account handle',
    re: anyOf([j('@compound', 'labsinc'), j('@thecompound', 'labs'), j('@kynth', 'studios'), j('@kyisaiah', '47'), j('kyisaiah47', '.thecompound'), j('@thecompound', '.tech'), j('@compound', 'labs'), j('ky', 'nth.studio')]),
  },
  { name: 'account DID', re: new RegExp(j('did:', 'plc:[a-z2-7]{20,}')) },
  { name: 'Anthropic or OpenAI key', re: new RegExp(j('\\bsk', '-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}')) },
  { name: 'Stripe key', re: new RegExp(j('\\b(?:sk|rk|pk)', '_(?:live|test)_[0-9A-Za-z]{10,}')) },
  { name: 'Stripe webhook secret', re: new RegExp(j('\\bwhsec', '_[0-9A-Za-z]{20,}')) },
  { name: 'Google API key', re: new RegExp(j('\\bAI', 'za[0-9A-Za-z_-]{35}')) },
  { name: 'GitHub token', re: new RegExp(j('\\b(?:gh[pousr]_[0-9A-Za-z]{30,}|github', '_pat_[0-9A-Za-z_]{40,})')) },
  { name: 'npm token', re: new RegExp(j('\\bnpm', '_[0-9A-Za-z]{36}\\b')) },
  { name: 'AWS access key', re: new RegExp(j('\\bAK', 'IA[0-9A-Z]{16}\\b')) },
  { name: 'Slack token', re: new RegExp(j('\\bxox', '[abprs]-[0-9A-Za-z-]{10,}')) },
  { name: 'Supabase access token', re: new RegExp(j('\\bsbp', '_[0-9a-f]{40}\\b')) },
  { name: 'Resend key', re: new RegExp(j('\\bre', '_[A-Za-z0-9]{8}_[A-Za-z0-9]{20,}')) },
  { name: 'JSON web token', re: new RegExp(j('\\beyJ', '[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}')) },
  { name: 'private key block', re: new RegExp(j('-----BEGIN ', '[A-Z ]*PRIVATE KEY-----')) },
  {
    name: 'bot-detection bypass',
    re: new RegExp(
      [
        lit(j('puppeteer-extra', '-plugin-stealth')),
        lit(j('playwright', '-extra')),
        lit(j('Stealth', 'Plugin')),
        lit(j('2cap', 'tcha')),
        j('anti', '-?captcha'),
        lit(j('cap', 'solver')),
        j('captcha', '.?solv'),
        j('defineProperty\\(\\s*navigator\\s*,\\s*[\'"`]web', 'driver'),
      ].join('|'),
      'i',
    ),
  },
];

function listFiles(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const inside = execFileSync('git', ['-C', root, 'rev-parse', '--show-prefix'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (inside === '') return [...new Set(out.split('\0').filter(Boolean))].filter((f) => fs.existsSync(path.join(root, f)));
  } catch {
    // not a git work tree root; walk instead
  }
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) files.push(path.relative(root, p));
    }
  };
  walk(root);
  return files;
}

function redact(s) {
  const t = s.trim();
  return t.length <= 6 ? '***' : t.slice(0, 4) + '***';
}

export function scan(root) {
  const findings = [];
  const errors = [];
  const files = listFiles(root);
  for (const rel of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch (e) {
      errors.push(`${rel}: unreadable (${e.code || e.message})`);
      continue;
    }
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        const m = rule.re.exec(line);
        if (m) findings.push({ file: rel, line: i + 1, rule: rule.name, sample: redact(m[0]) });
      }
    });
  }
  return { files: files.length, findings, errors };
}

const isMain = (() => {
  try {
    return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const { files, findings, errors } = scan(root);
  for (const f of findings) console.error(`scrub-gate: ${f.file}:${f.line}: ${f.rule} (${f.sample})`);
  for (const e of errors) console.error(`scrub-gate: ${e}`);
  if (files === 0) console.error(`scrub-gate: no files found under ${root}; refusing to pass an empty scan.`);
  if (findings.length || errors.length || files === 0) {
    console.error(`scrub-gate: FAILED with ${findings.length} findings and ${errors.length} unreadable files in ${files} files.`);
    process.exit(1);
  }
  console.log(`scrub-gate: passed, ${files} files scanned, 0 findings.`);
}
