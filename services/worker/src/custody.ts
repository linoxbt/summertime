// Pilot-mode custody: Summertime hosts pilot parties and accepts incoming token transfers
// on their behalf (bonus payouts to importers, bond returns and refunds to forwarders).
// In wallet mode the party's own wallet does this instead. Disclosed on every signing screen.

import { I, extraArgsFrom } from "@summertime/ledger";
import { incomingTransfers, step, userFor, type WorkerContext } from "./shared.ts";

export async function custodyPass(w: WorkerContext, parties: { party: string; handle: string }[]): Promise<void> {
  for (const p of parties) {
    for (const t of await incomingTransfers(w, p.party)) {
      await step(w, `accept transfer ${t.contractId}`, async () => {
        const context = await w.registry.transferInstructionContext(t.contractId, "accept");
        await w.commands.run("custody.accept-transfer", {
          commandId: `accept-transfer:${t.contractId}`,
          actAs: [p.party],
          userId: userFor(p.handle),
          commands: [{ ExerciseCommand: { templateId: I.TransferInstruction, contractId: t.contractId, choice: "TransferInstruction_Accept", choiceArgument: { extraArgs: extraArgsFrom(context.choiceContextData) } } }],
          disclosedContracts: context.disclosedContracts,
        });
      });
    }
  }
}
