'use strict';

/**
 * Synthetic clean fixture: ordinary application code with no credentials.
 *
 * Scanning the exported `content` should produce zero findings. Credentials are
 * read from the environment, URLs are plain local development addresses, and
 * every identifier is an everyday word rather than a random-looking token.
 */

const content = [
  "'use strict';",
  '',
  '// Health endpoint polled by the deployment checks.',
  'function handleHealth(request, response) {',
  '  response.status(200).json({ status: "ok", service: "commit-sins" });',
  '}',
  '',
  '// Deployment settings come from the environment, never from source.',
  'const port = Number(process.env.PORT) || 5000;',
  'const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";',
  '',
  'function buildReport(findings) {',
  '  return { count: findings.length, checkedAt: new Date().toISOString() };',
  '}',
  '',
  'function describeSeverity(severity) {',
  '  switch (severity) {',
  '    case "critical":',
  '      return "Rotate this credential immediately.";',
  '    case "high":',
  '      return "Rotate this credential before merging.";',
  '    default:',
  '      return "Review this finding during triage.";',
  '  }',
  '}',
  '',
  'module.exports = { handleHealth, buildReport, describeSeverity, port, clientUrl };',
  '',
].join('\n');

module.exports = { content };
