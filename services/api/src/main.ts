import Fastify, { type FastifyBaseLogger } from "fastify";
import cookie from "@fastify/cookie";
import { migrate } from "@summertime/platform";
import { createContext } from "./context.ts";
import { errorHandler } from "./errors.ts";
import { commonRoutes } from "./routes/common.ts";
import { forwarderRoutes } from "./routes/forwarder.ts";
import { importerRoutes } from "./routes/importer.ts";

export async function buildApp() {
  const ctx = createContext();
  await migrate(ctx.db);
  const app = Fastify({ loggerInstance: ctx.log as unknown as FastifyBaseLogger, trustProxy: true, maxParamLength: 512 });
  await app.register(cookie);
  app.setErrorHandler(errorHandler);
  commonRoutes(app, ctx);
  forwarderRoutes(app, ctx);
  importerRoutes(app, ctx);
  app.addHook("onClose", async () => {
    await ctx.db.end();
  });
  return { app, ctx };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app, ctx } = await buildApp();
  await app.listen({ port: ctx.config.apiPort, host: process.env.API_HOST ?? "127.0.0.1" });
}
