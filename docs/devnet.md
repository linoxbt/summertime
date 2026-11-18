# Moving to DevNet (and later TestNet and MainNet)

Summertime runs today on its own Canton test ledger with a test token. This page is the
checklist for running it on a participant on the Canton Network instead: self-hosted, or from
a node-as-a-service provider such as NODERS. The code is ready; what remains is access and
configuration.

Rehearsed locally by `tests/devnet-rehearsal/run.sh`: a participant that rejects calls
without a valid token, a mock OAuth server with 2-minute tokens, a provider-style service
user, and the full API and features tests on top.

## 1. What to get from the node provider

| Item | Why | Goes into |
| --- | --- | --- |
| JSON Ledger API URL (`…/v2/version` answers) | every ledger call | `LEDGER_URL` |
| OAuth token endpoint, client ID, client secret | client-credentials tokens for the Ledger API | `LEDGER_OAUTH_TOKEN_URL`, `LEDGER_OAUTH_CLIENT_ID`, `LEDGER_OAUTH_CLIENT_SECRET` (secret: set it in Railway, never in the repository) |
| Audience and/or scope the participant expects | some providers require them | `LEDGER_OAUTH_AUDIENCE`, `LEDGER_OAUTH_SCOPE` |
| The Ledger API user ID of that client (usually the token's `sub`) | commands are submitted as this user | `LEDGER_USER_ID` |
| That user has `participant_admin` (or is allowed to allocate parties, create rights and upload packages) | onboarding and sign-up allocate parties and grant rights | — |
| Whether egress-IP allowlisting is handled by them | the participant must reach the Super Validators | — |

## 2. The instrument

Pick one and get its values from an official source, never from a forum post or a guess.

| | USDCx | Canton Coin (fallback, spec section 16) |
| --- | --- | --- |
| `INSTRUMENT_ID` | from Circle / Digital Asset | `Amulet` |
| `INSTRUMENT_ADMIN` | the DevNet admin party, from Digital Asset (open dependency, spec section 16) | the DSO party of the network |
| `REGISTRY_URL` | the DA Registry Utility's token-standard API | the network's Scan (often proxied by your validator); confirm the base URL with the provider |
| `INSTRUMENT_SYMBOL`, `INSTRUMENT_DECIMALS` | `USDCx`, `6` | `CC`, `10` |

The registry must serve the standard CIP-56 off-ledger endpoints Summertime calls:
`/registry/metadata/v1/info`, `/registry/metadata/v1/instruments/{id}`,
`/registry/allocation-instruction/v1/allocation-factory`,
`/registry/transfer-instruction/v1/transfer-factory`,
`/registry/allocations/v1/{id}/choice-contexts/{execute-transfer|withdraw|cancel}` and
`/registry/transfer-instruction/v1/{id}/choice-contexts/{choice}`.

## 3. Railway settings for the backend

Use a **new** Postgres database for the DevNet deployment (onboarding refuses a database that
belongs to another network). Keep the current service for the demo; add a second service.

```
LEDGER_MODE=external
NETWORK=devnet
LEDGER_URL=…                    # from the provider
LEDGER_AUTH=oauth
LEDGER_OAUTH_TOKEN_URL=…
LEDGER_OAUTH_CLIENT_ID=…
LEDGER_OAUTH_CLIENT_SECRET=…    # secret
LEDGER_USER_ID=…
REGISTRY_URL=…
INSTRUMENT_ADMIN=…
INSTRUMENT_ID=…
INSTRUMENT_SYMBOL=…
INSTRUMENT_DECIMALS=…
DEMO_MODE=false
OPERATOR_EMAIL=…  OPERATOR_PASSWORD=…   # secret
DATABASE_URL, SESSION_SECRET, NODE_ENV=production, PRIVY_APP_ID   # as today
```

On start the container skips the local ledger and the test registry, runs
`services/api/src/onboard.ts` (uploads the package, allocates or adopts the operator party,
grants rights, records the deployment), then starts the worker and the API. The test faucet
is off on any network other than our own ledger, and the "Add test USDCx" button disappears.

Point a Netlify deploy (a branch deploy or a second site) at the new backend with `API_URL`.

## 4. First checks on DevNet

1. `GET /readyz` answers `ready`.
2. Sign up a forwarder and two importers; fund them with DevNet USDCx (or Canton Coin from
   the DevNet faucet in the provider's wallet).
3. Run one small campaign to settlement and one to failure; record the update IDs.
4. Answer the registry questions in spec section 41 (allocation expiry and claim behaviour).

## 5. TestNet and MainNet

Same steps with `NETWORK=testnet` or `mainnet`, after the Tokenomics Committee approval and
sponsor process. Before MainNet: a security audit, own-wallet mode (users hold their own keys),
legal advice on custody, and a Canton Coin budget for traffic fees.
