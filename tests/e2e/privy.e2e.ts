// Privy sign-in against the live stack, with Privy-shaped tokens signed by a local test key.
// The API must run with PRIVY_APP_ID and PRIVY_VERIFICATION_KEY set to the test values:
//
//   eval "$(node tests/e2e/privy-test-key.mjs)"   # exports PRIVY_APP_ID, PRIVY_VERIFICATION_KEY, PRIVY_TEST_PRIVATE_KEY
//   scripts/dev.sh                                # (restart so the API picks them up)
//   npx tsx tests/e2e/privy.e2e.ts

import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";

const API = process.env.API_URL ?? "http://localhost:7580";
const APP_ID = process.env.PRIVY_APP_ID!;
const PRIVATE_KEY = process.env.PRIVY_TEST_PRIVATE_KEY!.replaceAll("\\n", "\n");
assert.ok(APP_ID && PRIVATE_KEY, "PRIVY_APP_ID and PRIVY_TEST_PRIVATE_KEY must be set (see the header)");

const key = await importPKCS8(PRIVATE_KEY, "ES256");
const otherKey = await importPKCS8(
  generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  "ES256",
);

type Opts = { iss?: string; aud?: string; exp?: string | number; signWith?: typeof key };
const sign = (claims: Record<string, unknown>, sub: string, o: Opts = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setSubject(sub)
    .setIssuer(o.iss ?? "privy.io")
    .setAudience(o.aud ?? APP_ID)
    .setIssuedAt()
    .setExpirationTime(o.exp ?? "1h")
    .sign(o.signWith ?? key);
const accessToken = (did: string, o?: Opts) => sign({ sid: "s-1", app_client_id: "web" }, did, o);
const identityToken = (did: string, email: string, o?: Opts) =>
  sign({ linked_accounts: JSON.stringify([{ type: "email", address: email, verified_at: 1 }]) }, did, o);

async function privy(body: Record<string, unknown>) {
  const res = await fetch(`${API}/auth/privy`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as { data?: any; error?: { code: string } };
  return { status: res.status, data: json.data, code: json.error?.code, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0]! };
}
const me = async (cookie: string) => ((await (await fetch(`${API}/auth/me`, { headers: { cookie } })).json()) as { data: any }).data;

const results: string[] = [];
const check = (n: string) => results.push(`✓ ${n}`);

async function main() {
  const stamp = Date.now();
  const did = `did:privy:test${stamp}`;
  const email = `privy-${stamp}@example.com`;

  // Rejected tokens.
  const id = await identityToken(did, email);
  for (const bad of [
    { accessToken: await accessToken(did, { signWith: otherKey }), identityToken: id },
    { accessToken: await accessToken(did, { aud: "some-other-app" }), identityToken: id },
    { accessToken: await accessToken(did, { iss: "evil.example" }), identityToken: id },
    { accessToken: await accessToken(did, { exp: Math.floor(Date.now() / 1000) - 60 }), identityToken: id },
    { accessToken: await accessToken(did), identityToken: await identityToken(`did:privy:someone-else${stamp}`, email) },
    { accessToken: await accessToken(did) },
  ])
    assert.equal((await privy(bad)).code, "PRIVY_TOKEN_INVALID");
  check("forged, foreign-app, wrong-issuer, expired, mismatched and email-less tokens are refused");

  // New person: profile once, then an account of their own.
  const access = await accessToken(did);
  assert.equal((await privy({ accessToken: access, identityToken: id })).code, "PROFILE_REQUIRED");
  const created = await privy({ accessToken: access, identityToken: id, profile: { displayName: "Privy Imports Ltd", role: "importer" } });
  assert.equal(created.status, 201);
  assert.equal(created.data.kind, "member");
  assert.equal(created.data.email, email);
  assert.equal((await me(created.cookie)).id, created.data.id);
  const again = await privy({ accessToken: await accessToken(did), identityToken: await identityToken(did, email) });
  assert.equal(again.status, 200);
  assert.equal(again.data.id, created.data.id);
  check("a new Privy user adds company and role once, then signs straight in");

  // An existing password account is linked by verified email, not duplicated.
  const pwEmail = `pw-${stamp}@example.com`;
  const signup = await fetch(`${API}/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: pwEmail, password: "a long enough passphrase", displayName: "Password Freight", role: "forwarder" }),
  });
  const pwUser = ((await signup.json()) as { data: { id: string } }).data;
  const did2 = `did:privy:linked${stamp}`;
  const linked = await privy({ accessToken: await accessToken(did2), identityToken: await identityToken(did2, pwEmail.toUpperCase()) });
  assert.equal(linked.status, 200);
  assert.equal(linked.data.id, pwUser.id);
  check("an existing account with the same verified email is linked, keeping its ledger identity");

  // Never a demo account; never a second Privy user on one email.
  const did3 = `did:privy:demo${stamp}`;
  assert.equal((await privy({ accessToken: await accessToken(did3), identityToken: await identityToken(did3, "ada@summertime.demo") })).code, "EMAIL_TAKEN");
  const did4 = `did:privy:intruder${stamp}`;
  assert.equal((await privy({ accessToken: await accessToken(did4), identityToken: await identityToken(did4, email) })).code, "EMAIL_TAKEN");
  check("demo accounts and emails linked to another Privy user cannot be taken over");

  console.log(results.join("\n"));
  console.log("PRIVY PASSED");
}

main().catch((e) => {
  console.log(results.join("\n"));
  console.error(e);
  process.exit(1);
});
