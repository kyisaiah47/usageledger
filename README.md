# UsageLedger

UsageLedger counts the tokens Claude Code and Codex use on your computer. It reads the session logs both tools already write, and it stores one row per model response in a database you own.

## What it measures

- Every Claude Code response in `~/.claude*/projects/**/*.jsonl` and every Codex token event in `~/.codex/sessions/**/*.jsonl`.
- Input, cache read, cache write, output and reasoning tokens for each response.
- The same five columns for both tools. Codex counts cached tokens inside its input count, so UsageLedger subtracts them. A Claude Code input token and a Codex input token then mean the same thing.
- Totals per day, per model, per repo, per origin (the CLI, an SDK, `codex exec`) and per session.
- Each response once. Claude Code writes one log line per content block of a response, and the early lines carry a partial output count. Codex sometimes writes the same token event twice. UsageLedger keeps one row per response with its final counts. Summing raw log lines instead can double the output total.

UsageLedger reads only files on your computer. It makes no network call, and it needs no API key.

## What it keeps

UsageLedger stores no path from your computer by default.

- The working directory of a session is stored as a salted hash. The salt is created once in `~/.usageledger/salt`, readable only by you. Sessions in one directory share a hash, and the hash cannot be turned back into the path.
- The repo column holds only the base name of the git repository the session ran in, such as `billing-api`. Your home directory is stored as `home` and temporary directories as `tmp`, so your user name never lands in the ledger.
- The sync state keeps a byte offset per log file, keyed by a salted hash of the file's path.
- Message text is never stored.

The `--raw-cwd` flag turns this off and also stores the full working directory.

## Install

UsageLedger needs Node.js 22.13 or later. It has no runtime dependencies.

```sh
npm install -g usageledger
usageledger sync
usageledger report
```

You can also run it without installing it, with `npx usageledger sync`.

## Sync

```sh
usageledger sync
```

The first sync reads every log file. Each later sync reads only the bytes a file gained since the last one. A line that is still being written waits for the next sync. A file that got shorter is read again from the start.

| Flag | What it does |
|---|---|
| `--claude <glob>` | Reads Claude Code logs from this glob. Repeat it for more than one. The default is `~/.claude*/projects/**/*.jsonl`, plus `$CLAUDE_CONFIG_DIR/projects` when that is set. |
| `--codex <glob>` | Reads Codex logs from this glob. The default is `$CODEX_HOME/sessions/**/*.jsonl`, or `~/.codex/sessions/**/*.jsonl`. |
| `--exclude <text>` | Skips every file whose path contains this text, ignoring case. Repeat it for more than one. |
| `--full` | Forgets the byte offsets, reads every file again and rebuilds the ledger. |
| `--dry-run` | Reads and counts, and writes nothing. |
| `--raw-cwd` | Also stores the full working directory. |
| `--tz <zone>` | Uses this time zone for calendar days. The default is your computer's time zone. |

Two config directories that link to one projects folder are read once, because UsageLedger follows each file to its real path.

## Report

```sh
usageledger report
```

The report starts with a few sentences, then prints a table per day, per model, per repo and per session.

```
Claude Code used 8,110 tokens in 2 sessions and wrote 590 of them.
Codex used 9,300 tokens in 2 sessions and wrote 1,100 of them.
Cache reads were 71% of all tokens between 2026-09-01 and 2026-09-03.

Per model
MODEL              TOOL         SESSIONS  TURNS  INPUT  CACHE READ  OUTPUT  TOTAL
-----------------  -----------  --------  -----  -----  ----------  ------  -----
gpt-5-codex        Codex               2      2  1,200       5,000   1,000  7,200
claude-opus-4-1    Claude Code         1      2      5       4,500     350  5,355
```

| Flag | What it does |
|---|---|
| `--by <axis>` | Prints one table: `day`, `model`, `repo`, `origin` or `session`. |
| `--days <n>` | Reports the last n days, today included. The default is 30. |
| `--since`, `--until` | Sets the window by date, as `YYYY-MM-DD`. |
| `--all` | Reports every day in the ledger. |
| `--tool <tool>` | Keeps one tool: `claude_code` or `codex`. |
| `--limit <n>` | Sets the rows per table. The default is 20. |
| `--json` | Prints the whole summary as JSON. |

## Web view

```sh
usageledger serve
```

This serves a page at http://127.0.0.1:4477 with the same totals, a chart per day, ranked bars per model, repo and origin, and tables of sessions and days. It listens on your computer only, and the page loads nothing from the internet. Use `--port` and `--host` to change where it listens.

