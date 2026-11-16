// Client for a CIP-56 token registry's off-ledger API (Splice token-standard V1 OpenAPI specs).
// The same client talks to the local development registry and to a real registry such as
// the USDCx Registry Utility on DevNet; only the base URL changes.

import type { DisclosedContract } from "./json-api.ts";

export interface RegistryChoiceContext {
  choiceContextData: unknown;
  disclosedContracts: Required<Pick<DisclosedContract, "templateId" | "contractId" | "createdEventBlob" | "synchronizerId">>[];
}

export interface FactoryWithChoiceContext {
  factoryId: string;
  choiceContext: RegistryChoiceContext;
  transferKind?: "offer" | "direct" | "self";
}

export interface RegistryInfo {
  adminId: string;
  supportedApis: Record<string, number>;
}

export interface Instrument {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply?: string;
}

export class RegistryError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RegistryError";
  }
}

export class RegistryClient {
  constructor(private readonly baseUrl: string) {}

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetch(new URL(path, this.baseUrl), {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new RegistryError(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`, res.status);
    return JSON.parse(text) as T;
  }

  info(): Promise<RegistryInfo> {
    return this.call("GET", "/registry/metadata/v1/info");
  }

  instrument(id: string): Promise<Instrument> {
    return this.call("GET", `/registry/metadata/v1/instruments/${encodeURIComponent(id)}`);
  }

  /** Factory, context and disclosures for AllocationFactory_Allocate. */
  allocationFactory(choiceArguments: unknown): Promise<FactoryWithChoiceContext> {
    return this.call("POST", "/registry/allocation-instruction/v1/allocation-factory", { choiceArguments, excludeDebugFields: true });
  }

  /** Factory, context and disclosures for TransferFactory_Transfer. */
  transferFactory(choiceArguments: unknown): Promise<FactoryWithChoiceContext> {
    return this.call("POST", "/registry/transfer-instruction/v1/transfer-factory", { choiceArguments, excludeDebugFields: true });
  }

  allocationContext(allocationId: string, choice: "execute-transfer" | "withdraw" | "cancel"): Promise<RegistryChoiceContext> {
    return this.call("POST", `/registry/allocations/v1/${encodeURIComponent(allocationId)}/choice-contexts/${choice}`, {
      meta: {},
      excludeDebugFields: true,
    });
  }

  transferInstructionContext(instructionId: string, choice: "accept" | "reject" | "withdraw"): Promise<RegistryChoiceContext> {
    return this.call("POST", `/registry/transfer-instruction/v1/${encodeURIComponent(instructionId)}/choice-contexts/${choice}`, {
      meta: {},
      excludeDebugFields: true,
    });
  }
}
