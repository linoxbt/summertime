// Print shell exports for a throwaway Privy-like test setup: an app ID and an ES256 key pair.
// Test use only: tokens signed with this key are accepted by an API started with these values.
//   eval "$(node tests/e2e/privy-test-key.mjs)"

import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const one = (pem) => pem.trim().replaceAll("\n", "\\n");
const pub = one(publicKey.export({ type: "spki", format: "pem" }).toString());
const priv = one(privateKey.export({ type: "pkcs8", format: "pem" }).toString());
const appId = `test-app-${Date.now()}`;
if (process.argv.includes("--github-env")) {
  // NAME=value lines for $GITHUB_ENV (PEM newlines stay escaped as \n).
  console.log(`PRIVY_APP_ID=${appId}\nPRIVY_VERIFICATION_KEY=${pub}\nPRIVY_TEST_PRIVATE_KEY=${priv}`);
} else {
  console.log(`export PRIVY_APP_ID='${appId}' PRIVY_VERIFICATION_KEY='${pub}' PRIVY_TEST_PRIVATE_KEY='${priv}'`);
}
