import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from './db.js';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const credentials = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/)
    .transform((s) => s.toLowerCase()),
  password: z
    .string()
    .min(10)
    .max(72)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password exceeds 72 bytes'),
});
const signup = credentials.extend({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
});
export function createApp(db: Database, origin: string, secure: boolean) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '8kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin) {
      res.status(403).json({ message: 'Request origin is not allowed.' });
      return;
    }
    next();
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many attempts. Try again in 15 minutes.' },
  });
  const session = async (userId: string, res: express.Response) => {
    const token = randomBytes(32).toString('hex');
    await db.query(
      "INSERT INTO club_sessions(token,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [digest(token), userId],
    );
    res.cookie('session', token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 7 * 86400000,
      path: '/',
    });
  };
  app.get('/api/health', async (_req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.post('/api/auth/signup', authLimit, async (req, res) => {
    const parsed = signup.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message:
          'Use a 3–24 character username (letters, numbers, underscore), a valid email, and a 10–72 character password.',
      });
      return;
    }
    const { username, email, password } = parsed.data;
    const id = randomUUID();
    try {
      await db.query('INSERT INTO club_users(id,username,email,password) VALUES($1,$2,$3,$4)', [
        id,
        username,
        email,
        await hash(password, 12),
      ]);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        res.status(409).json({ message: 'Username or email already in use.' });
        return;
      }
      throw error;
    }
    await session(id, res);
    res.status(201).json({ user: { id, username } });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Enter your username and password.' });
      return;
    }
    const { rows } = await db.query(
      'SELECT id,username,password FROM club_users WHERE username=$1',
      [parsed.data.username],
    );
    const user = rows[0];
    // A dummy hash prevents a cheap username timing probe.
    const valid = await compare(
      parsed.data.password,
      user?.password ?? '$2b$12$KIXx4aQ6xX1hhlPCnWCxMuJqECQ1pTzDgLB0bHeYB7xTRuC8g2Q/G',
    );
    if (!user || !valid) {
      res.status(401).json({ message: 'Invalid username or password.' });
      return;
    }
    await session(user.id, res);
    res.json({ user: { id: user.id, username: user.username } });
  });
  app.post('/api/auth/logout', async (req, res) => {
    if (req.cookies.session)
      await db.query('DELETE FROM club_sessions WHERE token=$1', [digest(req.cookies.session)]);
    res.clearCookie('session', { path: '/' });
    res.json({ ok: true });
  });
  app.get('/api/auth/me', async (req, res) => {
    res.json({ user: await getUser(db, req.cookies.session) });
  });
  app.get('/api/games', async (req, res) => {
    const user = await getUser(db, req.cookies.session);
    if (!user) {
      res.status(401).json({ message: 'Sign in to view your games.' });
      return;
    }
    const { rows } = await db.query(
      "SELECT data FROM club_games WHERE (white_id=$1 OR black_id=$1) AND status='finished' AND black_id IS NOT NULL ORDER BY updated_at DESC LIMIT 50",
      [user.id],
    );
    res.json({ games: rows.map((r) => r.data) });
  });
  app.use((_req, res) => res.status(404).json({ message: 'Endpoint not found.' }));
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('HTTP error', error);
      res
        .status((error as { status?: number }).status === 400 ? 400 : 500)
        .json({ message: 'Request could not be completed.' });
    },
  );
  return app;
}
export async function getUser(db: Database, token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const { rows } = await db.query(
    'SELECT u.id,u.username FROM club_sessions s JOIN club_users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>now()',
    [digest(token)],
  );
  return rows[0] ?? null;
}
