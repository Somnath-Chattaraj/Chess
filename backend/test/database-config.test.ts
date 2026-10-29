import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer, type Socket } from 'node:net';
import { createSecureContext, TLSSocket, rootCertificates, type ConnectionOptions } from 'node:tls';
import pg from 'pg';
import { databaseConfig } from '../src/database-config.js';

const url = 'postgres://test:test@127.0.0.1:5432/chess?sslmode=require&application_name=chess';
const ca = rootCertificates[0];

test('explicit provider CA survives pg URL parsing and keeps TLS verification enabled', () => {
  for (const sslmode of ['require', 'verify-ca', 'verify-full']) {
    const config = databaseConfig({
      DATABASE_URL: url.replace('require', sslmode),
      DATABASE_SSL_CA: ca,
    });
    const parsed = new URL(config.connectionString!);
    assert.equal(parsed.searchParams.has('sslmode'), false);
    assert.equal(parsed.searchParams.get('application_name'), 'chess');
    const client = new pg.Client(config);
    const ssl = (client as unknown as { connectionParameters: { ssl: ConnectionOptions } })
      .connectionParameters.ssl;
    assert.equal(ssl.ca, ca);
    assert.equal(ssl.rejectUnauthorized, true);
  }
});

test('local/internal databases retain their original connection settings', () => {
  const internal = 'postgres://test:test@db:5432/chess';
  const config = databaseConfig({ DATABASE_URL: internal });
  assert.equal(config.connectionString, internal);
  assert.equal(config.ssl, undefined);
  assert.equal(config.connectionTimeoutMillis, 10000);
});

test('CA files, escaped PEM and invalid configuration are handled without leaking credentials', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'chess-ca-config-'));
  const file = path.join(directory, 'provider-ca.pem');
  try {
    writeFileSync(file, ca);
    assert.deepEqual(databaseConfig({ DATABASE_URL: url, DATABASE_SSL_CA_FILE: file }).ssl, {
      ca,
      rejectUnauthorized: true,
    });
    assert.deepEqual(
      databaseConfig({ DATABASE_URL: url, DATABASE_SSL_CA: ca.replace(/\n/g, '\\n') }).ssl,
      { ca, rejectUnauthorized: true },
    );
    assert.throws(
      () => databaseConfig({ DATABASE_URL: url, DATABASE_SSL_CA_FILE: file, DATABASE_SSL_CA: ca }),
      /not both/,
    );
    assert.throws(
      () => databaseConfig({ DATABASE_URL: url, DATABASE_SSL_CA_FILE: file + '.missing' }),
      /Cannot read/,
    );
    assert.throws(
      () => databaseConfig({ DATABASE_URL: url, DATABASE_SSL_CA: 'not a certificate' }),
      /valid PEM/,
    );
    assert.throws(
      () => databaseConfig({ DATABASE_URL: 'invalid-secret-password', DATABASE_SSL_CA: ca }),
      (error) => error instanceof Error && !error.message.includes('invalid-secret-password'),
    );
    assert.throws(
      () =>
        databaseConfig({ DATABASE_URL: url + '&sslrootcert=/another/ca.pem', DATABASE_SSL_CA: ca }),
      /not both/,
    );
    const enforced = databaseConfig({
      DATABASE_URL: url + '&ssl=0&uselibpqcompat=true',
      DATABASE_SSL_CA: ca,
    });
    assert.deepEqual(enforced.ssl, { ca, rejectUnauthorized: true });
    assert.equal(new URL(enforced.connectionString!).searchParams.has('uselibpqcompat'), false);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('real PostgreSQL TLS negotiation trusts the configured private CA and rejects untrusted or wrong-host certificates', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'chess-postgres-tls-'));
  const run = (...args: string[]) =>
    execFileSync('openssl', args, { cwd: directory, stdio: 'ignore' });
  const sockets = new Set<Socket>();
  let server: ReturnType<typeof createServer> | undefined;
  try {
    run(
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'ca.key',
      '-out',
      'ca.pem',
      '-days',
      '1',
      '-subj',
      '/CN=Chess test CA',
    );
    run(
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'server.key',
      '-out',
      'server.csr',
      '-subj',
      '/CN=localhost',
    );
    writeFileSync(
      path.join(directory, 'extensions.cnf'),
      'subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n',
    );
    run(
      'x509',
      '-req',
      '-in',
      'server.csr',
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-out',
      'server.pem',
      '-days',
      '1',
      '-extfile',
      'extensions.cnf',
    );
    const providerCa = readFileSync(path.join(directory, 'ca.pem'), 'utf8');
    const context = createSecureContext({
      key: readFileSync(path.join(directory, 'server.key')),
      cert: readFileSync(path.join(directory, 'server.pem'), 'utf8') + providerCa,
    });
    server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => {});
      socket.once('data', (packet) => {
        assert.equal(packet.readInt32BE(4), 80877103); // PostgreSQL SSLRequest
        socket.write('S');
        const tls = new TLSSocket(socket, { isServer: true, secureContext: context });
        tls.on('error', () => {});
        tls.once('data', () => {
          // Reaching PostgreSQL startup proves the client's TLS handshake succeeded.
          const fields = Buffer.from('SERROR\0C28000\0MTLS verified by test endpoint\0\0');
          const header = Buffer.alloc(5);
          header[0] = 'E'.charCodeAt(0);
          header.writeInt32BE(fields.length + 4, 1);
          tls.end(Buffer.concat([header, fields]));
        });
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const connectionString = `postgres://test:test@127.0.0.1:${port}/test?sslmode=require`;
    async function attempt(config: pg.ClientConfig) {
      const client = new pg.Client(config);
      try {
        await client.connect();
      } finally {
        await client.end();
      }
    }
    await assert.rejects(
      attempt(databaseConfig({ DATABASE_URL: connectionString, DATABASE_SSL_CA: providerCa })),
      { code: '28000', message: 'TLS verified by test endpoint' },
    );
    await assert.rejects(
      attempt({
        connectionString: connectionString.replace('require', 'verify-full'),
        connectionTimeoutMillis: 3000,
      }),
      { code: 'SELF_SIGNED_CERT_IN_CHAIN' },
    );
    const wrongHost = databaseConfig({
      DATABASE_URL: connectionString,
      DATABASE_SSL_CA: providerCa,
    });
    wrongHost.ssl = { ...(wrongHost.ssl as ConnectionOptions), servername: 'wrong.example' };
    await assert.rejects(attempt(wrongHost), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  } finally {
    for (const socket of sockets) socket.destroy();
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
    rmSync(directory, { recursive: true });
  }
});
