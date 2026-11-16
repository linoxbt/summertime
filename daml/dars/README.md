# Vendored Splice token-standard DARs

These DARs are copied unchanged from [hyperledger-labs/splice](https://github.com/hyperledger-labs/splice) at commit `8dbfff2530e0b16da291ee112f794af3c189b0f2` (`daml/dars/`). They are licensed under Apache-2.0; see `LICENSE-splice`. `SHA256SUMS` records the hashes of the copies.

| DAR | Used by | Why |
| --- | --- | --- |
| `splice-api-token-metadata-v1-1.0.0` | core | `Metadata`, `ExtraArgs`, `ChoiceExecutionMetadata` |
| `splice-api-token-holding-v1-1.0.0` | core | `Holding`, `InstrumentId` |
| `splice-api-token-allocation-v1-1.0.0` | core | `Allocation`, `SettlementInfo`, `TransferLeg` |
| `splice-api-token-allocation-request-v1-1.0.0` | core | `SummertimeAllocationRequest` implements `AllocationRequest` |
| `splice-api-token-transfer-instruction-v1-1.0.0` | core | `TransferFactory` for bonus payouts and bond return |
| `splice-api-token-allocation-instruction-v1-1.0.0` | test | `AllocationFactory_Allocate` |
| `splice-test-token-v1-1.0.2` | test | Reference token implementing the V1 interfaces |

`summertime-core` depends only on the interface DARs, never on a token implementation (specification section 12). Splice also publishes V2 token-standard interfaces; Summertime targets V1, which is what the specification and USDCx integration documents describe. Re-check this when pinning versions for DevNet.
