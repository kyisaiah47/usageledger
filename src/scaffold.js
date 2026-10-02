// `usageledger init --app console|simple|both` writes a Next.js app that reads the local ledger.
//   console  the dense view: per-day chart, ranked bars, sessions and days tables
//   simple   the plain view: a few sentences first, details behind disclosures
//   both     both views, a first-visit welcome dialog and a footer switch between them
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, 'templates', 'next');
export const APP_MODES = ['console', 'simple', 'both'];

// Files each mode leaves out. Everything else in the template is shared.
const SKIP = {
  console: ['components/SimpleView.tsx', 'components/ViewShell.tsx'],
  simple: ['components/ConsoleView.tsx', 'components/ViewShell.tsx'],
  both: [],
};

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p));
  }
  return out.sort();
}

function version() {
  return JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8')).version;
}

export function scaffold({ app, out, name, force = false }) {
  if (!APP_MODES.includes(app)) throw new Error(`usageledger: --app takes console, simple or both, not "${app}"`);
  const dest = path.resolve(out);
  if (fs.existsSync(dest) && fs.readdirSync(dest).length && !force) {
    throw new Error(`usageledger: ${dest} is not empty. Pick another --out or pass --force.`);
  }
  const appName = (name || path.basename(dest)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'usageledger-app';
  const written = [];
  for (const rel of walk(TEMPLATE)) {
    if (SKIP[app].includes(rel)) continue;
    let target = rel;
    let text = fs.readFileSync(path.join(TEMPLATE, rel), 'utf8');
    if (rel.startsWith('app/page.') && rel !== `app/page.${app}.tsx`) continue;
    if (rel === `app/page.${app}.tsx`) target = 'app/page.tsx';
    if (rel === 'package.json.tpl') target = 'package.json';
    if (rel === 'gitignore.tpl') target = '.gitignore';
    text = text.replaceAll('__APP_NAME__', appName).replaceAll('__USAGELEDGER_VERSION__', version()).replaceAll('__APP_MODE__', app);
    const file = path.join(dest, target);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    written.push(target);
  }
  return { out: dest, files: written.sort() };
}