## Next.js app

```sh
usageledger init --app both --out my-ledger
cd my-ledger && npm install && npm run dev
```

The `--app` flag writes a Next.js app that reads your ledger on the server.

- `--app console` writes the dense view: sentences on top, a chart per day, ranked bars, and sortable tables of sessions and days.
- `--app simple` writes the plain view: a few sentences first, with the tables behind disclosures.
- `--app both` writes both views, a welcome dialog on the first visit, and a footer switch between them. The choice is saved in the browser and in the `?view=` parameter.

While your ledger is empty, the app shows a labeled example built from the sample logs in `examples/`.

## Keep it current

Run the sync on a schedule. Each run reads only new bytes, so a run every 30 minutes is cheap.

With cron:

```cron
*/30 * * * * npx --yes usageledger sync >> ~/.usageledger/sync.log 2>&1
```

With launchd on macOS, save this as `~/Library/LaunchAgents/com.example.usageledger.plist` and run `launchctl load` on it:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.example.usageledger</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>-lc</string><string>npx --yes usageledger sync</string></array>
  <key>StartInterval</key><integer>1800</integer>
</dict>
</plist>
```

launchd starts jobs without your shell's PATH, so the job runs through a login shell.

## Sinks

The ledger lives in SQLite by default. You can pick another sink with `--sink`, or once in `~/.usageledger/config.json`.

| Sink | Where the rows go | What it needs |
|---|---|---|
| `sqlite` | `~/.usageledger/ledger.db` | Nothing. It uses Node's built-in `node:sqlite`. |
| `duckdb` | `~/.usageledger/ledger.duckdb` | The `@duckdb/node-api` package next to UsageLedger: `npm install -g usageledger @duckdb/node-api`. |
| `bigquery` | The table you name with `--bq-table project:dataset.table` | The `bq` tool from the Google Cloud SDK, signed in. |

A response that appears again keeps its largest counts. SQLite and DuckDB merge it on write. BigQuery loads are appends, so every BigQuery read query works on one row per `row_id`. `sync --full` drops and recreates the BigQuery table, which also works in the BigQuery sandbox. The table is partitioned by `day`.

`usageledger schema` prints the BigQuery schema as JSON. `usageledger schema --sql` prints the SQLite table. The read queries are in `src/queries.js`, written once for all three sinks.

A config file holds the same options as the flags:

```json
{
  "sink": "bigquery",
  "bigquery": { "table": "my-project:usage.agent_usage", "location": "US" },
  "exclude": ["scratch"],
  "tz": "America/New_York"
}
```

`USAGELEDGER_HOME` moves the whole folder, including the salt, the state and the default database.

## Columns

| Column | Meaning |
|---|---|
| `row_id` | One model response. Claude Code: message id and request id. Codex: session id, cumulative total and time. |
| `ts`, `day` | When the response was logged, and its calendar day in the configured time zone. |
| `tool` | `claude_code` or `codex`. |
| `session_id`, `model`, `origin` | The session, the model, and what started the session. |
| `repo`, `cwd_hash` | The repo's base name and the salted hash of the working directory. |
| `cwd` | The full working directory, only with `--raw-cwd`. |
| `input_tokens` | Input that was neither read from nor written to the prompt cache. |
| `cache_read_input_tokens` | Input served from the prompt cache. |
| `cache_creation_input_tokens` | Input written to the prompt cache. |
| `output_tokens` | Tokens the model wrote, reasoning included. |
| `reasoning_output_tokens` | The reasoning part of the output, when the log records it. |
| `total_tokens` | Input plus cache read plus cache write plus output. |

## Library

```js
import { resolveConfig, sync, readSummary } from 'usageledger';

await sync(resolveConfig({ tz: 'UTC' }));
const s = await readSummary({ days: 7 });
console.log(s.totals.claude_code.output_tokens);
```

Type declarations ship in `src/index.d.ts`.

## Sample logs

`examples/` holds synthetic logs for both tools, with numbers small enough to add by hand. `examples/README.md` shows the arithmetic, and `examples/expected.json` holds the totals. The test suite syncs the sample logs and checks the ledger against those totals.

## Development

```sh
npm install
npm test
node scripts/scrub-gate.mjs
```

`scripts/scrub-gate.mjs` fails on personal email addresses, maintainer home paths, internal project ids, account handles, key-shaped strings and bot-detection bypass code. CI runs it before the tests on every push.

## License

MIT. Copyright (c) 2026 Compound Labs.
