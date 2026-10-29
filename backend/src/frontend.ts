import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Optional same-origin UI hosting for single-container platforms such as Render. */
export function serveFrontend(app: express.Express, directory: string) {
  const root = path.resolve(directory);
  const index = path.join(root, 'index.html');
  if (!existsSync(index)) throw new Error('STATIC_DIR must contain a built frontend/index.html.');
  app.use(
    express.static(root, {
      dotfiles: 'deny',
      setHeaders(res, file) {
        res.setHeader(
          'Cache-Control',
          file === index
            ? 'no-cache'
            : file.startsWith(path.join(root, 'assets') + path.sep)
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=86400',
        );
      },
    }),
  );
  app.get('/{*route}', (req, res, next) => {
    // Never turn missing API endpoints or assets into an HTML success response.
    if (/^\/(?:api|ws|assets)(?:\/|$)/.test(req.path) || path.extname(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
