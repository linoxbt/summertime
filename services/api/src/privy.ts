// Privy sign-in: verify the tokens Privy issues to the browser and read the verified email.
//
// Configuration (all on the API):
//   PRIVY_APP_ID            the Privy app ID (the tokens' audience)
//   PRIVY_VERIFICATION_KEY  optional: the app's verification key (PEM, public); "\n" escapes
//                           are accepted. Without it the keys come from Privy's published JWKS
//   PRIVY_APP_SECRET        optional: lets the API look the user up through Privy's REST API
//                           when no identity token is sent
//
// Access tokens are ES256 JWTs with iss "privy.io", aud = the app ID and sub = the user's
// Privy DID. Identity tokens (enabled in the dashboard: "Return user data in an identity
// token") carry the same sub and a `linked_accounts` claim, a JSON string.

import { createRemoteJWKSet, importSPKI, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface PrivyIdentity {
  did: string;
  email: string;
}

export class PrivyError extends Error {}

let keyPromise: Promise<CryptoKey> | undefined;
let jwks: JWTVerifyGetKey | undefined;

export function privyConfigured(): boolean {
  return Boolean(process.env.PRIVY_APP_ID);
}

function verificationKey(): Promise<CryptoKey> | JWTVerifyGetKey {
  const pem = process.env.PRIVY_VERIFICATION_KEY;
  if (pem) {
    keyPromise ??= importSPKI(pem.replaceAll("\\n", "\n").trim(), "ES256");
    return keyPromise;
  }
  jwks ??= createRemoteJWKSet(
    new URL(`https://auth.privy.io/api/v1/apps/${encodeURIComponent(process.env.PRIVY_APP_ID!)}/jwks.json`),
  );
  return jwks;
}

async function verify(token: string): Promise<Record<string, unknown>> {
  try {
    const key = verificationKey();
    const opts = {
      issuer: "privy.io",
      audience: process.env.PRIVY_APP_ID,
      algorithms: ["ES256"],
    };
    const { payload } =
      typeof key === "function" ? await jwtVerify(token, key, opts) : await jwtVerify(token, await key, opts);
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
