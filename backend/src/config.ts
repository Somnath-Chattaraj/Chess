/** Prefer a custom domain when configured; otherwise Render supplies the public URL. */
export function resolveOrigin(env: NodeJS.ProcessEnv = process.env) {
  const value = env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || 'http://localhost:5173';
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without a path or credentials.');
  }
  return url.origin;
}
