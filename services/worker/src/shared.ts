import {
  I,
  T,
  RegistryClient,
  fromTokenDecimal,
  type ActiveContract,
  type HoldingView,
  type LedgerClient,
  type TemplateName,
  type TransferInstructionView,
} from "@summertime/ledger";
import { CommandRunner, isBusinessRejection, rejectionReason, type Config, type Db, type Deployment, type Logger } from "@summertime/platform";

export interface WorkerContext {
  config: Config;
  db: Db;
  ledger: LedgerClient;
  registry: RegistryClient;
  commands: CommandRunner;
  log: Logger;
  deployment: Deployment;
  now: () => Date;
}

export async function acs<P>(w: WorkerContext, party: string, template: TemplateName): Promise<ActiveContract<P>[]> {
  return w.ledger.activeContracts<P>([party], { templates: [T[template]] });
}

export async function incomingTransfers(w: WorkerContext, party: string): Promise<ActiveContract<unknown>[]> {
  const all = await w.ledger.activeContracts<unknown>([party], { interfaces: [I.TransferInstruction] });
  return all.filter((c) => (c.interfaceView as TransferInstructionView | undefined)?.transfer.receiver === party);
}

export async function unlockedHoldings(w: WorkerContext, party: string): Promise<{ cid: string; micro: bigint }[]> {
  const hs = await w.ledger.activeContracts<unknown>([party], { interfaces: [I.Holding] });
  const out: { cid: string; micro: bigint }[] = [];
  for (const h of hs) {
    const v = h.interfaceView as HoldingView | undefined;
    if (!v || v.owner !== party || v.lock) continue;
    if (v.instrumentId.admin !== w.deployment.instrument.admin || v.instrumentId.id !== w.deployment.instrument.id) continue;
    out.push({ cid: h.contractId, micro: fromTokenDecimal(v.amount) });
  }
  return out;
}

export function pick(holdings: { cid: string; micro: bigint }[], needed: bigint): string[] | undefined {
  const sorted = [...holdings].sort((a, b) => (b.micro > a.micro ? 1 : b.micro < a.micro ? -1 : 0));
  const picked: string[] = [];
  let total = 0n;
  for (const h of sorted) {
    if (total >= needed) break;
    picked.push(h.cid);
    total += h.micro;
  }
  return total >= needed ? picked : undefined;
}

/**
 * Run one automation step. Business rejections (the ledger said no) are logged and skipped so
 * one bad item never blocks the rest; infrastructure errors propagate and end the pass.
 */
export async function step(w: WorkerContext, what: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e) {
    if (isBusinessRejection(e)) {
      w.log.warn({ step: what, reason: rejectionReason(e) ?? (e as Error).message.slice(0, 300) }, "automation step rejected");
      return false;
    }
    throw e;
  }
}

export const userFor = (handle: string) => `u-${handle}`;
