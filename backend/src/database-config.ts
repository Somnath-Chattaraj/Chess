import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import type { PoolConfig } from 'pg';

/** Configure provider-specific trust without disabling TLS or hostname verification. */
export function databaseConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const config: PoolConfig = {
    connectionString: env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 10000,
  };
  const file = env.DATABASE_SSL_CA_FILE;
  const inline = env.DATABASE_SSL_CA;
  if (file && inline)
    throw new Error('Set either DATABASE_SSL_CA_FILE or DATABASE_SSL_CA, not both.');
  if (!file && !inline) return config;

  let ca: string;
  if (file) {
    try {
      ca = readFileSync(file, 'utf8');
    } catch {
      throw new Error('Cannot read DATABASE_SSL_CA_FILE. Check the Render secret-file path.');
    }
  } else {
    ca = inline!.replace(/\\n/g, '\n');
  }
  const certificates = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  try {
    if (!certificates?.length) throw new Error('Missing PEM certificate');
    for (const certificate of certificates) new X509Certificate(certificate);
  } catch {
    throw new Error(
      'The database CA must contain valid PEM certificates from your database provider.',
    );
  }

  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid protocol');
  } catch {
    // URL parsing errors can include credentials, so return a configuration-only message.
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  if (['sslrootcert', 'sslcert', 'sslkey'].some((key) => url.searchParams.has(key))) {
    throw new Error(
      'Use the database CA environment settings or URL certificate settings, not both.',
    );
  }
  // pg re-parses these query parameters after applying PoolConfig and would replace ssl.ca.
  // With an explicit provider CA, always use verified TLS regardless of legacy URL modes.
  for (const key of ['sslmode', 'ssl', 'uselibpqcompat']) url.searchParams.delete(key);
  config.connectionString = url.toString();
  config.ssl = { ca, rejectUnauthorized: true };
  return config;
}
