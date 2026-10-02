// Reads only the bytes a log file gained since the last sync.
// The state keeps a byte offset per file. A line without its trailing newline is still being
// written, so it stays unread until a later sync. A file that shrank was replaced, so it is read
// again from the start.
import fs from 'node:fs';

const CHUNK = 16 * 1024 * 1024;

// Calls onLine(bytes, start) for each complete, non-empty line after `offset`.
// `bytes` is a Buffer view of the line without its newline. `start` is its byte offset in the file.
// Returns the offset just past the last complete line.
export function readNewLines(file, offset, onLine) {
  let size;
  try {
    size = fs.statSync(file).size;
  } catch {
    return { offset, size: null, reset: false };
  }
  let start = offset || 0;
  let reset = false;
  if (size < start) {
    start = 0;
    reset = true;
  }
  if (size === start) return { offset: start, size, reset };

  const fd = fs.openSync(file, 'r');
  let pos = start; // file position of the next read
  let carry = Buffer.alloc(0); // bytes after the last newline seen so far
  let carryStart = start; // file offset of carry[0]
  try {
    while (pos < size) {
      const want = Math.min(CHUNK, size - pos);
      const buf = Buffer.allocUnsafe(want);
      const got = fs.readSync(fd, buf, 0, want, pos);
      if (got <= 0) break;
      pos += got;
      const data = carry.length ? Buffer.concat([carry, buf.subarray(0, got)]) : buf.subarray(0, got);
      // 0x0A never occurs inside a multi-byte UTF-8 sequence, so splitting on it is safe.
      let s = 0;
      for (let nl = data.indexOf(0x0a, s); nl !== -1; nl = data.indexOf(0x0a, s)) {
        if (nl > s) onLine(data.subarray(s, nl), carryStart + s);
        s = nl + 1;
      }
      carry = Buffer.from(data.subarray(s));
      carryStart += s;
    }
  } finally {
    fs.closeSync(fd);
  }
  return { offset: carryStart, size, reset };
}
