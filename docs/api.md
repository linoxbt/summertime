# summertime-api reference

Base URL: `http://localhost:7580` in development. The web app proxies `/api/*` to it, so browsers call `/api/...` on the web origin and the session cookie stays first-party.

## Conventions

- **Responses:** `{ "data": … }` on success; `{ "error": { "code": "…", "message": "…" } }` on failure, with an HTTP status of 400 (validation), 401 (no session), 403 (wrong role or not a stakeholder), 404, 409 (state conflict, e.g. `LOCKED`), 422 (ledger rejected the action) or 502 (ledger or registry unavailable).
- **Amounts:** integer sub-unit strings plus a display string without the unit: `Amount = { micro, display }` (micro-USDCx, e.g. `"2,100.00"`), `Capacity = { milliCbm, display }` (milli-CBM, e.g. `"14.000"`). Types are in `packages/ledger/src/api-types.ts`.
- **Mutations:** every `POST` requires an `Idempotency-Key` header (any unique string, e.g. a UUID). Repeating a request with the same key returns the stored response; reusing a key with a different body returns `409 IDEMPOTENCY_KEY_REUSED`.
- **Authorization:** a session maps to exactly one party. Every read is made as that party on the ledger, so knowing an ID never grants access (spec section 20).
- **Session:** cookie `st_session` (HttpOnly, SameSite=Lax).

## Authentication (demo mode)

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET /auth/demo-accounts` | — | `{ handle, displayName, role }[]` |
| `POST /auth/demo-login` | `{ handle }` | `SessionUser`; sets cookie |
| `POST /auth/logout` | — | `{ ok: true }` |
| `GET /auth/me` | — | `SessionUser` or 401 |

## Forwarder

| Method and path | Body | Returns | Errors |
| --- | --- | --- | --- |
| `GET /campaigns` | — | `ForwarderCampaignSummary[]` | |
| `POST /campaigns` | `{ title, route?, capacityCbm, thresholdCbm, ratePerCbm, minCbm, maxCbm, lockTime, deadline, bondUsdc }` (decimal strings; ISO times) | `{ campaignId }` | `INVALID_TERMS` |
| `GET /campaigns/:id` | — | `ForwarderCampaignDetail` | `NOT_FOUND` |
| `POST /campaigns/:id/bond` | — | `{ updateId }` | `INSUFFICIENT_BALANCE`, `ALREADY_SENT` |
| `GET /importers` | — | `PartyRef[]` (importer directory for inviting) | |
| `POST /campaigns/:id/invitations` | `{ importers: string[] }` (handles or party IDs) | `{ invited: number }` | `NOT_OPEN` |
| `POST /campaigns/:id/execute` | — | `{ updateId, legCount }` | `BELOW_THRESHOLD`, `PAST_DEADLINE`, `ALREADY_FINAL`, `NOT_OPEN` |
| `POST /campaigns/:id/fail` | — | `{ updateId }` | `NOT_EXPIRED`, `ALREADY_FINAL` |
| `POST /campaigns/:id/cancel` | — | `{ updateId }` | `CAPACITY_HELD`, `ALREADY_FINAL` |
| `GET /campaigns/:id/export.csv` | — | CSV of reservations | |

Campaign `status`: `proposed` (awaiting bond or operator acceptance) → `open` → `locked` (after lock time) → `expired` (after deadline) or a final `succeeded` / `failed` / `cancelled`. `bond.stage`: `awaiting-transfer` → `transfer-sent` → `escrowed` → `locked` → `settled`.

## Importer

| Method and path | Body | Returns | Errors |
| --- | --- | --- | --- |
| `GET /invitations` | — | `InvitationDto[]` | |
| `GET /invitations/:cid` | — | `InvitationDto` | `NOT_FOUND` |
| `POST /invitations/:cid/reserve` | `{ reservedCbm }` (decimal string) | `{ requestCid }` | `BELOW_MIN`, `ABOVE_MAX`, `EXPIRED` |
| `POST /invitations/:cid/decline` | — | `{ ok: true }` | |
| `GET /positions` | — | `PositionDto[]` (one per campaign the importer has acted in) | |
| `GET /positions/:campaignId` | — | `PositionDto` | `NOT_FOUND` |
| `GET /reservations/:cid/allocation-intent` | — | `{ settlement, transferLegId, transferLeg, amount: Amount }` | `EXPIRED` |
| `POST /reservations/:cid/commit` | — | `{ commitmentCid, allocationCid, updateId }` | `ALLOCATION_MISMATCH`, `LOCKED`, `INSUFFICIENT_BALANCE` |
| `POST /commitments/:cid/withdraw` | — | `{ updateId }` | `LOCKED` |
| `POST /commitments/:cid/release` | — | `{ updateId }` | `NOT_EXPIRED` |
| `POST /entitlements/:cid/claim` | — | `{ updateId }` | `NOT_CLAIMABLE`, `ALREADY_CLAIMED`, `WINDOW_CLOSED`, `ALLOCATION_WITHDRAWN` |
| `GET /campaigns/:id/progress` | — | `ProgressDto` | `NOT_FOUND` |

`PositionDto.stage`: `requested` (awaiting countersignature) → `awaiting-signature` (reservation countersigned; importer must sign the allocation) → `committed` → `settled`; or `withdrawn`; after a failed or excluded campaign `claimable` → `bonus-pending` → `bonus-paid`; `released`, `lapsed`. `PositionDto.actions` says which buttons to show.

In pilot mode, `POST /reservations/:cid/commit` allocates the importer's USDCx through the registry and commits in one call, signing as the hosted importer party.

## Any signed-in user

| Method and path | Returns |
| --- | --- |
| `GET /me/receipts` | `ReceiptDto[]` |
| `GET /me/balance` | `BalanceDto` |

## Privacy explorer (demo mode only)

| Method and path | Returns |
| --- | --- |
| `GET /explorer/campaigns` | `{ campaignId, title }[]` |
| `GET /explorer/:campaignId?as=<handle>` | `ExplorerPane`: active contracts for that campaign visible to that party, read from its own ledger view |

Returns `403 DISABLED` outside demo mode.

## Development only

| Method and path | Body | Returns |
| --- | --- | --- |
| `POST /dev/faucet` | `{ amountUsdc }` | `{ updateId }`: mints test USDCx to the signed-in party |
| `GET /healthz` | — | `{ ok: true }` |
