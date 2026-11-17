import Fastify, { type FastifyBaseLogger } from "fastify";
import cookie from "@fastify/cookie";
import { migrate } from "@summertime/platform";
import { createContext } from "./context.ts";
import { ApiError, errorHandler } from "./errors.ts";
import { authRoutes } from "./routes/auth.ts";
import { commonRoutes } from "./routes/common.ts";
import { forwarderRoutes } from "./routes/forwarder.ts";
import { importerRoutes } from "./routes/importer.ts";
import { opsRoutes } from "./routes/ops.ts";

export async function buildApp() {
  const ctx = createContext();
  await migrate(ctx.db);
  const app = Fastify({ loggerInstance: ctx.log as unknown as FastifyBaseLogger, trustProxy: true, maxParamLength: 512 });
  await app.register(cookie);
  app.setErrorHandler(errorHandler);
  // Every change needs an Idempotency-Key (spec section 20), checked before body validation.
  app.addHook("onRequest", async (req) => {
    if (req.method !== "POST" || req.url.startsWith("/auth/")) return;
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || key.length < 8 || key.length > 128) {
      throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Send a unique Idempotency-Key header (8–128 characters) with every change.");
    }
  });
  authRoutes(app, ctx);
  commonRoutes(app, ctx);
  forwarderRoutes(app, ctx);
  importerRoutes(app, ctx);
  opsRoutes(app, ctx);
  app.addHook("onClose", async () => {
    await ctx.db.end();
  });
  return { app, ctx };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app, ctx } = await buildApp();
  await app.listen({ port: ctx.config.apiPort, host: process.env.API_HOST ?? "127.0.0.1" });
}
