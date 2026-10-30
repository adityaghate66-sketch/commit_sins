"use strict";

/**
 * Integration tests for the COMMIT SINS scan endpoint.
 *
 * These tests exercise the real HTTP surface: they spawn backend/src/server.js
 * on a private port and call POST /api/scan over fetch, so routing, JSON
 * parsing, validation and the scanner are all covered together.
 *
 * Run with:  cd backend && npm test
 * Or:        cd backend && node --test tests/scan-api.test.js
 *
 * Only synthetic fixtures from tests/fixtures are used — no real credentials.
 */

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const fakeFixture = require("../../tests/fixtures/fake-secrets");
const cleanFixture = require("../../tests/fixtures/clean-file");

const BACKEND_ROOT = path.resolve(__dirname, "..");
const FAKE_FILENAME = "tests/fixtures/fake-secrets.js";

let server;
let baseUrl;
let serverOutput = "";

/** Ask the OS for a free port, then release it for the child server. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Poll the health endpoint until the child process is serving requests. */
async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch (_error) {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start:\n${serverOutput}`);
}

function postJson(body) {
  return fetch(`${baseUrl}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

before(async () => {
  const port = await findFreePort();
  baseUrl = `http://127.0.0.1:${port}`;

  server = spawn(process.execPath, ["src/server.js"], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (chunk) => (serverOutput += chunk.toString()));
  server.stderr.on("data", (chunk) => (serverOutput += chunk.toString()));

  await waitForServer();
});

after(async () => {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  await exited;
});

test("detects a fake secret and returns filename, line number and mask", async () => {
  const response = await postJson({
    files: [{ filename: FAKE_FILENAME, content: fakeFixture.content }],
  });
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.summary.filesScanned, 1);
  assert.equal(body.summary.findingsCount, 7);
  assert.equal(body.files.length, 1);
  assert.equal(body.files[0].file, FAKE_FILENAME);

  const aws = body.files[0].findings.find((finding) => finding.type === "aws-access-key-id");
  assert.ok(aws, "expected an aws-access-key-id finding");
  assert.equal(aws.line, 3, "AWS key lives on line 3 of the fixture");
  assert.equal(aws.column, 22);
  assert.equal(aws.file, FAKE_FILENAME);
  assert.equal(aws.severity, "critical");
  assert.match(aws.maskedValue, /^\*+$/, "value must be fully masked");
  assert.equal(aws.valueLength, 20);
  assert.ok(typeof aws.remediation === "string" && aws.remediation.length > 20);

  const password = body.files[0].findings.find((finding) => finding.type === "password-assignment");
  assert.equal(password.line, 5);

  const github = body.files[0].findings.filter((finding) => finding.type === "github-token");
  assert.deepEqual(github.map((finding) => finding.line).sort(), [6, 7]);
});

