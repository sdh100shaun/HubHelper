// Serves the built site (website/build) under /HubHelper/, mirroring GitHub
// Pages project hosting. Used by `npm run docs:serve` and the accessibility
// e2e tests. Local preview only — not a production server.
//
// Usage: node scripts/serve.mjs   (PORT defaults to 3000)
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../build', import.meta.url)));
const BASE = '/HubHelper/';
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
};

function resolveFile(urlPath) {
  // Resolve inside ROOT only (path traversal guard).
  const candidate = resolve(ROOT, `.${sep}${normalize(urlPath)}`);
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null;
  for (const [file, isDirIndex] of [
    [candidate, false],
    [join(candidate, 'index.html'), true],
  ]) {
    try {
      if (statSync(file).isFile()) return { file, isDirIndex };
    } catch {
      // Not found; try the next candidate.
    }
  }
  return null;
}

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname === '/' || pathname === BASE.slice(0, -1)) {
    res.writeHead(302, { Location: BASE }).end();
    return;
  }
  const inBase = pathname.startsWith(BASE);
  const found = inBase ? resolveFile(decodeURIComponent(pathname.slice(BASE.length))) : null;
  // Like GitHub Pages, redirect directory URLs to their trailing-slash form so
  // the pages' relative links resolve correctly.
  if (found?.isDirIndex && !pathname.endsWith('/')) {
    res.writeHead(301, { Location: `${pathname}/` }).end();
    return;
  }
  if (!found) {
    const notFound = join(ROOT, '404.html');
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    createReadStream(notFound).on('error', () => res.end('Not found')).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(found.file)] ?? 'application/octet-stream' });
  createReadStream(found.file).pipe(res);
}).listen(PORT, () => {
  process.stdout.write(`Serving ${ROOT} at http://localhost:${PORT}${BASE}\n`);
});
