# Sample logs

These files are synthetic. They copy the line shapes that Claude Code and Codex write, with small numbers so every total can be checked by hand. The test suite syncs the files and compares the ledger with `expected.json`.

Run them yourself:

```sh
npx usageledger sync --home /tmp/ul-example --tz UTC \
  --claude 'examples/claude/projects/**/*.jsonl' --codex 'examples/codex/sessions/**/*.jsonl'
npx usageledger report --home /tmp/ul-example --tz UTC --all
```

## Claude Code

Claude Code's input tokens already exclude the cache. Total equals input plus cache read plus cache write plus output.

| Response | Model | Input | Cache read | Cache write | Output | Total |
|---|---|---:|---:|---:|---:|---:|
| msg_01AAAA (session 1111, 2026-09-01) | claude-sonnet-4-5 | 10 | 0 | 1000 | 120 | 1130 |
| msg_01AAAB (session 1111, 2026-09-01) | claude-sonnet-4-5 | 4 | 1000 | 200 | 80 | 1284 |
| msg_01BBBA (session 2222, 2026-09-02) | claude-opus-4-1 | 3 | 2000 | 500 | 300 | 2803 |
| msg_01BBBB (session 2222, 2026-09-02) | claude-opus-4-1 | 2 | 2500 | 0 | 50 | 2552 |
| msg_01BBBC (session 2222, subagent) | claude-haiku-4-5 | 1 | 0 | 300 | 40 | 341 |
| Claude Code total | | 20 | 5500 | 2000 | 590 | 8110 |

The ledger does not count four lines as new responses:

- `msg_01AAAA` appears twice, once per content block. The first line says 5 output tokens, and the second says 120. The ledger keeps 120.
- `msg_01BBBA` appears again in the subagent file. The ledger keeps one copy.
- The `<synthetic>` line does not represent a model call.
- The last line of session 1111 ends during a write, so the ledger skips it as a bad line.

## Codex

Codex counts cached tokens inside its input tokens. UsageLedger subtracts those tokens, so input has the same meaning for both tools.

| Event | Model | Codex input | Cached | Input | Output | Total |
|---|---|---:|---:|---:|---:|---:|
| session cccc, 14:00:20 | gpt-5-codex | 1200 | 1000 | 200 | 300 | 1500 |
| session cccc, 14:05:30 | gpt-5 | 2000 | 1800 | 200 | 100 | 2100 |
| session dddd, 2026-09-03 | gpt-5-codex | 5000 | 4000 | 1000 | 700 | 5700 |
| Codex total | | | 6800 | 1400 | 1100 | 9300 |

Two events are not counted:

- The token_count at 14:00:21 repeats the preceding cumulative total of 1500, so the ledger treats it as a repeat.
- The token_count at 14:00:03 contains no usage, only rate limits.

## Totals

| Axis | Key | Total tokens |
|---|---|---:|
| Day | 2026-09-01 | 2414 |
| Day | 2026-09-02 | 5696 + 3600 = 9296 |
| Day | 2026-09-03 | 5700 |
| Model | claude-sonnet-4-5 | 1130 + 1284 = 2414 |
| Model | claude-opus-4-1 | 2803 + 2552 = 5355 |
| Model | claude-haiku-4-5 | 341 |
| Model | gpt-5-codex | 1500 + 5700 = 7200 |
| Model | gpt-5 | 2100 |
| Repo | acme-web | 2414 |
| Repo | infra-scripts | 5696 |
| Repo | billing-api | 9300 |
| All | | 17410 |
