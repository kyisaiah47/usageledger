export type Tool = 'claude_code' | 'codex';
export type SinkName = 'sqlite' | 'duckdb' | 'bigquery';

export interface Flags {
  home?: string;
  sink?: SinkName;
  db?: string;
  state?: string;
  saltFile?: string;
  salt?: string;
  claude?: string | string[];
  codex?: string | string[];
  exclude?: string | string[];
  rawCwd?: boolean;
  tz?: string;
  bigquery?: { table?: string; bin?: string; location?: string };
  ignoreConfigFile?: boolean;
}

export interface Config {
  home: string;
  sink: SinkName;
  db: string;
  statePath: string;
  saltPath: string;
  salt: string | null;
  claude: string[];
  codex: string[];
  exclude: string[];
  rawCwd: boolean;
  tz: string;
  bigquery: { table: string | null; bin: string; location: string | null };
}

export interface Row {
  row_id: string;
  ts: string;
  day: string;
  tool: Tool;
  session_id: string | null;
  model: string | null;
  origin: string | null;
  repo: string | null;
  cwd_hash: string | null;
  cwd: string | null;
  input_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number | null;
  total_tokens: number;
}

export interface TokenSums {
  sessions: number;
  turns: number;
  input_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface DayRow extends TokenSums {
  day: string;
  tool: Tool;
}

export interface GroupRow extends TokenSums {
  key: string;
  tool: Tool;
}

export interface RankRow {
  dim: 'model' | 'repo' | 'origin';
  tool: Tool;
  key: string;
  sessions: number;
  turns: number;
  total_tokens: number;
  output_tokens: number;
}

export interface SessionRow {
  session_id: string;
  tool: Tool;
  model: string | null;
  repo: string | null;
  origin: string | null;
  cwd_hash: string | null;
  started_at: string;
  ended_at: string;
  turns: number;
  input_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface Summary {
  since: string;
  until: string;
  windowDays: number;
  days: string[];
  daily: DayRow[];
  groups: { model: GroupRow[]; repo: GroupRow[]; origin: GroupRow[] };
  ranks: RankRow[];
  sessions: SessionRow[];
  totals: { claude_code: TokenSums; codex: TokenSums; all: TokenSums };
  newest: string | null;
  rowCount: number;
}

export interface Sink {
  name: SinkName;
  write(rows: Row[]): Promise<void>;
  reset(): Promise<void>;
  query(q: { sql: string; params: { v: string; t: string }[] }): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

export interface SyncStats {
  claudeFiles: number;
  codexFiles: number;
  filesRead: number;
  bytesRead: number;
  badLines: number;
  repeatedEvents: number;
  linesMerged: number;
}

export interface SummaryOptions {
  days?: number;
  since?: string;
  until?: string;
  all?: boolean;
  tool?: Tool;
  tz?: string;
  limit?: number;
}

export const TOOLS: Tool[];
export const SINK_NAMES: SinkName[];
export const EXAMPLES_DIR: string;
export function resolveConfig(flags?: Flags): Config;
export function loadSalt(cfg: Config): string;
export function expandHome(p: string): string;
export function sync(cfg: Config, opts?: { full?: boolean; dryRun?: boolean }): Promise<{ rows: Row[]; written: number; stats: SyncStats }>;
export function openSink(cfg: Config): Promise<Sink>;
export function summary(sink: Sink, opts?: SummaryOptions): Promise<Summary>;
export function readSummary(opts?: SummaryOptions & Flags): Promise<Summary>;
export function exampleSummary(): Promise<Summary>;
export function formatReport(s: Summary, opts?: { by?: string; limit?: number }): string;
export function headline(s: Summary): string;
export function compact(n: number): string;
export function listDays(since: string, until: string): string[];
export function hashCwd(cwd: string | null, salt: string): string | null;
export function repoName(cwd: string | null, opts?: { home?: string; probe?: boolean }): string | null;
export const COLUMNS: { name: string; type: string; sql: string }[];
export const COLUMN_NAMES: string[];
export function bigQuerySchema(): { name: string; type: string; mode: string }[];
export function startServer(cfg: Config, opts?: { port?: number; host?: string }): Promise<{ server: import('node:http').Server; url: string }>;
export function scaffold(opts: { app: 'console' | 'simple' | 'both'; out: string; name?: string; force?: boolean }): { out: string; files: string[] };
