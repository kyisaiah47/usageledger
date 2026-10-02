// Resolves where UsageLedger reads from and writes to.
// Order: command-line flags, then <home>/config.json, then the defaults below.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const TOOLS = ['claude_code', 'codex'];

export function expandHome(p) {
  if (typeof p !== 'string') return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function defaultHome() {
  return expandHome(process.env.USAGELEDGER_HOME || '~/.usageledger');
}

// Claude Code keeps one transcript per session under <config dir>/projects.
// `~/.claude*` also covers extra config dirs such as ~/.claude-work.
export function defaultClaudeGlobs() {
  const globs = ['~/.claude*/projects/**/*.jsonl'];
  if (process.env.CLAUDE_CONFIG_DIR) globs.push(path.join(process.env.CLAUDE_CONFIG_DIR, 'projects/**/*.jsonl'));
  return globs;
}

// Codex keeps one rollout file per session under $CODEX_HOME/sessions/YYYY/MM/DD.
export function defaultCodexGlobs() {
  const base = process.env.CODEX_HOME || '~/.codex';
  return [path.join(base, 'sessions/**/*.jsonl')];
}

export function systemTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function readConfigFile(home) {
  const file = path.join(home, 'config.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`usageledger: ${file} is not valid JSON (${e.message})`);
  }
}

const list = (v) => (v == null ? undefined : Array.isArray(v) ? v : [v]);

// Builds the full option set. `flags` uses the same names as config.json.
export function resolveConfig(flags = {}) {
  const home = expandHome(flags.home || defaultHome());
  const file = flags.ignoreConfigFile ? {} : readConfigFile(home);
  const pick = (k, d) => (flags[k] !== undefined ? flags[k] : file[k] !== undefined ? file[k] : d);
  const bigquery = { ...(file.bigquery || {}), ...(flags.bigquery || {}) };
  const sink = pick('sink', 'sqlite');
  const cfg = {
    home,
    sink,
    db: expandHome(pick('db', path.join(home, sink === 'duckdb' ? 'ledger.duckdb' : 'ledger.db'))),
    statePath: expandHome(pick('state', path.join(home, 'state.json'))),
    saltPath: expandHome(pick('saltFile', path.join(home, 'salt'))),
    salt: flags.salt || process.env.USAGELEDGER_SALT || file.salt || null,
    claude: (list(pick('claude')) || defaultClaudeGlobs()).map(expandHome),
    codex: (list(pick('codex')) || defaultCodexGlobs()).map(expandHome),
    exclude: list(pick('exclude')) || [],
    rawCwd: Boolean(pick('rawCwd', false)),
    tz: pick('tz', systemTimeZone()),
    bigquery: {
      table: bigquery.table || null,
      bin: bigquery.bin || 'bq',
      location: bigquery.location || null,
    },
  };
  // A bad time zone throws here, before any file is read.
  new Intl.DateTimeFormat('en-CA', { timeZone: cfg.tz });
  return cfg;
}

// The salt keys the working-directory hash. It is created once, with owner-only permissions,
// and never leaves the machine. Two machines with different salts produce different hashes.
export function loadSalt(cfg) {
  if (cfg.salt) return cfg.salt;
  if (fs.existsSync(cfg.saltPath)) return fs.readFileSync(cfg.saltPath, 'utf8').trim();
  fs.mkdirSync(path.dirname(cfg.saltPath), { recursive: true });
  const salt = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(cfg.saltPath, salt + '\n', { mode: 0o600 });
  return salt;
}
