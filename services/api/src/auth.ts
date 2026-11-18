// Sessions. One session ↔ one user ↔ one party (spec section 20: the API maps the session
// to one party and refuses anything that party is not a stakeholder of).
//
// Real accounts sign in with email and password (routes/auth.ts); demo accounts through the
// demo endpoints. Everything downstream of the session is the same for both.

import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { SessionUser } from "@summertime/ledger";
import type { AppContext } from "./context.ts";
import { ApiError, forbidden } from "./errors.ts";

export const SESSION_COOKIE = "st_session";
const SESSION_DAYS = 7;

const hash = (token: string, secret: string) => createHash("sha256").update(secret).update(token).digest("hex");

export async function createSession(ctx: AppContext, userId: string, reply: FastifyReply): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await ctx.db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + $3::interval)", [
    hash(token, ctx.config.sessionSecret),
    userId,
    `${SESSION_DAYS} days`,
  ]);
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession(ctx: AppContext, req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await ctx.db.query("DELETE FROM sessions WHERE token_hash = $1", [hash(token, ctx.config.sessionSecret)]);
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function sessionUser(ctx: AppContext, req: FastifyRequest): Promise<SessionUser | undefined> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return undefined;
  const r = await ctx.db.query<{
    id: string;
    handle: string;
    display_name: string;
    role: SessionUser["role"];
    party_id: string;
    mode: SessionUser["mode"];
    kind: SessionUser["kind"];
    email: string | null;
  }>(
    `SELECT u.id, u.handle, u.display_name, u.role, u.kind, u.email, p.party_id, p.mode
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN party_links p ON p.user_id = u.id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.deleted_at IS NULL`,
    [hash(token, ctx.config.sessionSecret)],
  );
  const row = r.rows[0];
  if (!row) return undefined;
  return { id: row.id, handle: row.handle, displayName: row.display_name, role: row.role, party: row.party_id, mode: row.mode, kind: row.kind, email: row.email };
}

/** End a user's sessions; with `keep`, the session making this request survives. */
export async function revokeSessions(ctx: AppContext, userId: string, keep?: FastifyRequest): Promise<void> {
  const token = keep?.cookies[SESSION_COOKIE];
  if (token) await ctx.db.query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [userId, hash(token, ctx.config.sessionSecret)]);
  else await ctx.db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

export function requireUser(ctx: AppContext, ...roles: SessionUser["role"][]) {
  return async (req: FastifyRequest) => {
    const user = await sessionUser(ctx, req);
    if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in.");
    if (roles.length && !roles.includes(user.role)) throw forbidden(`This action needs a ${roles.join(" or ")} account.`);
    req.user = user;
  };
}

export function me(req: FastifyRequest): SessionUser {
  if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in.");
  return req.user;
}
