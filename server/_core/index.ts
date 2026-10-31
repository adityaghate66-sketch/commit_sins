import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { scanFiles } from "../scanner";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Scan payloads stay intentionally small because secrets are never stored.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.post("/api/scan", (req, res) => {
    try {
      const body = req.body as { files?: unknown };
      if (!Array.isArray(body?.files) || body.files.length < 1 || body.files.length > 20) {
        return res.status(400).json({ error: "Provide between 1 and 20 files to scan." });
      }

      const files = body.files.map((file, index) => {
        if (!file || typeof file !== "object") throw new Error(`File ${index + 1} is invalid.`);
        const candidate = file as { fileName?: unknown; content?: unknown };
        if (typeof candidate.fileName !== "string" || candidate.fileName.length < 1 || candidate.fileName.length > 240) {
          throw new Error(`File ${index + 1} needs a valid filename.`);
        }
        if (typeof candidate.content !== "string" || candidate.content.length > 250_000) {
          throw new Error(`File ${candidate.fileName} exceeds the 250 KB scan limit.`);
        }
        return { fileName: candidate.fileName, content: candidate.content };
      });

      return res.json(scanFiles(files));
    } catch (error) {
      const message = error instanceof Error ? error.message : "The scan could not be completed safely.";
      return res.status(400).json({ error: message });
    }
  });
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
