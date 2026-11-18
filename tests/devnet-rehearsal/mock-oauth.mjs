// A stand-in for a node provider's identity server: OAuth 2.0 client-credentials grant that
// returns Canton Ledger API tokens (HS256, scope daml_ledger_api, sub = client_id).
// Tokens live TOKEN_SECONDS (default 120 s) so a rehearsal also exercises renewal.
import { createHmac } from "node:crypto";
import { createServer } from "node:http";

const SECRET = "summertime-rehearsal-secret";
const PORT = Number(process.env.MOCK_OAUTH_PORT ?? 7695);
const TTL = Number(process.env.TOKEN_SECONDS ?? 120);
const CLIENTS = { participant_admin: "admin-secret", "summertime-svc": "svc-secret" };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
let issued = 0;

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/stats") return res.end(JSON.stringify({ issued }));
  if (req.method !== "POST" || req.url !== "/token") return (res.statusCode = 404), res.end();
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const f = new URLSearchParams(body);
    const id = f.get("client_id");
    if (f.get("grant_type") !== "client_credentials" || !id || CLIENTS[id] !== f.get("client_secret")) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "invalid_client" }));
    }
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: id, scope: "daml_ledger_api", iat: now, exp: now + TTL })}`;
    const sig = createHmac("sha256", SECRET).update(unsigned).digest("base64url");
    issued++;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ access_token: `${unsigned}.${sig}`, token_type: "Bearer", expires_in: TTL }));
  });
}).listen(PORT, "127.0.0.1", () => console.log(`mock oauth on ${PORT}`));
