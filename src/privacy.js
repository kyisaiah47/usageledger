// Working directories are personal: they carry user names, client names and folder layouts.
// By default UsageLedger stores two things in place of a path:
//   cwd_hash  an HMAC-SHA256 of the full path, keyed by a local salt, cut to 16 hex characters.
//             The same directory always gets the same hash on one machine, so sessions still
//             group by directory, but the path cannot be read back.
//   repo      the base name of the git repository that holds the directory, or of the directory
//             itself when it is not inside one. The home directory is stored as "home" and
//             temporary directories as "tmp", so a user name never lands in the ledger.
// The opt-out flag --raw-cwd also stores the full path in the `cwd` column.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function hashCwd(cwd, salt) {
  if (!cwd) return null;
  return crypto.createHmac('sha256', salt).update(cwd).digest('hex').slice(0, 16);
}

const TMP_ROOTS = ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders', os.tmpdir()];

function under(p, root) {
  const r = root.replace(/\/+$/, '');
  return p === r || p.startsWith(r + '/');
}

export function repoName(cwd, { home = os.homedir(), probe = true } = {}) {
  if (!cwd) return null;
  const clean = cwd.replace(/\/+$/, '') || '/';
  const homeDir = home.replace(/\/+$/, '');
  if (clean === homeDir) return 'home';
  const tmpRoot = TMP_ROOTS.find((r) => r && under(clean, r));
  if (probe) {
    // The nearest ancestor that holds .git (a directory, or a file in a worktree) names the repo.
    // The walk stops at the home directory, a temp root and the file system root.
    let dir = clean;
    while (dir && dir !== '/' && dir !== homeDir && !(tmpRoot && dir === tmpRoot.replace(/\/+$/, ''))) {
      if (fs.existsSync(path.join(dir, '.git'))) return path.basename(dir);
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  if (tmpRoot) return 'tmp';
  const base = path.basename(clean);
  return base || null;
}

// One transformer per sync run, so each directory is probed on disk once.
export function makeCwdTransform({ salt, rawCwd = false, home = os.homedir() }) {
  const cache = new Map();
  return (cwd) => {
    if (!cwd) return { cwd: null, cwd_hash: null, repo: null };
    let hit = cache.get(cwd);
    if (!hit) {
      hit = { cwd: rawCwd ? cwd : null, cwd_hash: hashCwd(cwd, salt), repo: repoName(cwd, { home }) };
      cache.set(cwd, hit);
    }
    return hit;
  };
}