test("returns the submitted filename exactly as sent", async () => {
  const response = await postJson({
    files: [{ filename: "src/config/production.js", content: fakeFixture.content }],
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.files[0].file, "src/config/production.js");
  assert.ok(body.files[0].findings.every((finding) => finding.file === "src/config/production.js"));
});

test("clean code produces zero findings", async () => {
  const response = await postJson({
    files: [{ filename: "tests/fixtures/clean-file.js", content: cleanFixture.content }],
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.summary.filesScanned, 1);
  assert.equal(body.summary.findingsCount, 0);
  assert.deepEqual(body.files[0].findings, []);
  assert.equal(body.summary.highestSeverity, null);
  assert.equal(body.summary.bySeverity.critical, 0);
});

test("clean and dirty files can be scanned together", async () => {
  const response = await postJson({
    files: [
      { filename: "clean.js", content: cleanFixture.content },
      { filename: "dirty.js", content: fakeFixture.content },
    ],
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.summary.filesScanned, 2);
  assert.equal(body.summary.findingsCount, 7);
  assert.equal(body.files[0].findings.length, 0);
  assert.equal(body.files[1].findings.length, 7);
  assert.deepEqual(body.summary.bySeverity, { critical: 4, high: 1, medium: 1, low: 1 });
});

test("invalid requests receive appropriate errors", async () => {
  const cases = [
    {
      label: "missing files array",
      body: {},
      status: 400,
      code: "INVALID_FILES",
    },
    {
      label: "files is not an array",
      body: { files: "nope" },
      status: 400,
      code: "INVALID_FILES",
    },
    {
      label: "empty files array",
      body: { files: [] },
      status: 400,
      code: "INVALID_FILES",
    },
    {
      label: "content is not a string",
      body: { files: [{ filename: "a.js", content: 42 }] },
      status: 400,
      code: "INVALID_FILE",
    },
    {
      label: "filename is blank",
      body: { files: [{ filename: "   ", content: "const x = 1;" }] },
      status: 400,
      code: "INVALID_FILE",
    },
    {
      label: "too many files",
      body: { files: Array.from({ length: 101 }, () => ({ filename: "a.js", content: "" })) },
      status: 400,
      code: "TOO_MANY_FILES",
    },
  ];

  for (const testCase of cases) {
    const response = await postJson(testCase.body);
    const body = await response.json();

    assert.equal(response.status, testCase.status, testCase.label);
    assert.equal(body.error.code, testCase.code, testCase.label);
    assert.equal(typeof body.error.message, "string", testCase.label);
    assert.ok(!("files" in body) && !("summary" in body), testCase.label);
    assert.ok(!JSON.stringify(body).includes("stack"), testCase.label);
  }
});

test("payloads over the byte budget are rejected with 413", async () => {
  const response = await postJson({
    files: [{ filename: "big.js", content: "a".repeat(1000001) }],
  });
  const body = await response.json();

  assert.equal(response.status, 413);
  assert.equal(body.error.code, "PAYLOAD_TOO_LARGE");
  assert.equal(typeof body.error.message, "string");
  assert.ok(Array.isArray(body.error.details));
  assert.equal(body.error.details[0].field, "content");
  assert.ok(!JSON.stringify(body).includes("stack"));
});

test("malformed JSON is rejected without a stack trace", async () => {
  const response = await fetch(`${baseUrl}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ not valid json",
  });
  const text = await response.text();

  assert.equal(response.status, 400);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  assert.ok(!text.includes("stack"));
  assert.ok(!/at .+\(.+:\d+:\d+\)/.test(text));

  const body = JSON.parse(text);
  assert.equal(body.error.code, "INVALID_JSON");
  assert.ok(!("files" in body) && !("summary" in body));
});

test("raw secret values never appear in responses", async () => {
  const response = await postJson({
    files: [{ filename: FAKE_FILENAME, content: fakeFixture.content }],
  });
  const body = await response.json();
  const serialized = JSON.stringify(body);

  for (const secret of fakeFixture.secrets) {
    assert.ok(
      !serialized.includes(secret.value),
      `response leaked a raw ${secret.type} value`
    );
  }

  // No source line and no raw match field either.
  assert.ok(!serialized.includes("const signingSeed"));
  assert.ok(!serialized.includes(fakeFixture.content));
  for (const finding of body.files[0].findings) {
    assert.ok(!("value" in finding));
    assert.ok(!("match" in finding));
    assert.match(finding.maskedValue, /^\*+$/);
  }
});

test("error responses never echo the submitted secret", async () => {
  const secret = fakeFixture.secrets[0].value;
  const response = await postJson({
    files: [
      { filename: secret, content: 42 },
      { filename: "ok.js", content: secret },
    ],
  });
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 400);
  assert.ok(!serialized.includes(secret));
  assert.ok(!serialized.includes("ok.js"));
});

test("empty file content is handled without error", async () => {
  const response = await postJson({
    files: [{ filename: "empty.js", content: "" }],
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.summary.filesScanned, 1);
  assert.equal(body.summary.findingsCount, 0);
  assert.equal(body.files[0].summary.linesScanned, 0);
});
