# AppsFactory Accelerator, Cohort 2: Summertime application

Everything needed to complete the application form, in the form's order. Text in the answer boxes is ready to paste.

| Document | File | Use |
| --- | --- | --- |
| Pitch deck (13 slides) | [`Summertime_Pitch_Deck.pdf`](Summertime_Pitch_Deck.pdf) | Required "Pitch Deck Link" |
| Executive summary (1 page) | [`Summertime_Executive_Summary.pdf`](Summertime_Executive_Summary.pdf) | Investor and mentor follow-ups |
| Build specification (51 pages) | [`../docs/Summertime_Build_Specification.pdf`](../docs/Summertime_Build_Specification.pdf) | Technical due diligence |
| Contracts and tests | [`../daml/`](../daml/) | Proof of a working core |

Source files for the PDFs are in [`src/`](src/); `node src/render.js` rebuilds them.

---

## Page: Background

### Company / Project Name *

```
Summertime
```

### What stage is your business at? *

**Change this from "Launched / Early traction".** Summertime has tested core contracts and a full specification, but no live product, users or revenue yet. Choose the option closest to **prototype / MVP in development**. Reviewers will open the deck and repository; an accurate stage matches what they find and reads as more credible than an overclaim. AppsFactory's own programme starts with customer validation in weeks 1–2, which fits this stage.

### Who is involved in your team? *

```
Solo founder: product, Daml smart contracts, backend and customer development. I wrote the 51-page build specification, ran a security review of it, and built and tested the core Daml contracts myself (public at github.com/linoxbt/summertime). I will hire after the pilot, starting where the pilot shows the biggest gap.
```

If you want, start with your name: "[Your name], solo founder: …".

### What do you need the most help with? *

Keep **Fundraising**, **Go-to-market strategy** and **Technical architecture** checked. Leave **Team building** unchecked unless you want to signal hiring as a near-term priority.

---

## Page: Links and fit

### Pitch Deck Link *

```
https://github.com/linoxbt/summertime/blob/ccr-acc8b6e0-g1ar2d/application/Summertime_Pitch_Deck.pdf
```

The repository is public, so anyone with the link can view the PDF. **Before submitting, open the link in a private browser window to confirm it loads.** If you merge this branch into `main`, use the shorter, permanent link instead:

```
https://github.com/linoxbt/summertime/blob/main/application/Summertime_Pitch_Deck.pdf
```

### Website Link

```
https://github.com/linoxbt/summertime
```

There is no website or hosted demo yet; the repository holds the code, tests, specification and deck. This field is optional. Note that until the branch is merged, the repository's front page shows only the original README; link to `https://github.com/linoxbt/summertime/tree/ccr-acc8b6e0-g1ar2d` if you submit before merging.

### Why should we choose your team? *

```
Summertime solves a real coordination problem with the exact properties Canton was built for, and I have already proven I can build it.

The problem: small importers on the China–Lagos route share containers. Each pays the consolidator upfront and hopes the container fills, while competitors learn each other's volumes through the same consolidator. Summertime lets importers reserve space privately and lock USDCx in their own token-standard allocation. Money moves only if the container fills, in one atomic transaction; if it doesn't, everyone gets their funds back plus a share of the forwarder's failure bond. That needs sub-transaction privacy, atomic multi-party settlement and CIP-56 allocations together, which only Canton offers.

What sets us apart is rigour, not slides. I wrote a 51-page build specification, then reviewed it against the Daml authorization model and found four critical flaws, including one that would have let the forwarder take an importer's money without the container filling. I fixed them before writing code. The core contracts are now built on SDK 3.7.1 against the Canton token-standard interfaces, with 20 automated tests passing: six importers settle atomically, a failed campaign pays the exact bonuses, the forwarder cannot settle alone or overbook, and importers cannot see each other. Everything is public and verifiable.

We are honest about where we are: no users or revenue yet. The next step is the one AppsFactory is designed for: signing a first forwarder, running real campaigns on DevNet, and proving one growth metric, containers filled per week. I am asking for help with fundraising, go-to-market and technical architecture because those are exactly the gaps between tested contracts and a real business.
```

(About 300 words. If you have a personal connection to Lagos importers or forwarders, add one sentence about it after the second paragraph; founder–market fit is the strongest thing you can add.)

### Have you participated in HackCanton before? *

Answer truthfully; only you know this. For context, your specification notes that HackCanton Season 4 registration was listed as closing on 12 November 2026 and that late entry was still to be confirmed.

---

## Before you press Submit

- [ ] Stage changed to the prototype/MVP option.
- [ ] Pitch deck link opens in a private window without signing in.
- [ ] Optional: your name added to the team answer.
- [ ] Optional: a sentence on your connection to the market in "Why should we choose your team?".
- [ ] HackCanton question answered.
- [ ] Turn on "Send me a copy of my responses" so you keep a record.

## Claims in these materials, and where they are verified

| Claim | Evidence |
| --- | --- |
| 16 Daml templates on SDK 3.7.1 | `daml/summertime-core`, `daml/summertime-core/daml.yaml` |
| 20 automated tests passing | `daml/summertime-test`; run `dpm test` |
| Six importers settle atomically; failed campaign pays 51.85 / 44.44 / 40.74 / 33.33 / 29.63 USDCx | `Summertime.Test.Lifecycle` |
| Forwarder cannot settle alone, overbook or avoid the bond | `Summertime.Test.Guards` |
| Importers cannot see each other's contracts (ledger views) | `Summertime.Test.Guards.test_importersCannotSeeEachOther` |
| Four critical flaws found and fixed in review | `docs/Summertime_Build_Specification.md`, "Changes in Version 1.1" |
| No users, revenue or DevNet deployment yet | Stated in the deck (slide 8), the summary and the answers above |
