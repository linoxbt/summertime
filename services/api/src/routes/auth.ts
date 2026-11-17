// Accounts and sessions.
//
// Real accounts ("member") sign up and sign in with email and password; passwords are
// scrypt-hashed, sign-in is rate-limited per email and per client address, and sessions are
// rotated on sign-in and revoked on password change or reset. Password reset uses a 6-digit
// emailed code. Demo accounts ("demo") are seeded, have no password, and can only be entered
// through the demo endpoints, which exist only in demo mode. The two never mix: demo lists,
// invitations and the privacy explorer only ever involve demo accounts.

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.ts";
import { createSession, destroySession, me, requireUser, revokeSessions, sessionUser } from "../auth.ts";
import { ApiError, forbidden, notFound } from "../errors.ts";
import { mailConfigured, sendMail } from "../mailer.ts";
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from "../passwords.ts";

const emailField = z.string().trim().toLowerCase().email().max(254);
const passwordField = z.string().min(1).max(200);

const FAIL_WINDOW = "15 minutes";
const MAX_FAILS_PER_EMAIL = 8;
const MAX_FAILS_PER_IP = 200;
const RESET_TTL_MINUTES = 15;
const RESET_MAX_ATTEMPTS = 5;
const RESET_MAX_PER_WINDOW = 3;

