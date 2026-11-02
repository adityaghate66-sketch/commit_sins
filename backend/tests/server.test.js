'use strict';

/**
 * HTTP boundary tests for the COMMIT SINS Express app.
 *
 * These tests import the app directly instead of spawning a child process. They
 * cover safe JSON errors for unknown routes, malformed JSON and oversized
 * bodies, plus the no-listener export contract.
 *
 * Run with:  cd backend && npm test
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/server');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
    server.on('error', reject);
  });
});

after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

function postJson(body) {
  return fetch(`${baseUrl}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('module exports an app without starting a listener', () => {
  assert.equal(typeof app, 'function');
  assert.equal(typeof app.listen, 'function');
  assert.equal(typeof app.createApp, 'function');
});

test('health endpoint returns safe JSON and no x-powered-by header', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.deepEqual(body, {
    status: 'ok',
    message: 'COMMIT SINS backend is running',
  });
});

test('unknown routes return a JSON 404 instead of Express HTML', async () => {
  const response = await fetch(`${baseUrl}/api/does-not-exist`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.equal(body.error.code, 'NOT_FOUND');
  assert.equal(typeof body.error.message, 'string');
  assert.ok(!('files' in body) && !('summary' in body));
});

test('malformed JSON returns a JSON 400 without a stack trace', async () => {
  const response = await postJson('{ this is not json');
  const text = await response.text();
  const body = JSON.parse(text);

  assert.equal(response.status, 400);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.equal(body.error.code, 'INVALID_JSON');
  assert.equal(typeof body.error.message, 'string');
  assert.ok(!text.includes('stack'));
  assert.ok(!/at .+\(.+:\d+:\d+\)/.test(text));
  assert.ok(!('files' in body) && !('summary' in body));
});

test('bodies over the parser limit return a JSON 413', async () => {
  const response = await postJson({
    files: [{ filename: 'large.txt', content: 'a'.repeat(6 * 1024 * 1024) }],
  });
  const body = await response.json();

  assert.equal(response.status, 413);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.equal(body.error.code, 'PAYLOAD_TOO_LARGE');
  assert.equal(typeof body.error.message, 'string');
  assert.ok(!('files' in body) && !('summary' in body));
});

test('valid scan requests still use the existing response contract', async () => {
  const response = await postJson({
    files: [{ filename: 'clean.js', content: 'const port = process.env.PORT;' }],
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.summary.filesScanned, 1);
  assert.equal(body.summary.findingsCount, 0);
  assert.deepEqual(body.files[0].findings, []);
});
