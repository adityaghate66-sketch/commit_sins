import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
// The canonical scan route and detection engine are shared with the standalone
// CommonJS backend. Keeping one implementation means the dashboard, the git
// hook and CI can never disagree about a finding.
// @ts-ignore -- the canonical engine is plain CommonJS with no type declarations
import scanRouter from "../../backend/src/routes/scan.js";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Matches the scan route's 5 MB request budget. Scanned content is never stored.
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true }));
  app.use("/api", scanRouter);
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Keep parser failures on the same safe JSON envelope as the standalone API.
  // No stack trace, parser internals or submitted content reach the client.
  app.use(
    (
      err: { type?: string; status?: number },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) return next(err);
      if (err && err.type === "entity.too.large") {
        return res.status(413).json({
          error: {
            code: "PAYLOAD_TOO_LARGE",
            message: "Request content exceeds the allowed size.",
          },
        });
      }
      if (err && (err.type === "entity.parse.failed" || err.status === 400)) {
        return res.status(400).json({
          error: {
            code: "INVALID_JSON",
            message: "Request body must be valid JSON.",
          },
        });
      }
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Unexpected server error." },
      });
    }
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
