# summertime-api reference

Base URL: `http://localhost:7580` in development. The web app proxies `/api/*` to it, so browsers call `/api/...` on the web origin and the session cookie stays first-party.

## Conventions

- **Responses:** `{ "data": … }` on success; `{ "error": { "code": "…", "message": "…" } }` on failure, with an HTTP status of 400 (validation), 401 (no session), 403 (wrong role or not a stakeholder), 404, 409 (state conflict, e.g. `LOCKED`), 422 (ledger rejected the action) or 502 (ledger or registry unavailable).
- **Amounts:** integer sub-unit strings plus a display string without the unit: `Amount = { micro, display }` (micro-USDCx, e.g. `"2,100.00"`), `Capacity = { milliCbm, display }` (milli-CBM, e.g. `"14.000"`). Types are in `packages/ledger/src/api-types.ts`.
- **Mutations:** every `POST` requires an `Idempotency-Key` header (any unique string, e.g. a UUID). Repeating a request with the same key returns the stored response; reusing a key with a different body returns `409 IDEMPOTENCY_KEY_REUSED`.
- **Authorization:** a session maps to exactly one party. Every read is made as that party on the ledger, so knowing an ID never grants access (spec section 20).
- **Session:** cookie `st_session` (HttpOnly, SameSite=Lax).

## Authentication

Real accounts (`kind: "member"`) use email and password. Demo accounts (`kind: "demo"`) are seeded,
have no password, and are entered only through the demo endpoints (demo mode only). Demo and real
accounts never mix: importer lists, invitations and the privacy explorer stay within one kind.

| Method and path | Body | Returns |
| --- | --- | --- |
| `POST /auth/signup` | `{ email, password, displayName, role: "importer" \| "forwarder" }` | 201 `SessionUser`; sets cookie. Creates a ledger party and user of its own. Errors: `WEAK_PASSWORD` (under 10 characters, equal to the email, one repeated character), `EMAIL_TAKEN` |
| `POST /auth/login` | `{ email, password }` | `SessionUser`; sets a fresh session cookie. `INVALID_CREDENTIALS` for any wrong combination (same answer and timing whether or not the email exists); `TOO_MANY_ATTEMPTS` after 8 failures for an email (or 200 from one address) in 15 minutes |
| `POST /auth/password/forgot` | `{ email }` | `{ sent: true }` whether or not the account exists; emails a 6-digit code (15 min, 5 attempts, 3 per 15 min). `EMAIL_UNAVAILABLE` in production without an email provider |
| `POST /auth/password/reset` | `{ email, code, password }` | `SessionUser`; sets cookie; signs out every other session. Errors: `INVALID_CODE`, `CODE_EXPIRED`, `TOO_MANY_ATTEMPTS`, `WEAK_PASSWORD` |
| `POST /auth/password/change` | `{ currentPassword, newPassword }` | `{ ok: true }`; signs out every other session. `WRONG_PASSWORD`, `WEAK_PASSWORD`; demo accounts get 403 |
| `POST /auth/privy` | `{ accessToken, identityToken?, profile?: { displayName, role } }` | Sign in with Privy. Tokens are verified (ES256, issuer `privy.io`, audience = the app ID, `PRIVY_VERIFICATION_KEY`); the email comes from the identity token (or Privy's REST API with `PRIVY_APP_SECRET`). Finds the account by Privy user, else links a member account with the same email, else answers 409 `PROFILE_REQUIRED` until `profile` is sent, then creates one (201). Errors: `PRIVY_TOKEN_INVALID` (401), `EMAIL_TAKEN` (demo email or another Privy user), `PRIVY_UNAVAILABLE` |
| `POST /auth/logout` | — | `{ ok: true }` |
| `GET /auth/me` | — | `SessionUser` (`kind`, `email` included) or 401 |
| `GET /auth/demo-accounts` | — | demo accounts only `{ handle, displayName, role, email }[]` (demo mode) |
| `POST /auth/demo-login` | `{ handle }` | `SessionUser`; demo accounts only (demo mode) |

Passwords are hashed with scrypt (N=32768, r=8, p=1, 16-byte salt). Passwords and codes are never
logged or returned.

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
| `POST /campaigns/:id/bookings` | `{ bookingRef, etd: "YYYY-MM-DD", containerNo? }` | `{ issued }`: one `BookingConfirmation` per settled importer without one | `NOT_SETTLED` |
| `POST /bookings/:cid/amend` | `{ etd, containerNo? }` | `{ updateId }`; clears the importer's acknowledgement | `NOT_FOUND` |
| `POST /disputes/:cid/resolve` | `{ resolution }` | `{ updateId }`; creates a `DisputeResolution` both parties hold | `NOT_FOUND` |

`ForwarderCampaignDetail` includes `bookings: BookingDto[]` and `disputes: DisputeDto[]` (open and resolved).

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
| `POST /bookings/:cid/acknowledge` | — | `{ updateId }` | `ALREADY_ACKNOWLEDGED` |
| `POST /receipts/:cid/disputes` | `{ subject, details }` | `{ disputeCid, evidenceHash }` | `NOT_SETTLED` |
| `POST /disputes/:cid/withdraw` | — | `{ updateId }` | `NOT_FOUND` |

`PositionDto` includes `booking?: BookingDto`, `disputes: DisputeDto[]`, `ids.settledReceipt` and `actions.canDispute`. Dispute details stay in the application database; the ledger records their SHA-256 hash, and `DisputeDto.evidenceVerified` says whether the stored text still matches it.

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

## Operations

| Method and path | Caller | Returns |
| --- | --- | --- |
| `GET /readyz` | Anyone | `{ ready, database, ledger }`; HTTP 503 when not ready |
| `GET /ops/status` | Operator | Overall status, worker liveness and lag, every operational check (bond custody, overdue locks, unpaid payouts, settle reminders, failed settlements, registry latency, outcomes recorded), recent alerts, command counts |

The worker runs the checks once a minute and records alert episodes; worker liveness is judged by the API (a stopped worker cannot report itself; stale after 5 minutes).

## Development only

| Method and path | Body | Returns |
| --- | --- | --- |
| `POST /dev/faucet` | `{ amountUsdc }` | `{ updateId }`: mints test USDCx to the signed-in party |
| `GET /healthz` | — | `{ ok: true }` |
