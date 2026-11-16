// Typed client for the Canton JSON Ledger API v2 (Canton 3.7).
// Request shapes follow the participant's own OpenAPI document (/docs/openapi).

export interface CreatedEvent<T = unknown> {
  offset: number;
  nodeId: number;
  contractId: string;
  templateId: string;
  createArgument: T;
  createdEventBlob?: string;
  interfaceViews?: { interfaceId: string; viewValue?: unknown; viewStatus?: unknown }[];
  witnessParties: string[];
  signatories: string[];
  observers?: string[];
  createdAt: string;
  packageName: string;
}

export interface ArchivedEvent {
  offset: number;
  nodeId: number;
  contractId: string;
  templateId: string;
  witnessParties: string[];
}

export interface ExercisedEvent {
  offset: number;
  nodeId: number;
  contractId: string;
  templateId: string;
  interfaceId?: string;
  choice: string;
  choiceArgument: unknown;
  actingParties: string[];
  consuming: boolean;
  witnessParties: string[];
  lastDescendantNodeId: number;
  exerciseResult?: unknown;
}

export type LedgerEvent =
  | { CreatedEvent: CreatedEvent }
  | { ArchivedEvent: ArchivedEvent }
  | { ExercisedEvent: ExercisedEvent };

export interface Transaction {
  updateId: string;
  commandId?: string;
  effectiveAt: string;
  offset: number;
  synchronizerId: string;
  recordTime: string;
  events: LedgerEvent[];
}

export interface DisclosedContract {
  templateId?: string;
  contractId?: string;
  createdEventBlob: string;
  synchronizerId?: string;
}

export type Command =
  | { CreateCommand: { templateId: string; createArguments: unknown } }
  | { ExerciseCommand: { templateId: string; contractId: string; choice: string; choiceArgument: unknown } };

export interface Submission {
  commandId: string;
  actAs: string[];
  readAs?: string[];
  commands: Command[];
  disclosedContracts?: DisclosedContract[];
  userId?: string;
}

export interface ActiveContract<T = unknown> {
  contractId: string;
  templateId: string;
  payload: T;
  signatories: string[];
  observers: string[];
  createdAt: string;
  offset: number;
  createdEventBlob?: string;
  synchronizerId: string;
  interfaceView?: unknown;
}

export class LedgerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "LedgerError";
  }
}

export interface LedgerClientOptions {
  baseUrl: string;
  /** Returns a bearer token for the Ledger API user, or undefined when auth is disabled. */
  token?: () => Promise<string | undefined>;
  userId?: string;
}

