import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scaffold } from '../src/scaffold.js';
import { ROOT, tmpDir } from './helpers.js';

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');

test('--app both writes both views and the shell, with no welcome dialog', () => {
  const out = path.join(tmpDir(), 'My Ledger');
  const res = scaffold({ app: 'both', out });
  assert.deepEqual(res.files, [
    '.gitignore',
    'app/globals.css',
    'app/layout.tsx',
    'app/page.tsx',
    'components/Charts.tsx',
    'components/ConsoleView.tsx',
    'components/Mark.tsx',
    'components/SimpleView.tsx',
    'components/ViewShell.tsx',
    'components/Waves.tsx',
    'icons/mark.generated.ts',
    'lib/format.ts',
    'lib/ledger.ts',
    'lib/window.ts',
    'next.config.mjs',
    'package.json',
    'public/fonts/cabinet-grotesk-400.woff2',
    'public/fonts/cabinet-grotesk-500.woff2',
    'public/icon.svg',
    'tsconfig.json',
  ]);
  const app = JSON.parse(read(out, 'package.json'));
  assert.equal(app.name, 'my-ledger');
  assert.equal(app.dependencies.usageledger, `^${pkg.version}`);
  assert.match(read(out, 'app/page.tsx'), /<ViewShell/);
  assert.match(read(out, 'components/ViewShell.tsx'), /usageledger:view/);
  assert.doesNotMatch(read(out, 'components/ViewShell.tsx'), /welcome/i);
  assert.match(read(out, 'app/page.tsx'), /toggle=\{<ViewToggle \/>\}/);
  // The header mark renders the generated module, the same bytes as the package's own, so the
  // scaffolded app paints the registry drawing and no hand-typed copy.
  assert.match(read(out, 'components/Mark.tsx'), /from '@\/icons\/mark\.generated'/);
  assert.equal(read(out, 'icons/mark.generated.ts'), fs.readFileSync(new URL('../src/icons/mark.generated.ts', import.meta.url), 'utf8'));
  for (const f of res.files) assert.doesNotMatch(read(out, f), /__APP_NAME__|__USAGELEDGER_VERSION__|__APP_MODE__/, f);
});

test('--app console and --app simple write one view each', () => {
  const c = scaffold({ app: 'console', out: path.join(tmpDir(), 'c') });
  assert.ok(c.files.includes('components/ConsoleView.tsx'));
  assert.ok(!c.files.includes('components/SimpleView.tsx'));
  assert.ok(!c.files.includes('components/ViewShell.tsx'));
  assert.match(read(c.out, 'app/page.tsx'), /<ConsoleView/);
  const s = scaffold({ app: 'simple', out: path.join(tmpDir(), 's') });
  assert.ok(s.files.includes('components/SimpleView.tsx'));
  assert.ok(!s.files.includes('components/ConsoleView.tsx'));
  assert.match(read(s.out, 'app/page.tsx'), /<SimpleView/);
});

test('scaffold refuses a directory that is not empty', () => {
  const out = tmpDir();
  fs.writeFileSync(path.join(out, 'keep.txt'), 'x');
  assert.throws(() => scaffold({ app: 'both', out }), /not empty/);
  assert.throws(() => scaffold({ app: 'grid', out: path.join(out, 'x') }), /console, simple or both/);
  scaffold({ app: 'both', out, force: true });
  assert.ok(fs.existsSync(path.join(out, 'keep.txt')));
});

test('`usageledger --app simple --out dir` runs init', () => {
  const out = path.join(tmpDir(), 'app');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'src/cli.js'), '--app', 'simple', '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Wrote a Next\.js app with the Simple view/);
  assert.ok(fs.existsSync(path.join(out, 'components/SimpleView.tsx')));
});