export function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const codeHash = (email: string, code: string) =>
    createHash("sha256").update(ctx.config.sessionSecret).update("\0reset\0").update(email).update("\0").update(code).digest("hex");

  async function userDto(id: string) {
    const r = await ctx.db.query<{
      id: string;
      handle: string;
      display_name: string;
      role: "forwarder" | "importer" | "operator";
      party_id: string;
      mode: "pilot" | "wallet";
      kind: "demo" | "member";
      email: string | null;
    }>(
      "SELECT u.id, u.handle, u.display_name, u.role, u.kind, u.email, p.party_id, p.mode FROM users u JOIN party_links p ON p.user_id = u.id WHERE u.id = $1",
      [id],
    );
    const u = r.rows[0]!;
    return { id: u.id, handle: u.handle, displayName: u.display_name, role: u.role, party: u.party_id, mode: u.mode, kind: u.kind, email: u.email };
  }

  async function tooManyFailures(email: string, ip: string): Promise<boolean> {
    const r = await ctx.db.query<{ by_email: string; by_ip: string }>(
      `SELECT count(*) FILTER (WHERE lower(email) = $1) AS by_email, count(*) FILTER (WHERE ip = $2) AS by_ip
         FROM auth_attempts WHERE NOT ok AND at > now() - interval '${FAIL_WINDOW}'`,
      [email, ip],
    );
    return Number(r.rows[0]!.by_email) >= MAX_FAILS_PER_EMAIL || Number(r.rows[0]!.by_ip) >= MAX_FAILS_PER_IP;
  }

  const record = (email: string, ip: string, ok: boolean) => ctx.db.query("INSERT INTO auth_attempts (email, ip, ok) VALUES ($1, $2, $3)", [email, ip, ok]);
  const clientIp = (req: FastifyRequest) => req.ip ?? "unknown";

  // ---- Real accounts ----------------------------------------------------------------------

  app.post("/auth/signup", async (req, reply) => {
    const body = z
      .object({
        email: emailField,
        password: passwordField,
        displayName: z.string().trim().min(2).max(60),
        role: z.enum(["importer", "forwarder"]),
      })
      .parse(req.body);
    const problem = passwordProblem(body.password, body.email);
    if (problem) throw new ApiError(400, "WEAK_PASSWORD", problem);
    const taken = await ctx.db.query("SELECT 1 FROM users WHERE lower(email) = $1", [body.email]);
    if (taken.rowCount) throw new ApiError(409, "EMAIL_TAKEN", "An account with that email already exists. Sign in instead.");
    const userId = await createAccount(ctx, {
      email: body.email,
      displayName: body.displayName,
      role: body.role,
      passwordHash: await hashPassword(body.password),
    });
    await createSession(ctx, userId, reply);
    return reply.code(201).send({ data: await userDto(userId) });
  });

  app.post("/auth/login", async (req, reply) => {
    const { email, password } = z.object({ email: emailField, password: passwordField }).parse(req.body);
    const ip = clientIp(req);
    if (await tooManyFailures(email, ip)) throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many failed sign-ins. Wait a few minutes or reset your password.");
    const r = await ctx.db.query<{ id: string; password_hash: string | null }>(
      "SELECT id, password_hash FROM users WHERE lower(email) = $1 AND kind = 'member'",
      [email],
    );
    const row = r.rows[0];
    // Always run one hash comparison so timing does not reveal whether the account exists.
    const ok = await verifyPassword(password, row?.password_hash ?? (await dummyHash()));
    if (!row || !row.password_hash || !ok) {
      await record(email, ip, false);
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    await record(email, ip, true);
    await createSession(ctx, row.id, reply);
    return { data: await userDto(row.id) };
  });

  app.post("/auth/password/forgot", async (req) => {
    const { email } = z.object({ email: emailField }).parse(req.body);
    if (!mailConfigured()) throw new ApiError(503, "EMAIL_UNAVAILABLE", "Password reset by email isn't available yet.");
    const user = await ctx.db.query<{ id: string }>("SELECT id FROM users WHERE lower(email) = $1 AND kind = 'member'", [email]);
    // Same answer whether or not the account exists.
    if (user.rows[0]) {
      const recent = await ctx.db.query<{ n: string }>(
        "SELECT count(*) AS n FROM login_codes WHERE lower(email) = $1 AND purpose = 'reset' AND created_at > now() - interval '15 minutes'",
        [email],
      );
      if (Number(recent.rows[0]!.n) < RESET_MAX_PER_WINDOW) {
        const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
        await ctx.db.query("UPDATE login_codes SET consumed_at = now() WHERE lower(email) = $1 AND purpose = 'reset' AND consumed_at IS NULL", [email]);
        await ctx.db.query(
          `INSERT INTO login_codes (email, code_hash, purpose, expires_at) VALUES ($1, $2, 'reset', now() + interval '${RESET_TTL_MINUTES} minutes')`,
          [email, codeHash(email, code)],
        );
        try {
          await sendMail(ctx, {
            to: email,
            subject: `Your Summertime reset code: ${code}`,
            text: `Your Summertime password reset code is ${code}. It expires in ${RESET_TTL_MINUTES} minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
          });
        } catch (e) {
          ctx.log.error({ err: e instanceof Error ? e.message : String(e) }, "password reset email failed");
          throw new ApiError(502, "EMAIL_FAILED", "We couldn't send the email. Try again in a moment.");
        }
      }
    }
    return { data: { sent: true } };
  });

  app.post("/auth/password/reset", async (req, reply) => {
    const { email, code, password } = z
      .object({ email: emailField, code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"), password: passwordField })
      .parse(req.body);
    const problem = passwordProblem(password, email);
    if (problem) throw new ApiError(400, "WEAK_PASSWORD", problem);
    const r = await ctx.db.query<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM login_codes
        WHERE lower(email) = $1 AND purpose = 'reset' AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1`,
      [email],
    );
    const row = r.rows[0];
    if (!row) throw new ApiError(400, "CODE_EXPIRED", "That code has expired. Request a new one.");
    if (row.attempts >= RESET_MAX_ATTEMPTS) throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many wrong codes. Request a new one.");
    const expected = Buffer.from(row.code_hash, "hex");
    const given = Buffer.from(codeHash(email, code), "hex");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await ctx.db.query("UPDATE login_codes SET attempts = attempts + 1 WHERE id = $1", [row.id]);
      throw new ApiError(400, "INVALID_CODE", "That code isn't right.");
    }
    const used = await ctx.db.query("UPDATE login_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING id", [row.id]);
    if (!used.rowCount) throw new ApiError(400, "CODE_EXPIRED", "That code has expired. Request a new one.");
    const user = await ctx.db.query<{ id: string }>(
      "UPDATE users SET password_hash = $2, password_changed_at = now() WHERE lower(email) = $1 AND kind = 'member' RETURNING id",
      [email, await hashPassword(password)],
    );
    if (!user.rows[0]) throw new ApiError(400, "INVALID_CODE", "That code isn't right.");
    await revokeSessions(ctx, user.rows[0].id);
    await createSession(ctx, user.rows[0].id, reply);
    return { data: await userDto(user.rows[0].id) };
  });

  app.post("/auth/password/change", { preHandler: requireUser(ctx) }, async (req) => {
    const user = me(req);
    if (user.kind !== "member") throw forbidden("Demo accounts don't have a password.");
    const { currentPassword, newPassword } = z.object({ currentPassword: passwordField, newPassword: passwordField }).parse(req.body);
    const r = await ctx.db.query<{ password_hash: string | null; email: string }>("SELECT password_hash, email FROM users WHERE id = $1", [user.id]);
    const row = r.rows[0]!;
    if (!row.password_hash || !(await verifyPassword(currentPassword, row.password_hash)))
      throw new ApiError(400, "WRONG_PASSWORD", "Your current password is incorrect.");
    const problem = passwordProblem(newPassword, row.email);
    if (problem) throw new ApiError(400, "WEAK_PASSWORD", problem);
    await ctx.db.query("UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1", [user.id, await hashPassword(newPassword)]);
    // Sign out every other session; keep this one.
    await revokeSessions(ctx, user.id, req);
    return { data: { ok: true } };
  });

  app.post("/auth/logout", async (req, reply) => {
    await destroySession(ctx, req, reply);
    return { data: { ok: true } };
  });

  app.get("/auth/me", async (req) => {
    const user = await sessionUser(ctx, req);
    if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in.");
    return { data: user };
  });

  // ---- Demo (demo mode only; demo accounts only) ------------------------------------------

  app.get("/auth/demo-accounts", async () => {
    if (!ctx.config.demoMode) throw forbidden("The demo is disabled.");
    const r = await ctx.db.query<{ handle: string; display_name: string; role: string; email: string | null }>(
      `SELECT handle, display_name, role, email FROM users WHERE kind = 'demo'
        ORDER BY CASE role WHEN 'forwarder' THEN 0 WHEN 'importer' THEN 1 ELSE 2 END, display_name`,
    );
    return { data: r.rows.map((x) => ({ handle: x.handle, displayName: x.display_name, role: x.role, email: x.email })) };
  });

  app.post("/auth/demo-login", async (req, reply) => {
    if (!ctx.config.demoMode) throw forbidden("The demo is disabled.");
    const { handle } = z.object({ handle: z.string().min(1) }).parse(req.body);
    const r = await ctx.db.query<{ id: string }>("SELECT id FROM users WHERE handle = $1 AND kind = 'demo'", [handle]);
    const row = r.rows[0];
    if (!row) throw notFound("Demo account");
    await createSession(ctx, row.id, reply);
    return { data: await userDto(row.id) };
  });
}

/**
 * Create a real, pilot-hosted account: a ledger party and Ledger API user of its own, the
 * user row and its party link. Returns the users.id.
 */
async function createAccount(
  ctx: AppContext,
  a: { email: string; displayName: string; role: "importer" | "forwarder"; passwordHash: string },
): Promise<string> {
  const base =
    a.email
      .split("@")[0]!
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "user";
  const handle = `${base}-${randomBytes(3).toString("hex")}`;
  const party = await ctx.ledger.allocateParty(`${handle}-${Date.now().toString(36)}`);
  await ctx.ledger.createUser(`u-${handle}`, party, [party]);

  const client = await ctx.db.connect();
  try {
    await client.query("BEGIN");
    const u = await client.query<{ id: string }>(
      `INSERT INTO users (handle, display_name, role, email, kind, password_hash, password_changed_at)
       VALUES ($1, $2, $3, $4, 'member', $5, now()) ON CONFLICT DO NOTHING RETURNING id`,
      [handle, a.displayName, a.role, a.email, a.passwordHash],
    );
    if (!u.rows[0]) throw new ApiError(409, "EMAIL_TAKEN", "An account with that email already exists. Sign in instead.");
    await client.query("INSERT INTO party_links (user_id, party_id, mode) VALUES ($1, $2, 'pilot')", [u.rows[0].id, party]);
    await client.query("COMMIT");
    return u.rows[0].id;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
