import pg from 'pg';
export interface Database {
  query(text: string, values?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}
export const schema = `
CREATE TABLE IF NOT EXISTS club_users (
 id UUID PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
 password TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS club_sessions (
 token TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES club_users(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS club_games (
 id UUID PRIMARY KEY, white_id UUID NOT NULL REFERENCES club_users(id),
 black_id UUID REFERENCES club_users(id), status TEXT NOT NULL,
 data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS club_games_players ON club_games(white_id, black_id);
CREATE INDEX IF NOT EXISTS club_sessions_expiry ON club_sessions(expires_at);
`;
export function connectDatabase() {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
}
