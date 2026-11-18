// Ledger API authentication.
//
// Our own sandbox and the hosted test ledger run without auth. A participant on DevNet,
// TestNet or MainNet (self-hosted or node-as-a-service) requires a bearer token on every
// call, normally from an OAuth 2.0 identity provider with the client-credentials grant.
//
//   LEDGER_AUTH=none     (default) no token
//   LEDGER_AUTH=static   LEDGER_TOKEN is sent as is (short tests only: tokens expire)
//   LEDGER_AUTH=oauth    LEDGER_OAUTH_TOKEN_URL, LEDGER_OAUTH_CLIENT_ID, LEDGER_OAUTH_CLIENT_SECRET,
//                        optional LEDGER_OAUTH_AUDIENCE and LEDGER_OAUTH_SCOPE. Tokens are cached
//                        and renewed a minute before they expire.
//
// With auth on, the token belongs to one Ledger API user (LEDGER_USER_ID, usually the token's
// `sub`). The platform then runs in single-user mode: every command is submitted as that user,
// and allocating a party grants that user CanActAs for it (needs the participant_admin right).

export type LedgerAuthMode = "none" | "static" | "oauth";

export interface LedgerAuth {
  mode: LedgerAuthMode;
  token: () => Promise<string | undefined>;
}

const RENEW_BEFORE_MS = 60_000;

export function ledgerAuthFromEnv(env: NodeJS.ProcessEnv = process.env): LedgerAuth {
  const mode = (env.LEDGER_AUTH ?? (env.LEDGER_TOKEN ? "static" : "none")) as LedgerAuthMode;
  if (mode === "none") return { mode, token: async () => undefined };
  if (mode === "static") {
    const t = env.LEDGER_TOKEN;
    if (!t) throw new Error("LEDGER_AUTH=static needs LEDGER_TOKEN");
    return { mode, token: async () => t };
  }
  if (mode !== "oauth") throw new Error(`Unknown LEDGER_AUTH "${mode}" (use none, static or oauth)`);

  const url = env.LEDGER_OAUTH_TOKEN_URL;
  const clientId = env.LEDGER_OAUTH_CLIENT_ID;
  const clientSecret = env.LEDGER_OAUTH_CLIENT_SECRET;
  if (!url || !clientId || !clientSecret) throw new Error("LEDGER_AUTH=oauth needs LEDGER_OAUTH_TOKEN_URL, LEDGER_OAUTH_CLIENT_ID and LEDGER_OAUTH_CLIENT_SECRET");

  let cached: { token: string; renewAt: number } | undefined;
  let inflight: Promise<string> | undefined;

  async function fetchToken(): Promise<string> {
    const form = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId!, client_secret: clientSecret! });
    if (env.LEDGER_OAUTH_AUDIENCE) form.set("audience", env.LEDGER_OAUTH_AUDIENCE);
    if (env.LEDGER_OAUTH_SCOPE) form.set("scope", env.LEDGER_OAUTH_SCOPE);
    const res = await fetch(url!, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: form });
    const text = await res.text();
    if (!res.ok) throw new Error(`Ledger token request failed (${res.status}): ${text.slice(0, 200)}`);
    const body = JSON.parse(text) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error("Ledger token response has no access_token");
    const lifetimeMs = (body.expires_in ?? 300) * 1000;
    cached = { token: body.access_token, renewAt: Date.now() + Math.max(lifetimeMs - RENEW_BEFORE_MS, lifetimeMs / 2) };
    return body.access_token;
  }

  return {
    mode,
    token: async () => {
      if (cached && Date.now() < cached.renewAt) return cached.token;
      // One request at a time, however many callers ask at once.
      inflight ??= fetchToken().finally(() => {
        inflight = undefined;
      });
      return inflight;
    },
  };
}
