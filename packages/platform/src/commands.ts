// Deterministic, logged command submission (spec 19.3, NFR-4).
//
// Every command carries a caller-chosen deterministic ID. A command that already succeeded
// is never resubmitted: its stored result is returned. A command is complete only when the
// ledger has returned its transaction.

import { createdEvents, exerciseResult, LedgerError, type LedgerClient, type Submission, type Transaction } from "@summertime/ledger";
import type { Db } from "./db.ts";
import type { Logger } from "pino";

export interface CommandOutcome<T = unknown> {
  commandId: string;
  updateId: string;
  result: T;
  created: { templateId: string; contractId: string }[];
  replayed: boolean;
}

export class CommandRunner {
  constructor(
    private readonly ledger: LedgerClient,
    private readonly db: Db,
    private readonly log?: Logger,
  ) {}

  async previous<T>(commandId: string): Promise<CommandOutcome<T> | undefined> {
    const r = await this.db.query<{ update_id: string; result: { result: T; created: CommandOutcome["created"] } }>(
      "SELECT update_id, result FROM command_log WHERE command_id = $1 AND status = 'succeeded'",
      [commandId],
    );
    const row = r.rows[0];
    if (!row) return undefined;
    return { commandId, updateId: row.update_id, result: row.result.result, created: row.result.created, replayed: true };
  }

  async run<T = unknown>(kind: string, submission: Submission, subject?: string): Promise<CommandOutcome<T>> {
    const prior = await this.previous<T>(submission.commandId);
    if (prior) return prior;
    const party = submission.actAs[0] ?? "";
    await this.db.query(
      `INSERT INTO command_log (command_id, party_id, kind, subject, status) VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (command_id) DO UPDATE SET status = 'pending', updated_at = now(), error = NULL`,
      [submission.commandId, party, kind, subject ?? null],
    );
    let tx: Transaction;
    try {
      tx = await this.ledger.submit(submission);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.db.query("UPDATE command_log SET status = 'failed', error = $2, updated_at = now() WHERE command_id = $1", [
        submission.commandId,
        msg.slice(0, 4000),
      ]);
      this.log?.warn({ commandId: submission.commandId, kind, err: msg.slice(0, 500) }, "command failed");
      throw e;
    }
    let result: T;
    try {
      result = exerciseResult<T>(tx);
    } catch {
      result = undefined as T;
    }
    const created = createdEvents(tx).map((c) => ({ templateId: c.templateId, contractId: c.contractId }));
    await this.db.query(
      "UPDATE command_log SET status = 'succeeded', update_id = $2, result = $3, updated_at = now() WHERE command_id = $1",
      [submission.commandId, tx.updateId, JSON.stringify({ result, created })],
    );
    this.log?.info({ commandId: submission.commandId, kind, updateId: tx.updateId }, "command succeeded");
    return { commandId: submission.commandId, updateId: tx.updateId, result, created, replayed: false };
  }
}

/** Canton rejections that mean "your request was wrong", as opposed to infrastructure errors. */
export function isBusinessRejection(e: unknown): boolean {
  if (!(e instanceof LedgerError)) return false;
  const text = JSON.stringify(e.body ?? "") + e.message;
  return /DAML_INTERPRETATION_ERROR|INTERPRETATION_|Summertime requirement failed|CONTRACT_NOT_FOUND|UNHANDLED_EXCEPTION|DAML_AUTHORIZATION_ERROR|FAILED_PRECONDITION|INVALID_ARGUMENT/.test(text);
}

/** Extract the human-readable Summertime requirement from a ledger rejection, if any. */
export function rejectionReason(e: unknown): string | undefined {
  const text = e instanceof LedgerError ? JSON.stringify(e.body ?? "") + " " + e.message : String(e);
  const m = /Summertime requirement failed: ([^"\\]+)/.exec(text);
  if (m) return m[1]!.trim();
  if (/CONTRACT_NOT_FOUND|could not be found|ContractNotFound|CONTRACT_NOT_ACTIVE/i.test(text)) return "contract no longer active";
  return undefined;
}
