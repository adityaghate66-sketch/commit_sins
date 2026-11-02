'use strict';

/**
 * Synthetic false-positive fixture: values that look secret-ish but are inert.
 *
 * Scanning the exported `content` should produce zero findings. It covers the
 * usual documentation patterns (YOUR_API_KEY_HERE, EXAMPLE_TOKEN, CHANGE_ME),
 * environment and template references, empty values, a public key header, a
 * filler run, a low-entropy commit SHA and a placeholder UUID.
 */

const content = [
  '// Synthetic false-positive fixture: placeholder and inert values only.',
  '',
  'const placeholders = {',
  '  apiKey: "YOUR_API_KEY_HERE",',
  '  token: "EXAMPLE_TOKEN",',
  '  password: "CHANGE_ME",',
  '  webhook: "https://example.com/hooks/your-webhook-url",',
  '};',
  '',
  'const localConfig = {',
  '  api_key: process.env.API_KEY,',
  '  client_secret: "${CLIENT_SECRET}",',
  '  auth_token: "<your-token-here>",',
  '  db_password: "",',
  '  publicKeyHeader: "-----BEGIN PUBLIC KEY-----",',
  '  filler: "xxxxxxxxxxxxxxxxxxxxxxxx",',
  '  commitSha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",',
  '  requestId: "a1b2a1b2-a1b2-4a1b-8a1b-a1b2a1b2a1b2",',
  '};',
  '',
  'module.exports = { placeholders, localConfig };',
  '',
].join('\n');

module.exports = { content };
