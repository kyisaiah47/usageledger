// The local web view. It binds to 127.0.0.1 by default and serves two things:
//   /                 one HTML page with no outside assets
//   /api/summary      the summary() JSON for ?days=N, or ?all=1, and optional ?tool=
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSink } from './sinks/index.js';
import { summary } from './report.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function pageHtml() {
  return fs.readFileSync(path.join(HERE, 'web', 'index.html'), 'utf8');
}

export async function startServer(cfg, { port = 4477, host = '127.0.0.1' } = {}) {
  const html = pageHtml();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    try {
      if (req.method !== 'GET') {
        res.writeHead(405).end();
        return;
      }
      if (url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(html);
        return;
      }
      if (url.pathname === '/api/summary') {
        const tool = url.searchParams.get('tool');
        const sink = await openSink(cfg);
        try {
          const s = await summary(sink, {
            days: Number(url.searchParams.get('days')) || 30,
            all: url.searchParams.get('all') === '1',
            tool: tool === 'claude_code' || tool === 'codex' ? tool : undefined,
            tz: cfg.tz,
          });
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify(s));
        } finally {
          await sink.close();
        }
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(e.message || e) }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const addr = server.address();
  return { server, url: `http://${host}:${addr.port}/` };
}
