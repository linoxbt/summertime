# Developing and running Summertime

## What runs where

```
web (Next.js, :3000) ──/api/*──▶ summertime-api (:7580) ──JSON Ledger API──▶ Canton participant (:7575)
                                       │   ▲                                        ▲
                                       ▼   │                                        │
                                  PostgreSQL ◀── summertime-worker ─────────────────┘
                                                      │
                     CIP-56 registry API (dev registry :7590, or the real USDCx registry)
```

| Component | Path | Role |
| --- | --- | --- |
| Daml contracts | `daml/summertime-core` | Campaigns, reservations, commitments, bond, bonuses (spec section 13) |
| Daml tests | `daml/summertime-test` | 20 Daml Script tests against Splice's reference token |
| Ledger client | `packages/ledger` | Typed JSON Ledger API v2 client, CIP-56 registry client, template IDs, amounts, API types |
| Platform | `packages/platform` | Config, Postgres schema and migrations, deterministic command runner, leader lock |
| API | `services/api` | Sessions, party-scoped reads, every user action (spec section 20); `bootstrap` script |
| Worker | `services/worker` | Operator and forwarder automation, pilot custody (spec section 19.4) |
| Dev registry | `services/dev-registry` | CIP-56 registry off-ledger API for the reference token, plus a test faucet. Development only |
| Web | `web` | Public site, forwarder dashboard, importer flow, privacy explorer |
| End-to-end tests | `tests/e2e` | API and browser runs against the live stack |

The ledger is the source of truth. PostgreSQL holds only profiles, sessions, labels, the command log, idempotency keys, worker offsets and operator bond bookkeeping (NFR-2).

## Prerequisites

- Node.js 22 and npm 10
- Daml SDK 3.7.1 via `dpm` (`curl https://get.digitalasset.com/install/install.sh | sh -s 3.7.1`)
- PostgreSQL 16 on `127.0.0.1:5432`
- Java 17+ (for the Canton sandbox, bundled with the SDK)

## Run everything

```sh
npm install
npm run dev          # Postgres check → Daml build → sandbox → bootstrap → registry → API → worker → web
open http://localhost:3000
npm run dev:stop
```

Demo accounts (sign in from `/login`): **Harbor Bridge Freight** (forwarder), six importers (Ada, Bola, Chidi, Dami, Emeka, Funmi) and **Summertime (operator)** for the privacy explorer. Every account starts with test USDCx; the faucet adds more.

The sandbox is in-memory: restarting it clears the ledger, and the next bootstrap detects that and resets the application database.

## Tests

| Command | What it proves |
| --- | --- |
| `npm run daml:test` | Contract rules: lifecycle, authorization, adversarial cases, privacy of ledger views, arithmetic |
| `npm test` | Unit tests (amount arithmetic mirrors the Daml bonus split) |
| `npm run typecheck` | All TypeScript packages |
| `npm run e2e:api` | Full success and failure campaigns through the API against the live stack (about 5 minutes; waits for real lock times and deadlines) |
| `npm run e2e:guards` | Authentication, roles, idempotency replays, terms validation and each party's ledger view (about 30 seconds) |
| `npm run e2e:ops` | Bond custody reconciliation: simulated operator misuse raises an alert, new campaigns are held, and both recover once custody reconciles (about 1 minute) |
| `npm run e2e:a11y` | axe-core WCAG 2.1 A/AA audit of every page at 360 px and 1280 px, plus a phone overflow check (run after `e2e:ui`) |
| `npm run e2e:ui` | The success journey in a browser: forwarder on desktop, six importers on phone-sized screens |
| `tests/multi-participant/run.sh` | Spec 26.2: a campaign across three Canton participants (Summertime, importer A, importer B). No transaction delivered to an importer's participant mentions the other importer; the one settlement transaction reaches each importer as its own leg only (about 2 minutes; starts its own network) |

CI (`.github/workflows/ci.yml`) runs the Daml tests, typecheck, unit tests and web build on every push, the multi-participant privacy test, and then starts the full stack against a Canton sandbox and Postgres and runs every end-to-end suite.

### Accounts in development

Real accounts sign up at `/signup` and sign in at `/login` with email and password. Without an
email provider, password-reset mail is written to the `mail_outbox` table (and the API log)
instead of being sent. The seeded demo accounts are at `/demo` and have no password.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `LEDGER_URL` | `http://localhost:7575` | Participant JSON Ledger API |
| `LEDGER_TOKEN` | — | Bearer token for the Ledger API when auth is enabled (DevNet) |
| `REGISTRY_URL` | `http://localhost:7590` | CIP-56 registry off-ledger API |
| `DATABASE_URL` | `postgres://summertime:summertime@127.0.0.1:5432/summertime` | Application database |
| `API_PORT` | `7580` | API port |
| `SESSION_SECRET` | dev value | Session token hashing secret; set in every real deployment |
| `DEMO_MODE` | `true` | The demo at `/demo` (seeded accounts, privacy explorer). Real accounts work either way |
| `RESEND_API_KEY`, `EMAIL_FROM` | — | Email provider for password-reset codes; without it, production refuses reset and development uses `mail_outbox` |
| `OPERATOR_EMAIL`, `OPERATOR_PASSWORD` | — | Real sign-in for the Summertime operator (otherwise the operator is a demo account) |
| `PROGRESS_INTERVAL_SECONDS` | `3600` (`15` in `dev.sh`) | Progress publication schedule (F-6) |
| `WORKER_TICK_SECONDS` | `2` | Worker pass interval |
| `OPS_INTERVAL_SECONDS` | `60` (`15` in `dev.sh`) | Operational checks interval (spec 28) |

## Reliability properties

- **Deterministic command IDs.** Every ledger command has an ID derived from its purpose (`hold:<request>`, `countersign:<request>`, `lock:<bond>`, `pay:<payout>`) or from the request's `Idempotency-Key`. A command that already succeeded is never resubmitted (NFR-4).
- **Level-triggered worker.** Each pass reads current ledger state and does what is due, so a crash or restart resumes cleanly. The processed ledger offset is stored for lag monitoring (NFR-6).
- **Single active worker.** A Postgres advisory lock (spec 19.3).
- **Separate ledger users.** Forwarder, operator and each importer submit as different Ledger API users; forwarder and operator never share one, because together they hold the settlement guard's authority.

## Moving to DevNet

1. Join DevNet with an allowlisted validator or a node-as-a-service provider (spec section 9).
2. Upload `summertime-core-0.1.0.dar` to the participant (`POST /v2/packages`) and vet it.
3. Point `REGISTRY_URL` at the instrument's registry (USDCx: the DA Registry Utility) and set the instrument admin from an official source (spec section 16). The API and worker use only the standard CIP-56 endpoints, so no code changes.
4. Replace `bootstrap` with real onboarding: allocate forwarder, operator and importer parties on your validator; create Ledger API users with exactly `CanActAs(party)`; set `LEDGER_TOKEN` (or an OAuth client) per service.
5. Set `DEMO_MODE=false` and a strong `SESSION_SECRET`.
6. Answer the open questions in spec section 41 that depend on the real registry, especially allocation expiry (question 1).
