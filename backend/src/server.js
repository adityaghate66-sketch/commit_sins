const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const scanRouter = require("./routes/scan");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(cors({ origin: CLIENT_URL }));
// Matches the scan route's 5 MB request budget.
app.use(express.json({ limit: "5mb" }));

app.use("/api", scanRouter);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "COMMIT SINS backend is running",
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
