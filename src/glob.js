// A small glob for log trees. It supports `*` inside a path segment and `**` for any depth.
// It follows symlinked directories, because Claude Code config dirs are often symlinks to one
// shared projects tree, and it returns each physical file once, by real path.
import fs from 'node:fs';
import path from 'node:path';

function segmentRegex(seg) {
  const src = seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + src + '$');
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function readdir(p) {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

function expand(base, segs, out, seenDirs) {
  if (segs.length === 0) {
    if (isFile(base)) out.push(base);
    return;
  }
  const [seg, ...rest] = segs;
  if (seg === '**') {
    let real;
    try {
      real = fs.realpathSync(base);
    } catch {
      return;
    }
    // A symlink loop or two links to one tree would otherwise walk the same files twice.
    const key = real + '\0' + rest.join('/');
    if (seenDirs.has(key)) return;
    seenDirs.add(key);
    expand(base, rest, out, seenDirs);
    for (const name of readdir(base)) {
      const child = path.join(base, name);
      if (isDir(child)) expand(child, segs, out, seenDirs);
    }
    return;
  }
  if (!/[*?]/.test(seg)) {
    expand(path.join(base, seg), rest, out, seenDirs);
    return;
  }
  const rx = segmentRegex(seg);
  for (const name of readdir(base)) {
    if (rx.test(name)) expand(path.join(base, name), rest, out, seenDirs);
  }
}

export function globFiles(pattern) {
  const abs = path.resolve(pattern);
  const segs = abs.split(path.sep).filter(Boolean);
  const out = [];
  expand(path.sep, segs, out, new Set());
  return out;
}

// Every file matched by any pattern, deduplicated by real path, minus excluded ones.
// `exclude` entries are case-insensitive substrings of the real path.
export function collectFiles(patterns, exclude = []) {
  const needles = exclude.map((e) => String(e).toLowerCase()).filter(Boolean);
  const byReal = new Map();
  for (const pattern of patterns) {
    for (const file of globFiles(pattern)) {
      let real;
      try {
        real = fs.realpathSync(file);
      } catch {
        continue;
      }
      if (byReal.has(real)) continue;
      const lower = real.toLowerCase();
      if (needles.some((n) => lower.includes(n))) continue;
      byReal.set(real, real);
    }
  }
  return [...byReal.keys()].sort();
}
