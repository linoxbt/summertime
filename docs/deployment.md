# Deployment

The hosted demo has two parts.

| Part | Host | Source | Deploys on |
|---|---|---|---|
| Web app (`web/`) | Netlify, project `summertime-app` | `main` | every push to `main` |
| Backend + Postgres | Railway, project `summertime` | `main`, `deploy/backend/Dockerfile` | pushes to `main` that touch backend files |

Live: https://summertime-app.netlify.app

## Web (Netlify)

- Config: `web/netlify.toml` (npm workspace build, Next.js runtime plugin).
- `API_URL` (Netlify environment variable) is the backend's public URL. It is read at build
  time, so change it, then trigger a new deploy. Without it, `/api/*` answers
  `503 BACKEND_OFFLINE`.
- The browser only talks to the Netlify origin; `/api/*` is proxied to the backend, so the
  session cookie stays first-party.

## Backend (Railway)

One container runs the Canton sandbox, the dev token registry, the worker and the API
(`deploy/backend/start.sh`). The sandbox ledger is in memory, so they start and restart
together: on a fresh ledger, bootstrap re-creates the parties and demo balances and clears
the application database to match. **Every restart or redeploy resets the demo.**

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway reference) |
| `SESSION_SECRET` | random, set in Railway |
| `DEMO_MODE` | `true` (demo sign-in, faucet, privacy explorer) |
| `PROGRESS_INTERVAL_SECONDS`, `OPS_INTERVAL_SECONDS` | `15` |
| `NODE_ENV` | `production` (secure cookies) |
| `JAVA_OPTS` | `-Xms512m -Xmx2g` |

Service settings: Dockerfile `deploy/backend/Dockerfile`, health check `/healthz` (600 s),
restart on failure, watch paths `daml/**`, `packages/**`, `services/**`,
`deploy/backend/**`, `package*.json`. Needs about 2.5 GB of memory.

Build and run it locally:

```sh
docker build -f deploy/backend/Dockerfile -t summertime-backend .
docker run --rm -p 8080:8080 -e DATABASE_URL=postgres://... -e SESSION_SECRET=... summertime-backend
```

## Not for real funds

This hosting is a demo: an in-memory Canton sandbox, test USDCx and a dev token registry.
A real deployment needs a Canton participant on DevNet/MainNet, real USDCx, persistent
storage and the remaining items in the spec (real sign-in, own-wallet mode, audit).
