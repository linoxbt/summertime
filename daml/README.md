# Summertime Daml packages

| Package | Contents |
| --- | --- |
| `summertime-core` | All contracts from specification section 13, including booking confirmations and disputes. Depends only on the Splice token-standard V1 interfaces. |
| `summertime-test` | Daml Script tests against Splice's reference `TestTokenV1`, which implements the same V1 interfaces as USDCx and Canton Coin. |

## Build and test

Install `dpm` (SDK 3.7.1) from <https://get.digitalasset.com>, then:

```sh
cd daml
dpm build --all
cd summertime-test && dpm test
```

## Modules (`summertime-core`)

| Module | Templates |
| --- | --- |
| `Summertime.Types` | `CampaignTerms`, validation, integer arithmetic, `toTokenDecimal` |
| `Summertime.Bonus` | Failure-bonus split (section 17.2) |
| `Summertime.Capacity` | `CapacityHold`, `CapacityRelease` |
| `Summertime.Records` | `CampaignOutcome`, `Receipt` (with booking and dispute choices), `ProgressView`, `BookingConfirmation`, `DisputeRecord`, `DisputeResolution` |
| `Summertime.Settlement` | `Commitment`, `BondTicket`, `BonusEntitlement`, `BonusPayout` |
| `Summertime.Reservation` | `Invitation`, `ReservationRequest`, `CapacityReservation`, `SummertimeAllocationRequest` |
| `Summertime.Campaign` | `CampaignProposal`, `Campaign`, `OrganizerBond` |

## Test coverage (22 scripts)

- **Lifecycle:** six importers settle atomically (60 CBM, 9,000 USDCx); settlement after the bond lock with bond return; failed campaign where every importer is paid the exact bonuses of section 17.6; an importer excluded from a successful settlement claims its bonus; withdrawal before lock; reservation expiry.
- **Authorization:** the forwarder alone (or the operator alone) cannot settle a commitment; the forwarder cannot forge a campaign, bond, capacity hold or capacity release, or run the bond lock; nobody but the right parties can mint or void bonus records.
- **Adversarial:** seven allocation mismatches rejected at commit, including an early `settleBefore`; capacity cannot be overbooked; threshold, duplicate, swapped-ticket and deadline guards on settlement; time guards; late registry withdrawal forfeits the bonus; lock guards.
- **Privacy (ledger views):** importers cannot see each other's contracts or the campaign; per-importer progress views; the operator is not a stakeholder of reservations or commitments. Transaction-tree projection tests need separate participants and run on LocalNet (specification 26.2).
- **Arithmetic:** bonus split, cap, equal split, conservation, token-decimal conversion.
- **Aftercare (F-10):** bookings only after settlement, acknowledgement and amendment, disputes with a SHA-256 evidence hash, resolution held by both parties, invisibility to other importers.

## Not yet covered

- Real registry behaviour (USDCx or Canton Coin): choice context, disclosed contracts, expiry. The reference token keeps allocations fetchable and withdrawable after `settleBefore`; the real registries still need checking (open question 1).
- Backend, worker and UI.
