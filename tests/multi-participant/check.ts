// Spec 26.2: participant-level privacy. After successAcrossParticipants has run, read every
// transaction each participant received (for any party it hosts, full ledger effects) and
// check that no importer's participant ever received another importer's data.
//
// Usage: npx tsx tests/multi-participant/check.ts <script-output.json>   (see run.sh)

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const PARTICIPANTS = {
  summertime: "http://127.0.0.1:5013",
  "importer-a": "http://127.0.0.1:5023",
  "importer-b": "http://127.0.0.1:5033",
} as const;

interface Result {
  operator: string;
  forwarder: string;
  importerA: string;
  importerB: string;
  commitmentA: string;
  commitmentB: string;
  allocationA: string;
  allocationB: string;
  outcome: string;
}

async function post<T>(base: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} on ${base}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Every transaction the participant received, as raw JSON, for any party it hosts. */
async function received(base: string): Promise<string[]> {
  const end = ((await (await fetch(`${base}/v2/state/ledger-end`)).json()) as { offset: number }).offset;
  const updates = await post<{ update: { Transaction?: { value: unknown } } }[]>(base, "/v2/updates", {
    beginExclusive: 0,
    endInclusive: end,
    updateFormat: {
      includeTransactions: {
        transactionShape: "TRANSACTION_SHAPE_LEDGER_EFFECTS",
        eventFormat: {
          filtersForAnyParty: { cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }] },
          verbose: true,
        },
      },
    },
  });
  return updates.flatMap((u) => (u.update?.Transaction ? [JSON.stringify(u.update.Transaction.value)] : []));
}

const results: string[] = [];
const check = (name: string) => results.push(`✓ ${name}`);

async function main() {
  const r = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as Result;
  const seen = Object.fromEntries(await Promise.all(Object.entries(PARTICIPANTS).map(async ([name, base]) => [name, await received(base)] as const)));
  // Keep what each participant received, for inspection.
  for (const [name, txs] of Object.entries(seen)) writeFileSync(`${dirname(process.argv[2]!)}/mp-received-${name}.json`, `[${txs.join(",\n")}]`);
  const all = (name: keyof typeof PARTICIPANTS) => seen[name]!.join("\n");
  const mentions = (name: keyof typeof PARTICIPANTS, needle: string) => seen[name]!.filter((t) => t.includes(needle)).length;

  // Positive controls: each participant saw its own importer's legs, Summertime saw both.
  for (const id of [r.commitmentA, r.allocationA]) assert.ok(all("importer-a").includes(id), "importer A's participant saw its own contracts");
  for (const id of [r.commitmentB, r.allocationB]) assert.ok(all("importer-b").includes(id), "importer B's participant saw its own contracts");
  for (const id of [r.commitmentA, r.commitmentB, r.allocationA, r.allocationB]) assert.ok(all("summertime").includes(id), "Summertime saw every leg");
  check(`each participant received its own data (A: ${seen["importer-a"]!.length} transactions, B: ${seen["importer-b"]!.length}, Summertime: ${seen.summertime!.length})`);

  // The privacy property: nothing of one importer ever reaches the other importer's participant.
  assert.equal(mentions("importer-b", r.importerA), 0, "importer A's party ID reached importer B's participant");
  assert.equal(mentions("importer-a", r.importerB), 0, "importer B's party ID reached importer A's participant");
  for (const id of [r.commitmentA, r.allocationA]) assert.equal(mentions("importer-b", id), 0, `importer A's contract ${id.slice(0, 12)}… reached importer B's participant`);
  for (const id of [r.commitmentB, r.allocationB]) assert.equal(mentions("importer-a", id), 0, `importer B's contract ${id.slice(0, 12)}… reached importer A's participant`);
  check("no transaction delivered to an importer's participant mentions the other importer or their contracts");

  // Settlement is one atomic transaction. Each importer's participant receives that same
  // transaction (same update ID), projected to its own leg: Commitment_Settle, its own
  // allocation transfer and its receipt. Summertime's participant sees the whole tree,
  // Campaign_Execute with both legs.
  const updateId = (t: string) => (JSON.parse(t) as { updateId: string }).updateId;
  const settlement = (name: keyof typeof PARTICIPANTS, commitment: string) => {
    const txs = seen[name]!.filter((t) => t.includes(commitment) && t.includes(":Summertime.Records:Receipt") && t.includes("Commitment_Settle"));
    assert.equal(txs.length, 1, `exactly one settlement transaction at ${name}`);
    return txs[0]!;
  };
  const atA = settlement("importer-a", r.commitmentA);
  const atB = settlement("importer-b", r.commitmentB);
  assert.equal(updateId(atA), updateId(atB), "both importers received the same settlement transaction");
  const atSummertime = seen.summertime!.find((t) => updateId(t) === updateId(atA));
  assert.ok(atSummertime?.includes(r.commitmentA) && atSummertime.includes(r.commitmentB), "Summertime's view of it holds both legs");
  assert.ok(!atA.includes(r.commitmentB) && !atA.includes(r.importerB) && !atB.includes(r.commitmentA) && !atB.includes(r.importerA));
  // The campaign-wide step that spans every importer is not part of an importer's projection.
  assert.ok(atSummertime.includes("Campaign_Execute") && !atA.includes("Campaign_Execute") && !atB.includes("Campaign_Execute"));
  check(`one settlement transaction (${updateId(atA).slice(0, 16)}…) reached each importer as its own leg only; Summertime saw both`);

  console.log(results.join("\n"));
  console.log("MULTI-PARTICIPANT PRIVACY PASSED");
}

main().catch((e) => {
  console.log(results.join("\n"));
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
