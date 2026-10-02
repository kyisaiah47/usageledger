// Codex rollout files: one JSON object per line, one file per session.
// The fields read are:
//   session_meta  payload.id, payload.cwd, payload.originator
//   turn_context  payload.model, payload.cwd
//   event_msg     payload.type == "token_count": payload.info.last_token_usage and
//                 payload.info.total_token_usage
// Message text is never decoded beyond the JSON parse.
//
// session_meta sits at the top of the file and the model is set by each turn_context, so an
// incremental sync that starts mid-file needs both carried over. They live in the file's state,
// already reduced to the hash and repo name.
//
// Codex sometimes emits the same token_count twice: the cumulative total does not move and
// last_token_usage repeats. A token_count whose cumulative total equals the previous one is
// skipped. Summing every event instead counts those turns twice.
import path from 'node:path';
import { makeRow } from '../schema.js';

const NEEDLES = ['token_count', 'session_meta', 'turn_context'].map((s) => Buffer.from(s));

export function initialCodexMeta(file) {
  return { sid: null, model: null, origin: null, where: null, prevTotal: null, fallbackSid: path.basename(file).replace(/\.jsonl$/, '') };
}

export function parseCodexLine(bytes, start, ctx, meta) {
  if (!NEEDLES.some((n) => bytes.indexOf(n) !== -1)) return null;
  let d;
  try {
    d = JSON.parse(bytes.toString('utf8'));
  } catch {
    ctx.stats.badLines++;
    return null;
  }
  const t = d?.type;
  const p = d?.payload || {};
  if (t === 'session_meta') {
    meta.sid = p.id || p.session_id || meta.sid;
    meta.origin = p.originator || meta.origin;
    if (p.cwd) meta.where = ctx.cwd(p.cwd);
    return null;
  }
  if (t === 'turn_context') {
    meta.model = p.model || meta.model;
    if (p.cwd) meta.where = ctx.cwd(p.cwd);
    return null;
  }
  if (t !== 'event_msg' || p.type !== 'token_count') return null;
  const info = p.info;
  const last = info?.last_token_usage;
  if (!last) return null;
  const cumulative = info.total_token_usage?.total_tokens;
  if (cumulative != null && meta.prevTotal != null && cumulative === meta.prevTotal) {
    ctx.stats.repeatedEvents++;
    return null;
  }
  if (cumulative != null) meta.prevTotal = cumulative;
  const day = ctx.day(d.timestamp);
  if (!day) {
    ctx.stats.badLines++;
    return null;
  }
  const sid = meta.sid || meta.fallbackSid;
  const input = last.input_tokens || 0;
  const cached = last.cached_input_tokens || 0;
  const rowId = cumulative != null ? `codex:${sid}:${cumulative}:${d.timestamp}` : `codex:${sid}:@${start}`;
  return makeRow({
    row_id: rowId,
    ts: new Date(d.timestamp).toISOString(),
    day,
    tool: 'codex',
    session_id: sid,
    model: meta.model,
    origin: meta.origin,
    ...(meta.where || { cwd: null, cwd_hash: null, repo: null }),
    // Codex counts cached tokens inside input_tokens; split them out so the columns match Claude.
    input_tokens: Math.max(input - cached, 0),
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: last.cache_write_input_tokens || 0,
    output_tokens: last.output_tokens,
    reasoning_output_tokens: last.reasoning_output_tokens ?? null,
  });
}
