// Claude Code transcripts: one JSON object per line. Only `assistant` lines carry token usage.
// The fields read are type, timestamp, sessionId, cwd, entrypoint, requestId, uuid, message.id,
// message.model and message.usage. Message text is never decoded beyond the JSON parse.
//
// Claude Code writes one line per content block (thinking, text, tool use) of a response, and
// every one of those lines repeats the response's usage. The early lines carry a partial output
// count. A response is therefore one row keyed by message id and request id, and the merge keeps
// the largest count. Summing every line instead roughly doubles the output total.
import { makeRow } from '../schema.js';

const USAGE = Buffer.from('"usage"');
const ASSISTANT = Buffer.from('"assistant"');

export function parseClaudeLine(bytes, start, ctx) {
  if (bytes.indexOf(USAGE) === -1 || bytes.indexOf(ASSISTANT) === -1) return null;
  let d;
  try {
    d = JSON.parse(bytes.toString('utf8'));
  } catch {
    ctx.stats.badLines++;
    return null;
  }
  if (!d || d.type !== 'assistant') return null;
  const msg = d.message || {};
  const usage = msg.usage;
  if (!usage || typeof usage !== 'object') return null;
  if (msg.model === '<synthetic>') return null;
  const day = ctx.day(d.timestamp);
  if (!day) {
    ctx.stats.badLines++;
    return null;
  }
  const where = ctx.cwd(d.cwd || null);
  const rowId =
    msg.id && d.requestId
      ? `claude:${msg.id}:${d.requestId}`
      : msg.id
        ? `claude:${msg.id}`
        : `claude:${d.sessionId || ctx.fileKey}:${d.uuid || start}`;
  return makeRow({
    row_id: rowId,
    ts: new Date(d.timestamp).toISOString(),
    day,
    tool: 'claude_code',
    session_id: d.sessionId || null,
    model: msg.model || null,
    origin: d.entrypoint || null,
    ...where,
    input_tokens: usage.input_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens,
    output_tokens: usage.output_tokens,
    reasoning_output_tokens: usage.output_tokens_details?.thinking_tokens ?? null,
  });
}
