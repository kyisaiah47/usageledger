// One sync: find the log files, read what each gained since last time, turn usage lines into
// rows, merge repeats of one response, and hand the rows to the sink. The state file is written
// only after the sink accepted the rows, so a failed write is retried in full next time.
import fs from 'node:fs';
import path from 'node:path';
import { loadSalt } from './config.js';
import { collectFiles } from './glob.js';
import { readNewLines } from './reader.js';
import { hashCwd, makeCwdTransform } from './privacy.js';
import { dayFormatter, mergeRows } from './schema.js';
import { parseClaudeLine } from './sources/claude.js';
import { initialCodexMeta, parseCodexLine } from './sources/codex.js';
import { openSink } from './sinks/index.js';

const STATE_VERSION = 1;

function loadState(file) {
  if (!fs.existsSync(file)) return { version: STATE_VERSION, files: {} };
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (s && s.version === STATE_VERSION && s.files) return s;
  } catch {
    // An unreadable state file means a full re-read. The sinks merge by row id, so nothing doubles.
  }
  return { version: STATE_VERSION, files: {} };
}

function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// Two syncs at once would race on the state file. A lock older than an hour is from a crash.
function acquireLock(home) {
  fs.mkdirSync(home, { recursive: true });
  const lock = path.join(home, 'sync.lock');
  try {
    const st = fs.statSync(lock);
    if (Date.now() - st.mtimeMs > 3600_000) fs.rmSync(lock, { force: true });
  } catch {
    // no lock yet
  }
  try {
    fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
  } catch {
    throw new Error(`usageledger: another sync holds ${lock}. Delete it if no sync is running.`);
  }
  return () => fs.rmSync(lock, { force: true });
}

function fileSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return null;
  }
}

export async function sync(cfg, { full = false, dryRun = false } = {}) {
  const release = acquireLock(cfg.home);
  try {
    const salt = loadSalt(cfg);
    const prevState = full ? { version: STATE_VERSION, files: {} } : loadState(cfg.statePath);
    const stats = { claudeFiles: 0, codexFiles: 0, filesRead: 0, bytesRead: 0, badLines: 0, repeatedEvents: 0, linesMerged: 0 };
    const ctx = { day: dayFormatter(cfg.tz), cwd: makeCwdTransform({ salt, rawCwd: cfg.rawCwd }), stats, fileKey: null };
    const rows = new Map();
    const add = (row) => {
      const prev = rows.get(row.row_id);
      if (prev) stats.linesMerged++;
      rows.set(row.row_id, prev ? mergeRows(prev, row) : row);
    };
    const files = {};

    const claudeFiles = collectFiles(cfg.claude, cfg.exclude);
    const claudeSet = new Set(claudeFiles);
    const codexFiles = collectFiles(cfg.codex, cfg.exclude).filter((f) => !claudeSet.has(f));

    for (const file of claudeFiles) {
      // State keys are salted hashes of the path, so the state file holds no paths either.
      const key = hashCwd(file, salt);
      const prev = prevState.files[key] || {};
      ctx.fileKey = key;
      const res = readNewLines(file, prev.offset || 0, (bytes, start) => {
        const row = parseClaudeLine(bytes, start, ctx);
        if (row) add(row);
      });
      stats.claudeFiles++;
      if (res.offset !== (prev.offset || 0)) {
        stats.filesRead++;
        stats.bytesRead += res.offset - (res.reset ? 0 : prev.offset || 0);
      }
      files[key] = { offset: res.offset };
    }

    for (const file of codexFiles) {
      const key = hashCwd(file, salt);
      const prev = prevState.files[key] || {};
      const size = fileSize(file);
      const replaced = size != null && size < (prev.offset || 0);
      const meta = !replaced && prev.codex ? { ...prev.codex } : initialCodexMeta(file);
      ctx.fileKey = key;
      const res = readNewLines(file, replaced ? 0 : prev.offset || 0, (bytes, start) => {
        const row = parseCodexLine(bytes, start, ctx, meta);
        if (row) add(row);
      });
      stats.codexFiles++;
      if (res.offset !== (prev.offset || 0)) {
        stats.filesRead++;
        stats.bytesRead += res.offset - (replaced ? 0 : prev.offset || 0);
      }
      files[key] = { offset: res.offset, codex: meta };
    }

    const list = [...rows.values()];
    if (!dryRun && (list.length || full)) {
      const sink = await openSink(cfg);
      try {
        if (full) await sink.reset();
        if (list.length) await sink.write(list);
      } finally {
        await sink.close();
      }
    }
    if (!dryRun) saveState(cfg.statePath, { version: STATE_VERSION, files });
    return { rows: list, written: dryRun ? 0 : list.length, stats };
  } finally {
    release();
  }
}
