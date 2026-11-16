# Summertime

**Commit together. Settle together.**

Summertime lets competing importers reserve space in a shared shipping container on Canton without seeing each other's volumes or identities. Each importer locks USDCx against a forwarder-signed capacity reservation. If the container fills before the deadline, every payment settles to the forwarder in one atomic transaction. If it doesn't, every importer's funds are released and eligible importers share a failure bond the forwarder posted upfront.

> *Competing importers cannot see each other's reservations, volumes or identities. Your forwarder sees your reservation, exactly as it does today, and so does Summertime, which enforces the settlement rules. Funds move only if the container fills.*

## Quick start

```sh
npm install
npm run dev        # builds the contracts, starts a local Canton ledger and the whole app
open http://localhost:3000
```

Requires Node 22, PostgreSQL 16 and the Daml SDK 3.7.1 (`dpm`). Details in [docs/development.md](docs/development.md).

## What's in the repository

| Path | Contents |
| --- | --- |
| [`daml/`](daml/) | `summertime-core` contracts and 22 Daml Script tests |
| [`packages/ledger`](packages/ledger) | Typed Canton JSON Ledger API and CIP-56 registry clients, shared types |
| [`packages/platform`](packages/platform) | Config, database schema, deterministic command runner |
| [`services/api`](services/api) | HTTP API: sessions, party-scoped reads, every user action ([reference](docs/api.md)) |
| [`services/worker`](services/worker) | Operator and forwarder automation, pilot custody |
| [`services/dev-registry`](services/dev-registry) | Local CIP-56 registry for the reference token (development only) |
| [`web`](web) | Next.js app: public site, forwarder dashboard, importer flow, privacy explorer |
| [`tests/e2e`](tests/e2e) | End-to-end tests against the live stack |
| [`docs/`](docs/) | Build specification, API reference, developer guide |
| [`application/`](application/) | AppsFactory Cohort 2 application pack |

## Status

- Runs end to end on a local Canton sandbox: campaigns, private reservations, atomic settlement, failure bonuses, bookings and disputes, and operations monitoring with bond custody reconciliation.
- Tested: 22 Daml Script tests; unit tests; end-to-end suites for the API (success and failure campaigns), guards (authorization, idempotency, visibility), operations (simulated custody misuse), the browser journey, and a WCAG 2.1 A/AA audit. CI runs them all (`.github/workflows/ci.yml`).
- Not yet deployed to DevNet; USDCx integration uses the standard CIP-56 registry API and is untested against the real registry. See [docs/development.md](docs/development.md#moving-to-devnet).
- Pilot mode only: Summertime hosts every party and signs on its behalf. Wallet mode is a later phase.
- **Unaudited.** Do not use with real funds.

## Documentation

- [Build specification v1.2](docs/Summertime_Build_Specification.md) ([PDF](docs/Summertime_Build_Specification.pdf)); "Implementation Status" records what is built and what changed during implementation; "Changes in Version 1.1" covers the design review of v1.0 (working name Carde)
- [API reference](docs/api.md)
- [Developer guide](docs/development.md)
- [Contracts and tests](daml/README.md)
