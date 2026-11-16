# Summertime web app

Next.js (App Router, TypeScript, Tailwind CSS) front end for Summertime. All ledger-backed data comes from `summertime-api` through the `/api/*` proxy; the browser never talks to the Ledger API (spec section 21).

## Run

```sh
# from the repository root, with summertime-api running on :7580
npm run dev -w web            # http://localhost:3000
npm run build -w web && npm run start -w web
npm run typecheck -w web
```

| Variable | Default | Notes |
| --- | --- | --- |
| `API_URL` | `http://localhost:7580` | Target of the `/api/:path*` rewrite. Rewrites are resolved at **build** time, so set it before `next build`. |

## Pages

| Route | Who | What |
| --- | --- | --- |
| `/` | Public | Landing: problem, how it works, the privacy promise, trust model, why Canton |
| `/privacy` | Public | Full trust model, including bond custody and pilot-mode custody |
| `/login` | Public | Demo account picker (`GET /auth/demo-accounts`) |
| `/forwarder` | Forwarder | Campaign list with status and committed-vs-threshold bars |
| `/forwarder/new` | Forwarder | Campaign wizard with timing presets and live bond % → bond transfer step |
| `/forwarder/campaigns/[id]` | Forwarder | Terms, bond, capacity bar, every reservation, invitations, settle / fail / cancel, outcome update ID, CSV export |
| `/importer` | Importer | Balance and test faucet, invitations, positions |
| `/importer/invitations/[cid]` | Importer | CBM slider with live USDCx (R × r), reserve or decline |
| `/importer/campaigns/[campaignId]` | Importer | Position by stage: review and sign, withdraw, claim, release; progress; receipts |
| `/history` | Forwarder, importer | Receipts with update IDs |
| `/explorer` | Any (demo) | Side-by-side ledger views of forwarder, two importers and the operator |

## Conventions

- **Units:** amounts always show both units ("4.000 CBM · 600.00 USDCx"). Capacities are formatted from `milliCbm` with `cbm()`, and money from the API's `Amount.display`.
- **Confirmation:** every irreversible action (sign/commit, settle, fail, cancel, claim, withdraw, release, bond) opens a `ConfirmSheet` that restates the amount, the deadline and what happens on failure. Signing screens show the pilot custody notice; personal importer screens show "Only you, your forwarder and Summertime can see this."
- **Idempotency:** every `POST` carries an `Idempotency-Key`. `useAction` creates a fresh key per confirmed action and reuses it only when retrying after a network failure.
- **Live updates:** TanStack Query polls live pages every 3–5 s, so countersignatures, the bond lock and payouts made by the worker appear without reloading.
- **Errors:** API error codes map to plain sentences in `lib/api.ts`.
- **Design:** neutral slate palette, one accent (`#b45309`), no gradients, Inter with a system fallback (no external font fetch), tabular numerals; usable at 360 px.
