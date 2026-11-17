// Privy sign-in: verify the tokens Privy issues to the browser and read the verified email.
//
// Configuration (all on the API):
//   PRIVY_APP_ID            the Privy app ID (the tokens' audience)
//   PRIVY_VERIFICATION_KEY  the app's verification key (PEM, public) from the Privy dashboard,
//                           Configuration > App settings; "\n" escapes are accepted
//   PRIVY_APP_SECRET        optional: lets the API look the user up through Privy's REST API
//                           when no identity token is sent
//
// Access tokens are ES256 JWTs with iss "privy.io", aud = the app ID and sub = the user's
// Privy DID. Identity tokens (enabled in the dashboard: "Return user data in an identity
// token") carry the same sub and a `linked_accounts` claim, a JSON string.

import { importSPKI, jwtVerify } from "jose";

export interface PrivyIdentity {
  did: string;
  email: string;
}

export class PrivyError extends Error {}

let keyPromise: Promise<CryptoKey> | undefined;

export function privyConfigured(): boolean {
  return Boolean(process.env.PRIVY_APP_ID && process.env.PRIVY_VERIFICATION_KEY);
}

function verificationKey(): Promise<CryptoKey> {
  keyPromise ??= importSPKI(process.env.PRIVY_VERIFICATION_KEY!.replaceAll("\\n", "\n").trim(), "ES256");
  return keyPromise;
}

async function verify(token: string): Promise<Record<string, unknown>> {
  try {
    const { payload } = await jwtVerify(token, await verificationKey(), {
      issuer: "privy.io",
      audience: process.env.PRIVY_APP_ID,
      algorithms: ["ES256"],
    });
    return payload as Record<string, unknown>;
  } catch (e) {
    throw new PrivyError(`token rejected: ${e instanceof Error ? e.message : String(e)}`);
  }
}

interface LinkedAccount {
  type?: string;
  address?: string;
  email?: string;
  verified_at?: number | string | null;
}

/** The first email among Privy linked accounts: an email login, or a Google/Apple account's email. */
function emailFrom(accounts: LinkedAccount[]): string | undefined {
  const direct = accounts.find((a) => a.type === "email" && a.address);
  if (direct?.address) return direct.address;
  const oauth = accounts.find((a) => (a.type === "google_oauth" || a.type === "apple_oauth") && a.email);
  return oauth?.email;
}

async function emailFromRest(did: string): Promise<string | undefined> {
  const appId = process.env.PRIVY_APP_ID!;
  const secret = process.env.PRIVY_APP_SECRET;
  if (!secret) return undefined;
  const res = await fetch(`https://api.privy.io/v1/users/${encodeURIComponent(did)}`, {
    headers: { authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString("base64")}`, "privy-app-id": appId },
  });
  if (!res.ok) throw new PrivyError(`Privy user lookup answered ${res.status}`);
  const user = (await res.json()) as { linked_accounts?: LinkedAccount[] };
  return emailFrom(user.linked_accounts ?? []);
}

/** Verify an access token (and an identity token if given) and return the user's DID and email. */
export async function privyIdentity(accessToken: string, identityToken?: string): Promise<PrivyIdentity> {
  const access = await verify(accessToken);
  const did = typeof access.sub === "string" ? access.sub : "";
  if (!did.startsWith("did:privy:")) throw new PrivyError("access token has no Privy user");

  let email: string | undefined;
  if (identityToken) {
    const id = await verify(identityToken);
    if (id.sub !== did) throw new PrivyError("identity token belongs to another user");
    let accounts: LinkedAccount[] = [];
    try {
      accounts = typeof id.linked_accounts === "string" ? (JSON.parse(id.linked_accounts) as LinkedAccount[]) : [];
    } catch {
      throw new PrivyError("identity token has unreadable linked accounts");
    }
    email = emailFrom(accounts);
  }
  email ??= await emailFromRest(did);
  if (!email) throw new PrivyError("no verified email on the Privy account");
  return { did, email: email.trim().toLowerCase() };
}
