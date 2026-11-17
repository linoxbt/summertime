# Deployment

The hosted demo has two parts.

| Part | Host | Source | Deploys on |
|---|---|---|---|
| Web app (`web/`) | Netlify, project `summertime-app` | `main` | every push to `main` |
| Backend + Postgres | Railway, project `summertime` | `main`, `deploy/backend/Dockerfile` | pushes to `main` that touch backend files |

Live: https://summertime-app.netlify.app

## Web (Netlify)

- Config: `web/netlify.toml` (npm workspace build, Next.js runtime plugin).
- `NEXT_PUBLIC_PRIVY_APP_ID` (Netlify environment variable, read at build time) turns on sign-in through Privy; without it the site keeps email and password sign-in.
- `API_URL` (Netlify environment variable) is the backend's public URL. It is read at build
  time, so change it, then trigger a new deploy. Without it, `/api/*` answers
  `503 BACKEND_OFFLINE`.
- The browser only talks to the Netlify origin; `/api/*` is proxied to the backend, so the
  session cookie stays first-party.

## Backend (Railway)

One container runs the ledger (a Canton sequencer, mediator and participant in one
process), the dev token registry, the worker and the API (`deploy/backend/start.sh`).

**The ledger is persistent.** Each Canton node, and the sequencer's ordering layer, stores
its state in its own Postgres database on the same server as `DATABASE_URL`
(`canton_sequencer`, `canton_sequencer_driver`, `canton_mediator`, `canton_participant`;
created on first start). Accounts, parties, balances and campaigns survive restarts,
redeploys and crashes (tested with a forced kill). Bootstrap seeds only a new, empty ledger;
on an existing one it runs one throwaway transaction per package so the first user action
after a start is fast.

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway reference) |
| `SESSION_SECRET` | random, set in Railway |
| `DEMO_MODE` | `true` (demo sign-in, faucet, privacy explorer) |
| `PROGRESS_INTERVAL_SECONDS`, `OPS_INTERVAL_SECONDS` | `15` |
| `NODE_ENV` | `production` (secure cookies) |
| `JAVA_OPTS` | `-Xms512m -Xmx2g` |
| `BREVO_API_KEY`, `EMAIL_FROM` | email for password-reset codes through Brevo, which needs no custom domain: `EMAIL_FROM` is the single sender address verified in Brevo. (`RESEND_API_KEY` also works but needs a verified domain.) Without a provider, production refuses reset (`EMAIL_UNAVAILABLE`); development writes mail to the `mail_outbox` table |
| `PRIVY_APP_ID`, `PRIVY_VERIFICATION_KEY` | sign-in through Privy (the app ID, and the verification key from Privy's dashboard, Configuration > App settings; both public). `PRIVY_APP_SECRET` is optional (user lookup when no identity token is sent) |
| `OPERATOR_EMAIL`, `OPERATOR_PASSWORD` | the Summertime operator's real sign-in (set: `operator@summertime.app`). Applied when the values change; a password changed later in the app is kept. Without them the operator is a demo account |

Service settings: Dockerfile `deploy/backend/Dockerfile`, restart on failure, watch paths
`daml/**`, `packages/**`, `services/**`, `deploy/backend/**`, `package*.json`. Needs about
2.5 GB of memory.

**One ledger at a time.** Two containers must never run the ledger against the same
databases. Each container first takes a Postgres advisory lock (`ledger-lock.mjs`) and holds
it for its lifetime; a new container waits until the old one has stopped. For the same
reason the service has no health check: a health-checked, zero-downtime deploy would keep
the old container running until the new one is healthy, which it cannot be while it waits.
A deploy therefore has about a minute of downtime; no data is lost. A standby worker also
waits for the worker leader lock instead of exiting.

Build and run it locally:

```sh
docker build -f deploy/backend/Dockerfile -t summertime-backend .
docker run --rm -p 8080:8080 -e DATABASE_URL=postgres://... -e SESSION_SECRET=... summertime-backend
```

## Not for real funds

This hosting is a test network: a single-node Canton ledger of our own, test USDCx and a dev
token registry.
Moving to the real network needs a participant on DevNet (then MainNet) and real USDCx (or
Canton Coin as the spec's fallback); the code is instrument-agnostic and only configuration
changes (see `docs/development.md`, "Moving to DevNet"). Own-wallet mode and an audit remain.
