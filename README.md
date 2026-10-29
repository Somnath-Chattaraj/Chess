# Chess Club

A browser chess application for live games and local two-player games. React renders the board; a Node.js server owns online game state and validates moves with [chess.js](https://jhlywa.github.io/chess.js/). PostgreSQL stores accounts, sessions, and games. Nginx serves the production frontend and proxies HTTP and WebSocket traffic through a single port.

![Chess Club playing interface](docs/preview.png)

## Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Somnath-Chattaraj/Chess)

The button opens a review screen in your Render account. It creates one **free** Docker web service and one **free** managed PostgreSQL database in Singapore for a temporary preview. The React build, HTTP API, and WebSocket endpoint share the same web service and public URL. No separate Nginx service or hostname wiring is required.

1. Click **Deploy to Render** and sign in. Select the workspace where you want the application to run.
2. Review the resources declared in `render.yaml` and confirm that both compute plans are **Free**. Free Postgres expires after **30 days**. The web service sleeps after inactivity, so the first visit may take about a minute to wake it.
3. Approve the Blueprint and wait until both resources are ready. The database URL is wired automatically. `RENDER_EXTERNAL_URL` supplies the allowed public origin, and secure session cookies are enabled.
4. Open the web service's HTTPS URL. Check `/api/health`, then create two accounts in different browser sessions to test a private game.

`render.yaml` is the deployment definition; `deploy/Dockerfile.render` builds the combined web service. The original Docker Compose deployment remains available for servers and local use. The Blueprint restricts external database connections and leaves automatic deployments off. To update after a GitHub push, use **Manual Deploy → Deploy latest commit** in Render.

Keep one running web-service instance. Schedule redeploys between games: live game coordination is process-local, and rolling deployments can briefly overlap old and new processes. Do not treat deployments as safe mid-match migrations. The restart smoke test verifies recovery after a stopped process, rather than simultaneous process ownership.

For a custom domain, add it in Render, then set `APP_ORIGIN=https://chess.your-domain.com` and redeploy. The custom value takes precedence over Render's default hostname. Do not include a path. The automatic `onrender.com` origin requires no manual environment setup.

Free plans are suitable only for a temporary preview: the web service sleeps when idle and free Postgres expires after 30 days. `render.yaml` uses free plans. For an ongoing paid installation, select `render.production.yaml` as the Blueprint path instead; its small web service and Postgres plans currently have a combined base compute price of $13/month, before taxes, usage overages, and any existing paid workspace subscription. Review Render’s quote before choosing that configuration. Resource creation and billing happen in your Render account only after approval. No persistent application disk, Redis service, or separately purchased TLS certificate is needed.

References: [Render Blueprint settings](https://render.com/docs/blueprint-spec), [deploy button](https://render.com/docs/deploy-to-render), [pricing](https://render.com/pricing), [free-plan limits](https://render.com/docs/free).

### External PostgreSQL on Aiven

Aiven PostgreSQL uses a project CA that Node does not trust automatically. A deployment can build successfully and then fail at startup with `SELF_SIGNED_CERT_IN_CHAIN` until the CA is configured. Changing `sslmode` alone does not install that CA.

1. In Aiven, open your PostgreSQL service’s **Overview → Connection information → CA Certificate → Download**. Download the CA certificate, not a private key.
2. In your Render **web service**, add a **Secret File** named `aiven-ca.pem` containing the downloaded PEM certificate (including its BEGIN/END lines). Render mounts it at `/etc/secrets/aiven-ca.pem`.
3. Set `DATABASE_SSL_CA_FILE=/etc/secrets/aiven-ca.pem`. Keep `DATABASE_URL` set to Aiven’s PostgreSQL connection URL. The app accepts the existing `?sslmode=require` suffix and supplies its own verified TLS configuration when this CA setting is present.
4. Save and redeploy. Keep the health check at `/api/health`.

Alternatively set `DATABASE_SSL_CA` to the certificate PEM itself, using actual line breaks or literal `\n` separators. Use one CA setting, not both. When a provider rotates its CA, replace the certificate bundle and redeploy. Do not commit the certificate or credentials.

The application keeps certificate-chain and hostname verification enabled. It removes conflicting SSL query parameters before giving the explicit CA to node-postgres, because URL SSL options otherwise overwrite the configured CA. URL-based client certificates must be configured separately rather than mixed with these CA environment settings. Render’s internal PostgreSQL URLs and local Compose connections need no new CA setting.

References: [Aiven CA certificates](https://aiven.io/docs/platform/concepts/tls-ssl-certificates), [node-postgres SSL configuration](https://node-postgres.com/features/ssl).

## Run with Docker

Requires Docker Engine/Desktop and the Compose v2 plugin. No host Node.js or PostgreSQL installation is needed.

```sh
cp .env.example .env
# Edit .env and replace DB_PASSWORD with a long random, URL-safe password.
docker compose up --build -d --wait
```

Open **http://localhost:8080**. Pass & play works without an account. For an online game, create two different accounts in separate browser profiles or an incognito window. Select the same time control for matchmaking, or create a private game and share its invite link. One account can have one active game and one connected tab at a time.

```sh
docker compose ps
docker compose logs -f api
curl --fail http://localhost:8080/api/health
docker compose down
```

`down` keeps the database volume. `docker compose down -v` deletes all accounts and games; use it only when you intend to reset the installation.

## What is implemented

- Signup and login with case-insensitive usernames, bcrypt password hashes, and revocable, seven-day HTTP-only cookie sessions.
- Public matchmaking by time control: 3+2, 5+0, or 10+0. A player cannot match themselves or enter another game while already playing.
- Private games with an eight-character code and shareable invite link. Unfilled rooms expire after 30 minutes.
- Server-validated moves and clocks, castling, en passant, promotion including underpromotion, checkmate, stalemate, repetition, insufficient material, and the fifty-move rule.
- Resignation and draw offers that only the opponent can accept. Clock expiry ends the game; a bare king cannot win on time.
- Reconnection to the current position using the same account. Clocks continue during disconnections and server downtime.
- Legal-destination hints, board orientation, scoresheet navigation, and PGN downloads.
- Account game history showing the latest 50 completed online games, with position review and export.
- Untimed pass & play with move takeback. Local games exist in the current tab; export their PGN before closing it.
- Responsive desktop/mobile layout, named square controls, keyboard activation, focus outlines, and focus-contained dialogs.

This is a casual chess server. It does not provide ratings, engine analysis, a computer opponent, spectators, chat, tournaments, email verification, or password recovery. Keep a record of your login credentials. Draw adjudication follows chess.js automatic game-over detection rather than a tournament arbiter's claim process; exceptional timeout positions are not exhaustively adjudicated.

## Deployment

The Compose stack contains three services:

| Service | Role                                                           | Exposure                  |
| ------- | -------------------------------------------------------------- | ------------------------- |
| `web`   | Unprivileged Nginx, static React build, `/api` and `/ws` proxy | Host port 8080 by default |
| `api`   | Node.js HTTP and WebSocket server                              | Internal port 3000 only   |
| `db`    | PostgreSQL 17                                                  | Internal port 5432 only   |

The frontend uses relative URLs, so the same image works on localhost and a domain. Compose waits for database health before starting the API, and API health before starting Nginx. The application containers run without root privileges, with read-only filesystems and dropped capabilities. Nginx uses an in-memory temporary directory. The database uses the named `postgres_data` volume.

### Configuration

Compose reads `.env` from the repository root. Do not commit this file.

| Variable        | Default / requirement   | Meaning                                                                                                                             |
| --------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `DB_PASSWORD`   | Required                | PostgreSQL password. Use URL-safe characters because it is interpolated into a connection URI.                                      |
| `APP_ORIGIN`    | `http://localhost:8080` | Exact browser origin, including scheme and any nonstandard port, with no trailing slash. Used for HTTP and WebSocket origin checks. |
| `WEB_PORT`      | `8080`                  | Published HTTP port. Change `APP_ORIGIN` to match when changing this.                                                               |
| `BIND_ADDRESS`  | `127.0.0.1`             | Host interface. Set to `0.0.0.0` only when intentional external access is required.                                                 |
| `COOKIE_SECURE` | `false`                 | Set to `true` when the browser accesses the app over HTTPS.                                                                         |
| `DATABASE_URL`  | Direct development only | API PostgreSQL connection string; Compose supplies its own value.                                                                   |
| `PORT`          | `3000`                  | API listening port outside Compose.                                                                                                 |

For a public installation, terminate TLS with your existing reverse proxy or load balancer, forward WebSocket upgrades for `/ws`, and set:

```dotenv
APP_ORIGIN=https://chess.example.com
COOKIE_SECURE=true
BIND_ADDRESS=127.0.0.1
```

Forward that domain to `127.0.0.1:8080`. If the proxy runs on a different machine, bind the web service to an appropriate interface and restrict access at the firewall. Keep `/api` and `/ws` under the same origin as the frontend. The API trusts one proxy hop for rate limiting; Nginx overwrites the incoming client-IP header. Do not publish the API directly to the internet.

### Persistence and restarts

Accepted moves and game snapshots are written before broadcasting. Active clocks are checkpointed each second. Startup restores unfinished games from PostgreSQL and charges the elapsed downtime to the side whose turn it was. Matchmaking queues are temporary; disconnected queued players must queue again. Private waiting rooms survive restarts until their 30-minute expiry. A normal stop preserves games and sessions. An abrupt crash can lose up to the last clock checkpoint; a database outage can delay game updates.

Run **one API replica**. Live connections, matchmaking, and game coordination are process-local. Running multiple replicas without shared coordination can produce conflicting game state. Horizontal scaling would require a shared queue, a connection/pub-sub layer, and per-game ownership or locking. The current implementation is intended for a modest single-server deployment, not a rated competition service.

Tables are created idempotently at API startup in the `club_*` namespace. This replaces the repository's unfinished Prisma prototype; it does not import users or games from old prototype tables. Use a fresh database for a new installation. Future schema changes should be introduced through explicit versioned migrations rather than changing existing table definitions in place.

### Backup and restore

Run these from the repository root. Backup files contain private account data and password hashes; store them securely.

```sh
# Save a consistent logical backup.
docker compose exec -T db pg_dump -U chess -d chess --clean --if-exists > chess-backup.sql

# Restore into this installation. Stop writers first.
docker compose stop web api
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U chess -d chess < chess-backup.sql
docker compose up -d --wait
```

Changing `DB_PASSWORD` in `.env` does not change the password inside an existing PostgreSQL volume. Rotate the database role's password through PostgreSQL first, then update `.env` and recreate the API service.

### Updating

Back up the database, update the source checkout, then run:

```sh
docker compose up --build -d --wait
```

The checked-in lockfile fixes JavaScript dependency versions. Docker base images use release tags; pin image digests if your deployment needs immutable base-image reproducibility. The frontend optionally loads Google Fonts and falls back to system fonts if unavailable; game traffic stays on your own server.

## Local development

Use Node.js 22 or newer, npm, and a running PostgreSQL instance. From the repository root:

```sh
npm ci
export DATABASE_URL='postgres://chess:password@localhost:5432/chess'
export APP_ORIGIN='http://localhost:5173'
npm run dev:api
```

In a second terminal:

```sh
npm run dev:web
```

Open the Vite URL, normally **http://localhost:5173**. Vite proxies `/api` and `/ws` to port 3000. If Vite chooses another port, update `APP_ORIGIN` and restart the API. `.env` is read by Docker Compose; the direct Node development process uses exported environment variables.

```sh
npm test                 # Rules, clock, account and matchmaking integration tests
npm run build            # Strict TypeScript checks and production bundles
npm run format:check     # Formatting check
npm audit                # Current dependency advisory check
npm run test:smoke       # End-to-end HTTP/WebSocket test against localhost:8080
```

`test:smoke` requires a running deployment and creates three test accounts and a completed game. Run it on a test database. Set `SMOKE_ORIGIN` to test another origin. Use `SMOKE_RESTART=true npm run test:smoke` from the Compose checkout to also restart the API mid-game and verify recovery. This optional check needs access to Docker.

Integration tests use an isolated in-memory [PGlite](https://pglite.dev/) PostgreSQL engine. They do not connect to your deployment database. CI runs tests, builds both container targets, starts the Compose stack, and checks health.

## Code map

```text
backend/src/app.ts       HTTP accounts, sessions, game history, request validation
backend/src/game.ts      Chess rules, clocks, game snapshots and terminal results
backend/src/manager.ts   Matchmaking, private rooms, socket commands and persistence
backend/src/db.ts        PostgreSQL connection and initial schema
backend/src/index.ts     Startup, authenticated WebSocket upgrades and shutdown
backend/src/config.ts    Render/public-origin configuration
backend/src/frontend.ts  Optional same-origin static UI hosting
backend/test/            Rules and database-backed integration tests
frontend/src/App.tsx     Playing interface, local mode, account dialogs and archive
frontend/src/index.css   Responsive layout and visual system
deploy/nginx.conf        Production static hosting and same-origin proxy
Dockerfile               Shared build stage; API and web runtime targets
compose.yaml             Deployment services, readiness checks and persistent volume
render.yaml              Render web service and managed database Blueprint
deploy/Dockerfile.render Combined frontend/API image for Render
```

### HTTP and WebSocket contract

All HTTP responses are JSON. Account passwords and email addresses are never returned. Mutating HTTP calls require an `Origin` matching `APP_ORIGIN` and a JSON body. Authenticated routes use the `session` cookie.

| Method | Path               | Purpose                                         |
| ------ | ------------------ | ----------------------------------------------- |
| `GET`  | `/api/health`      | Database readiness; returns 503 on failure      |
| `POST` | `/api/auth/signup` | `{ username, email, password }`                 |
| `POST` | `/api/auth/login`  | `{ username, password }`                        |
| `POST` | `/api/auth/logout` | Revoke the current session                      |
| `GET`  | `/api/auth/me`     | Current user or `null`                          |
| `GET`  | `/api/games`       | Current user's last 50 finished games, with PGN |

Connect an authenticated WebSocket to `/ws` with the same allowed origin. Client commands:

```json
{"type":"queue","minutes":10,"increment":0}
{"type":"create","minutes":3,"increment":2}
{"type":"join","room":"ab12cd34"}
{"type":"move","from":"e2","to":"e4","promotion":"q"}
{"type":"offer_draw"}
{"type":"accept_draw"}
{"type":"decline_draw"}
{"type":"resign"}
{"type":"cancel"}
{"type":"sync"}
```

The server accepts minutes `3`, `5`, or `10` and increments `0`, `2`, or `5`; matchmaking requires both to match. Replies are `ready`, `queued`, `state` (with a full `game` snapshot), or `error` (with a `message`). Snapshots carry server clock timestamps; clients interpolate them for display. WebSocket payloads are limited to 4 KiB and 50 messages per 10 seconds per connection. Account endpoints permit 30 attempts per IP per 15 minutes. These process-local limits reset on restart.

## Troubleshooting

- **`SELF_SIGNED_CERT_IN_CHAIN` on Aiven:** upload Aiven’s CA certificate as a Render secret file and set `DATABASE_SSL_CA_FILE=/etc/secrets/aiven-ca.pem` as described above. Rebuild success does not verify the runtime database connection.

- **403 on login or WebSocket handshake:** check that the browser's exact origin matches `APP_ORIGIN`. `localhost` and `127.0.0.1` are different origins.
- **Login succeeds but the session disappears:** `COOKIE_SECURE=true` requires HTTPS. Use `false` only for local HTTP development.
- **A match keeps searching:** a second distinct account must queue for the same time control. Use a private game to arrange a match directly.
- **The board cannot move:** confirm it is your turn and click “Back to game” if reviewing an earlier position.
- **A second tab disconnects the first:** intentional; one live connection is allowed per account. Separate players need separate browser sessions.
- **Database service is unhealthy:** inspect `docker compose logs db`. An existing volume retains its original database password.
- **Port is occupied:** set `WEB_PORT` to another port and update `APP_ORIGIN` accordingly.

The original repository did not include a project license. The chess-piece PNGs are retained from that repository; no new ownership or redistribution rights are asserted here. Review source and asset licensing before redistribution.
