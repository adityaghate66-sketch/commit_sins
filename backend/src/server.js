const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const scanRouter = require("./routes/scan");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

/**
 * Build the Express application without starting a listener.
 *
 * Tests can `require` this module, mount or listen to the returned app, and
 * shut it down cleanly. Running the file directly starts the HTTP server.
 */
function createApp() {
  const app = express();
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

  app.disable("x-powered-by");
  app.use(cors({ origin: clientUrl }));
  // Matches the scan route's 5 MB request budget.
  app.use(express.json({ limit: "5mb" }));

  app.use("/api", scanRouter);

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      message: "COMMIT SINS backend is running",
    });
  });

  // Unknown routes still return the API's JSON envelope, never Express HTML.
  app.use((req, res) => {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
      },
    });
  });

  // Turn body-parser failures into the same JSON error envelope the routes use,
  // and never expose a stack trace or parser internals to the client.
  app.use((err, req, res, next) => {
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
  });

  return app;
}

const app = createApp();

if (require.main === module) {
  const port = Number(process.env.PORT || 5001);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("Invalid PORT. Set PORT to an integer between 1 and 65535.");
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = app;
module.exports.createApp = createApp;
