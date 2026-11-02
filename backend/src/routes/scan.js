"use strict";

/**
 * COMMIT SINS — scan route.
 *
 * POST /scan accepts { files: [{ filename, content }, ...] } and returns one
 * scanner result per file plus an aggregate summary.
 *
 * All detection lives in ../engine/scanner.js. This module owns request
 * validation and aggregation only.
 *
 * Privacy rules enforced here:
 *   - request content is never echoed back, in success or error responses;
 *   - error details carry an index and field name, never the submitted value;
 *   - nothing is written to the console, so no secret can reach a log;
 *   - unexpected failures return a generic message without a stack trace.
 */

const express = require("express");
const { scanFiles } = require("../engine/scanner");

/**
 * Request limits. Sizes are UTF-8 bytes, not characters, so multibyte content
 * cannot slip past the budget; the per-request cap also bounds total work.
 */
const LIMITS = Object.freeze({
  maxFiles: 100,
  maxFilenameLength: 512,
  maxFileBytes: 1000000, // 1 MB of UTF-8 per file
  maxTotalBytes: 5000000, // 5 MB of UTF-8 per request
  maxReportedErrors: 10, // enough to fix a request without echoing it all
});

/** Control characters would end up in reports and logs verbatim. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const router = express.Router();

/** Send the shared error envelope. Never includes submitted content. */
function fail(res, status, code, message, details) {
  const body = { error: { code, message } };
  if (Array.isArray(details) && details.length > 0) {
    body.error.details = details.slice(0, LIMITS.maxReportedErrors);
  }
  return res.status(status).json(body);
}

/** True for JSON objects only — arrays, null and primitives are rejected. */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** UTF-8 size of a string, so multibyte characters count honestly. */
function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

/**
 * Inspect every submitted file.
 *
 * Collects problems instead of throwing, and keeps invalid and oversized
 * findings apart so the handler can pick 400 vs 413. Entries that fail
 * filename checks are still measured, so a bad name cannot hide a large body
 * from the total budget.
 *
 * @returns {{ specs: object[], invalid: object[], oversize: object[], totalBytes: number }}
 */
function inspectFiles(files) {
  const specs = [];
  const invalid = [];
  const oversize = [];
  let totalBytes = 0;

  files.forEach((file, index) => {
    if (!isPlainObject(file)) {
      invalid.push({
        index,
        field: "file",
        message: "must be an object with filename and content",
      });
      return;
    }

    const { filename, content } = file;
    let filenameValid = true;

    if (typeof filename !== "string") {
      invalid.push({ index, field: "filename", message: "must be a string" });
      filenameValid = false;
    } else {
      const trimmed = filename.trim();

      if (trimmed.length === 0) {
        invalid.push({ index, field: "filename", message: "must not be empty" });
        filenameValid = false;
      } else if (trimmed.length > LIMITS.maxFilenameLength) {
        invalid.push({
          index,
          field: "filename",
          message: `must be at most ${LIMITS.maxFilenameLength} characters`,
        });
        filenameValid = false;
      } else if (CONTROL_CHARACTERS.test(trimmed)) {
        invalid.push({
          index,
          field: "filename",
          message: "must not contain control characters",
        });
        filenameValid = false;
      }
    }

    if (typeof content !== "string") {
      invalid.push({ index, field: "content", message: "must be a string" });
      return;
    }

    const bytes = byteLength(content);
    totalBytes += bytes;

    if (bytes > LIMITS.maxFileBytes) {
      oversize.push({
        index,
        field: "content",
        message: `must be at most ${LIMITS.maxFileBytes} bytes`,
      });
      return;
    }

    if (filenameValid) specs.push({ filename: filename.trim(), content });
  });

  return { specs, invalid, oversize, totalBytes };
}

router.post("/scan", (req, res) => {
  try {
    const body = req.body;

    // 400 — body must be a JSON object (array bodies, null and scalars are out).
    if (!isPlainObject(body)) {
      return fail(
        res,
        400,
        "INVALID_BODY",
        "Request body must be a JSON object containing a files array."
      );
    }

    // 400 — distinguish "key absent" from "wrong type" for a clearer client error.
    if (!Object.prototype.hasOwnProperty.call(body, "files")) {
      return fail(res, 400, "INVALID_FILES", "A files array is required.");
    }

    const { files } = body;

    if (!Array.isArray(files)) {
      return fail(
        res,
        400,
        "INVALID_FILES",
        "files must be an array of { filename, content } objects."
      );
    }

    // An empty array is a client mistake, not an empty scan.
    if (files.length === 0) {
      return fail(res, 400, "INVALID_FILES", "files must contain at least one file.");
    }

    if (files.length > LIMITS.maxFiles) {
      return fail(
        res,
        400,
        "TOO_MANY_FILES",
        `files must contain at most ${LIMITS.maxFiles} entries.`
      );
    }

    const { specs, invalid, oversize, totalBytes } = inspectFiles(files);

    // 413 — size problems take priority; nothing is scanned in this case.
    if (oversize.length > 0 || totalBytes > LIMITS.maxTotalBytes) {
      const details = [...oversize];

      if (totalBytes > LIMITS.maxTotalBytes) {
        details.unshift({
          field: "files",
          message: `total content must be at most ${LIMITS.maxTotalBytes} bytes`,
        });
      }

      return fail(
        res,
        413,
        "PAYLOAD_TOO_LARGE",
        "Request content exceeds the allowed size.",
        details
      );
    }

    // 400 — structural problems, reported by index and field only.
    if (invalid.length > 0) {
      return fail(
        res,
        400,
        "INVALID_FILE",
        "One or more files are invalid.",
        invalid
      );
    }

    // Empty content is valid: it simply yields a summary with no findings.
    // scanFiles keeps this route and the pre-commit/CI callers on one contract.
    return res.status(200).json(scanFiles(specs));
  } catch (error) {
    // Never leak a stack trace, error message or submitted value.
    return fail(res, 500, "SCAN_FAILED", "The scan could not be completed.");
  }
});

module.exports = router;
module.exports.LIMITS = LIMITS;