export class LedgerClient {
  constructor(private readonly opts: LedgerClientOptions) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const token = await this.opts.token?.();
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(new URL(path, this.opts.baseUrl), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const code = extractErrorCode(json);
      const cause = (json as { cause?: string } | undefined)?.cause;
      throw new LedgerError(`${method} ${path} failed (${res.status}): ${cause ?? text.slice(0, 500)}`, res.status, code, json);
    }
    return json as T;
  }

  version(): Promise<{ version: string }> {
    return this.request("GET", "/v2/version");
  }

  async ledgerEnd(): Promise<number> {
    const r = await this.request<{ offset: number }>("GET", "/v2/state/ledger-end");
    return r.offset;
  }

  async listParties(): Promise<string[]> {
    const r = await this.request<{ partyDetails: { party: string }[] }>("GET", "/v2/parties");
    return r.partyDetails.map((p) => p.party);
  }

  async allocateParty(hint: string): Promise<string> {
    const r = await this.request<{ partyDetails: { party: string } }>("POST", "/v2/parties", {
      partyIdHint: hint,
      identityProviderId: "",
    });
    return r.partyDetails.party;
  }

  async createUser(userId: string, primaryParty: string, actAs: string[], readAs: string[] = []): Promise<void> {
    const rights = [
      ...actAs.map((party) => ({ kind: { CanActAs: { value: { party } } } })),
      ...readAs.map((party) => ({ kind: { CanReadAs: { value: { party } } } })),
    ];
    try {
      await this.request("POST", "/v2/users", {
        user: { id: userId, primaryParty, isDeactivated: false, identityProviderId: "" },
        rights,
      });
    } catch (e) {
      if (e instanceof LedgerError && (e.status === 409 || e.code === "USER_ALREADY_EXISTS")) return;
      throw e;
    }
  }

  /** Submit and wait, returning the transaction with ledger effects (exercise results included). */
  async submit(s: Submission): Promise<Transaction> {
    const parties = [...new Set([...s.actAs, ...(s.readAs ?? [])])];
    const r = await this.request<{ transaction: Transaction }>("POST", "/v2/commands/submit-and-wait-for-transaction", {
      commands: {
        commands: s.commands,
        commandId: s.commandId,
        actAs: s.actAs,
        readAs: s.readAs ?? [],
        userId: s.userId ?? this.opts.userId ?? "summertime",
        disclosedContracts: s.disclosedContracts ?? [],
      },
      transactionFormat: {
        transactionShape: "TRANSACTION_SHAPE_LEDGER_EFFECTS",
        eventFormat: {
          filtersByParty: Object.fromEntries(parties.map((p) => [p, { cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }] }])),
          verbose: true,
        },
      },
    });
    return r.transaction;
  }

  /**
   * Active contracts visible to the given parties, filtered by template or interface IDs.
   * Reads are always made as specific parties: callers never see more than those parties can.
   */
  async activeContracts<T = unknown>(
    parties: string[],
    ids: { templates?: string[]; interfaces?: string[] },
    options: { includeBlob?: boolean } = {},
  ): Promise<ActiveContract<T>[]> {
    const offset = await this.ledgerEnd();
    if (offset === 0) return [];
    const cumulative = [
      ...(ids.templates ?? []).map((templateId) => ({
        identifierFilter: { TemplateFilter: { value: { templateId, includeCreatedEventBlob: options.includeBlob ?? false } } },
      })),
      ...(ids.interfaces ?? []).map((interfaceId) => ({
        identifierFilter: {
          InterfaceFilter: { value: { interfaceId, includeInterfaceView: true, includeCreatedEventBlob: options.includeBlob ?? false } },
        },
      })),
    ];
    const r = await this.request<{ contractEntry?: { JsActiveContract?: { createdEvent: CreatedEvent<T>; synchronizerId: string } } }[]>(
      "POST",
      "/v2/state/active-contracts",
      {
        activeAtOffset: offset,
        eventFormat: {
          filtersByParty: Object.fromEntries(parties.map((p) => [p, { cumulative }])),
          verbose: true,
        },
      },
    );
    const seen = new Set<string>();
    const out: ActiveContract<T>[] = [];
    for (const entry of r) {
      const ac = entry.contractEntry?.JsActiveContract;
      if (!ac || seen.has(ac.createdEvent.contractId)) continue;
      seen.add(ac.createdEvent.contractId);
      const ev = ac.createdEvent;
      out.push({
        contractId: ev.contractId,
        templateId: ev.templateId,
        payload: ev.createArgument,
        signatories: ev.signatories,
        observers: ev.observers ?? [],
        createdAt: ev.createdAt,
        offset: ev.offset,
        createdEventBlob: ev.createdEventBlob,
        synchronizerId: ac.synchronizerId,
        interfaceView: ev.interfaceViews?.[0]?.viewValue,
      });
    }
    return out;
  }

  /** Transactions after an offset, as seen by the given parties (ACS-delta shape). */
  async updatesPage(parties: string[], beginExclusive: number, endInclusive: number): Promise<Transaction[]> {
    if (endInclusive <= beginExclusive) return [];
    const r = await this.request<{ update: { Transaction?: { value: Transaction } } }[]>("POST", "/v2/updates", {
      beginExclusive,
      endInclusive,
      updateFormat: {
        includeTransactions: {
          transactionShape: "TRANSACTION_SHAPE_ACS_DELTA",
          eventFormat: {
            filtersByParty: Object.fromEntries(parties.map((p) => [p, { cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }] }])),
            verbose: true,
          },
        },
      },
    });
    return r.flatMap((u) => (u.update?.Transaction ? [u.update.Transaction.value] : []));
  }

  async uploadDar(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    const headers: Record<string, string> = { "content-type": "application/octet-stream" };
    const token = await this.opts.token?.();
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(new URL("/v2/packages", this.opts.baseUrl), { method: "POST", headers, body: bytes });
    if (!res.ok) throw new LedgerError(`DAR upload failed: ${await res.text()}`, res.status, undefined, undefined);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorCode(json: unknown): string | undefined {
  if (json && typeof json === "object" && "code" in json && typeof (json as { code: unknown }).code === "string") {
    return (json as { code: string }).code;
  }
  return undefined;
}

/** All created events in a transaction, in order. */
export function createdEvents(tx: Transaction): CreatedEvent[] {
  return tx.events.flatMap((e) => ("CreatedEvent" in e ? [e.CreatedEvent] : []));
}

/** The root exercise's result in a ledger-effects transaction. */
export function exerciseResult<T = unknown>(tx: Transaction): T {
  const ex = tx.events.find((e) => "ExercisedEvent" in e) as { ExercisedEvent: ExercisedEvent } | undefined;
  if (!ex) throw new Error("Transaction has no exercised event");
  return ex.ExercisedEvent.exerciseResult as T;
}
