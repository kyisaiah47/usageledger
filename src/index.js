// Library entry point. The CLI in ./cli.js is a thin layer over these functions.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from './config.js';
import { sync } from './sync.js';
import { openSink } from './sinks/index.js';
import { summary } from './report.js';
import { boundsQuery } from './queries.js';

export { resolveConfig, loadSalt, expandHome, TOOLS } from './config.js';
export { sync } from './sync.js';
export { openSink, SINK_NAMES } from './sinks/index.js';
export { summary, formatReport, headline, compact, listDays } from './report.js';
export { hashCwd, repoName } from './privacy.js';
export { COLUMNS, COLUMN_NAMES, bigQuerySchema } from './schema.js';
export { startServer } from './serve.js';
export { scaffold } from './scaffold.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Where the bundled sample logs live. They are synthetic and back the tests, the README numbers
// and the labeled example in the Simple view.
export const EXAMPLES_DIR = path.join(ROOT, 'examples');

// Syncs the bundled sample logs into a throwaway ledger and returns their summary.
// The fixed salt and time zone make the result identical on every machine.
export async function exampleSummary() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'usageledger-example-'));
  try {
    const cfg = resolveConfig({
      home,
      ignoreConfigFile: true,
      salt: 'usageledger-example',
      tz: 'UTC',
      claude: [path.join(EXAMPLES_DIR, 'claude/projects/**/*.jsonl')],
      codex: [path.join(EXAMPLES_DIR, 'codex/sessions/**/*.jsonl')],
    });
    await sync(cfg);
    const sink = await openSink(cfg);
    try {
      // The window is the sample logs' own days, so the example never stretches to today.
      const [b] = await sink.query(boundsQuery());
      return await summary(sink, { since: b.first_day, until: b.last_day, tz: 'UTC' });
    } finally {
      await sink.close();
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

// Reads the summary for the local ledger, with the same defaults as the CLI.
export async function readSummary({ days = 30, all = false, tool, ...flags } = {}) {
  const cfg = resolveConfig(flags);
  const sink = await openSink(cfg);
  try {
    return await summary(sink, { days, all, tool, tz: cfg.tz });
  } finally {
    await sink.close();
  }
}
