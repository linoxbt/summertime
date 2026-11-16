import type { FastifyInstance } from "fastify";
import type { OpsStatus } from "@summertime/ledger";
import type { AppContext } from "../context.ts";
import { requireUser } from "../auth.ts";

const WORKER_STALE_SECONDS = 300;

export function opsRoutes(app: FastifyInstance, ctx: AppContext) {
  /** Readiness: database and ledger reachable. For load balancers and orchestrators. */
  app.get("/readyz", async (_req, reply) => {
    const out: Record<string, string> = {};
    try {
      await ctx.db.query("SELECT 1");
      out.database = "ok";
    } catch {
      out.database = "unavailable";
    }
    try {
      await ctx.ledger.version();
      out.ledger = "ok";
    } catch {
      out.ledger = "unavailable";
    }
    const ready = Object.values(out).every((v) => v === "ok");
    return reply.code(ready ? 200 : 503).send({ data: { ready, ...out } });
  });

  /** Operational status for the operator (spec 28). */
  app.get("/ops/status", { preHandler: requireUser(ctx, "operator") }, async () => {
    const [checks, alerts, worker, commands] = await Promise.all([
      ctx.db.query<{ name: string; status: "ok" | "warn" | "alert"; summary: string; checked_at: Date; detail: unknown }>(
        "SELECT name, status, summary, checked_at, detail FROM ops_checks ORDER BY name",
      ),
      ctx.db.query<{ id: string; name: string; severity: "warn" | "alert"; summary: string; raised_at: Date; resolved_at: Date | null }>(
        "SELECT id::text, name, severity, summary, raised_at, resolved_at FROM ops_alerts ORDER BY raised_at DESC LIMIT 25",
      ),
      ctx.db.query<{ offset: string; last_pass_at: Date | null }>(`SELECT "offset", last_pass_at FROM ledger_offsets WHERE worker_id = 'summertime-worker'`),
      ctx.db.query<{ total: string; failed: string }>(
        "SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE status = 'failed')::text AS failed FROM command_log WHERE created_at > now() - interval '24 hours'",
      ),
    ]);
    let ledgerEnd: number | null = null;
    try {
      ledgerEnd = await ctx.ledger.ledgerEnd();
    } catch {
      ledgerEnd = null;
    }
    const w = worker.rows[0];
    const since = w?.last_pass_at ? Math.round((Date.now() - w.last_pass_at.getTime()) / 1000) : null;
    // Worker liveness is judged here, not by the worker: a dead worker cannot report itself.
    const workerStatus: "ok" | "alert" = since !== null && since < WORKER_STALE_SECONDS && ledgerEnd !== null ? "ok" : "alert";
    const statuses = [workerStatus, ...checks.rows.map((c) => c.status)];
    const overall = statuses.includes("alert") ? "alert" : statuses.includes("warn") ? "warn" : "ok";
    const data: OpsStatus = {
      overall,
      checkedAt: new Date().toISOString(),
      worker: { lastPassAt: w?.last_pass_at?.toISOString() ?? null, secondsSincePass: since, offset: w ? Number(w.offset) : null, ledgerEnd, status: workerStatus },
      checks: checks.rows.map((c) => ({ name: c.name, status: c.status, summary: c.summary, checkedAt: c.checked_at.toISOString(), detail: c.detail })),
      alerts: alerts.rows.map((a) => ({
        id: a.id,
        name: a.name,
        severity: a.severity,
        summary: a.summary,
        raisedAt: a.raised_at.toISOString(),
        resolvedAt: a.resolved_at?.toISOString() ?? null,
      })),
      commands: { last24h: Number(commands.rows[0]?.total ?? 0), failed24h: Number(commands.rows[0]?.failed ?? 0) },
    };
    return { data };
  });
}
