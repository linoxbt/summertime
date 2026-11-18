# AppsFactory Accelerator, Cohort 2: Summertime application

Everything needed for the application form, in the form's order. Text in the answer boxes is ready to paste.

| Document | Where | Use |
| --- | --- | --- |
| Live app (test network) | https://summertime-app.netlify.app | "Website Link"; shared demo accounts at `/demo` |
| Pitch deck (13 slides) | [`Summertime_Pitch_Deck.pdf`](Summertime_Pitch_Deck.pdf) | Required "Pitch Deck Link" |
| Executive summary (1 page) | [`Summertime_Executive_Summary.pdf`](Summertime_Executive_Summary.pdf) | Investor and mentor follow-ups |
| Build specification (v1.2, 53 pages) | [`../docs/Summertime_Build_Specification.pdf`](../docs/Summertime_Build_Specification.pdf) | Technical due diligence |
| Contracts and tests | [`../daml/`](../daml/), [`../tests/`](../tests/) | Proof the core works |

Sources for the PDFs are in [`src/`](src/). Rebuild from the repository root:

```sh
node application/src/render.js application/src/deck.html application/Summertime_Pitch_Deck.pdf deck
node application/src/render.js application/src/summary.html application/Summertime_Executive_Summary.pdf a4
```

Each run prints `overflow: []` when every page fits.

---

## Page: Background

### Company / Project Name *

```
Summertime
```

### What stage is your business at? *

Choose the option closest to **MVP / prototype**, not "Launched / Early traction".

Why: the MVP is live and works end to end, but on a test network with test USDCx. There are no real users or revenue yet. Reviewers will open the app and the repository, so the honest stage is also the credible one.

### Who is involved in your team? *

```
Solo founder: product, Daml smart contracts, backend, web app and customer development. I wrote the build specification, reviewed it for security flaws, then built and shipped the MVP myself. It is live on a test network at summertime-app.netlify.app, and the code is public at github.com/linoxbt/summertime. I will hire after the first pilot, starting where it shows the biggest gap.
```

If you want, start with your name: "[Your name], solo founder: …".

### What do you need the most help with? *

Keep **Fundraising**, **Go-to-market strategy** and **Technical architecture** checked. Leave **Team building** unchecked unless hiring is a near-term priority.

---

## Page: Links and fit

### Pitch Deck Link *

```
https://github.com/linoxbt/summertime/blob/main/application/Summertime_Pitch_Deck.pdf
```

### Website Link

```
https://summertime-app.netlify.app
```

A test network with test USDCx, not real funds. Sign in by email code to create a real account, or open `/demo` for shared demo accounts with seeded data and the privacy explorer.

### Why should we choose your team? *

```
Summertime fixes a real coordination problem with exactly what Canton was built for. And it already works.

Small importers on the China–Lagos route share containers. Each pays the consolidator upfront and hopes the container fills. Competitors learn each other's volumes along the way.

With Summertime, importers reserve space privately and lock USDCx in their own allocation. If the container fills, everyone pays in one atomic transaction. If it doesn't, everyone gets their money back plus a share of the forwarder's bond. That needs sub-transaction privacy, atomic multi-party settlement and token-standard allocations together. Only Canton has all three.

The MVP is live at summertime-app.netlify.app, on our own Canton 3.7.1 ledger with test USDCx. Real accounts sign in by email. Forwarders open containers, importers reserve and lock funds, and settlement or refunds run on-ledger. Bookings, disputes and operator reconciliation work too.

It is tested, not just demoed. 21 Daml tests cover settlement, exact bonuses and adversarial cases. A separate test runs a campaign across three Canton participants and proves no importer receives another's data. End-to-end and accessibility tests run in CI, and CI passes.

We are honest about where we are: solo founder, test network, no users or revenue yet. Next: a DevNet participant, a first real forwarder, and one metric, containers filled per week. That is where I want AppsFactory's help: fundraising, go-to-market and technical architecture.
```

(About 225 words. If you have a personal connection to Lagos importers or forwarders, add one sentence about it. Founder–market fit is the strongest thing you can add.)

### Have you participated in HackCanton before? *

Answer truthfully; only you know this. For context, the specification notes that HackCanton Season 4 registration was listed as closing on 12 November 2026.

---

## Before you press Submit

- [ ] Stage set to the MVP / prototype option.
- [ ] Pitch deck link and live app both open in a private window without signing in.
- [ ] Optional: your name added to the team answer.
- [ ] Optional: a sentence on your connection to the market.
- [ ] HackCanton question answered.
- [ ] Turn on "Send me a copy of my responses" so you keep a record.

## Claims in these materials, and where they are verified

| Claim | Evidence |
| --- | --- |
| MVP live on a test network: web on Netlify, backend on Railway with our own single-node Canton 3.7.1 ledger (persistent on Postgres), test USDCx and a dev token registry | https://summertime-app.netlify.app; `docs/deployment.md`; `deploy/backend` |
| Real accounts by email code (Privy), with a role and company name; separate demo accounts | `web/components/privy-login.tsx`, `web/app/signup/page.tsx`; `/demo` on the live app |
| 19 Daml templates on SDK 3.7.1 | `daml/summertime-core`, `daml/summertime-core/daml.yaml` |
| 21 Daml Script tests passing | `daml/summertime-test`; run `dpm test` (it reports 23 scripts: the 21 tests, plus the multi-participant scenario and a setup helper run on one ledger) |
| Six importers settle atomically; failed campaign pays 51.85 / 44.44 / 40.74 / 33.33 / 29.63 USDCx | `Summertime.Test.Lifecycle` |
| Forwarder cannot settle alone, overbook or avoid the bond | `Summertime.Test.Guards` |
| Importers cannot see each other's contracts (ledger views) | `Summertime.Test.Guards.test_importersCannotSeeEachOther` |
| Privacy holds across three separate Canton participants | `tests/multi-participant/run.sh`, `Summertime.Test.MultiParticipant`; CI job "Privacy across participants" |
| Bookings and disputes after settlement | `Summertime.Test.Aftercare`; `tests/e2e/ui.e2e.mjs` |
| API, browser and accessibility end-to-end tests; CI passing | `tests/e2e`; `.github/workflows/ci.yml`; GitHub Actions runs on `main` |
| Four critical flaws found and fixed in review | `docs/Summertime_Build_Specification.md`, "Changes in Version 1.1" |
| No DevNet participant, users or revenue yet | Stated in the deck (slide 8), the summary and the answers above |
