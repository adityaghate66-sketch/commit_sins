'use strict';

/**
 * Unit tests for the COMMIT SINS detection engine.
 *
 * These tests exercise the scanner directly, without HTTP. Every credential is
 * synthetic and comes from the shared fixtures. Assertions also verify that raw
 * values never appear in a scan result.
 *
 * Run with:  cd backend && npm test
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  scanContent,
  scanFiles,
  maskSecret,
  DEFAULT_SCAN_OPTIONS,
  SEVERITY_ORDER,
  REMEDIATION,
} = require('../src/engine/scanner');
const { calculateEntropy, analyzeString, findHighEntropyStrings } = require('../src/engine/entropy');

const fakeFixture = require('../../tests/fixtures/fake-secrets');
const cleanFixture = require('../../tests/fixtures/clean-file');
const falsePositiveFixture = require('../../tests/fixtures/false-positives');

/** All fixture values for one finding type (GitHub appears twice). */
function valuesFor(type) {
  return fakeFixture.secrets.filter((secret) => secret.type === type).map((secret) => secret.value);
}

const [AWS_KEY] = valuesFor('aws-access-key-id');
const [GENERIC_KEY] = valuesFor('generic-api-key');
const [PASSWORD] = valuesFor('password-assignment');
const GITHUB_TOKENS = valuesFor('github-token');
const [PRIVATE_KEY_HEADER] = valuesFor('private-key-header');
const [ENTROPY_SEED] = valuesFor('high-entropy-string');

test('detects an AWS access key with location, severity and remediation', () => {
  const result = scanContent(fakeFixture.content, 'fixtures/fake-secrets.js');
  const finding = result.findings.find((item) => item.type === 'aws-access-key-id');

  assert.ok(finding, 'expected an AWS finding');
  assert.equal(finding.file, 'fixtures/fake-secrets.js');
  assert.equal(finding.line, 3);
  assert.equal(finding.column, 22);
  assert.equal(finding.severity, 'critical');
  assert.equal(finding.valueLength, 20);
  assert.match(finding.maskedValue, /^\*+$/);
  assert.ok(finding.remediation.length > 20);
});

test('detects classic and fine-grained GitHub tokens on separate lines', () => {
  const result = scanContent(fakeFixture.content, 'fixtures/fake-secrets.js');
  const findings = result.findings.filter((item) => item.type === 'github-token');

  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map((item) => item.line).sort(), [6, 7]);
  assert.ok(findings.every((item) => item.severity === 'critical'));
  assert.deepEqual(findings.map((item) => item.valueLength).sort((a, b) => a - b), [
    GITHUB_TOKENS[0].length,
    GITHUB_TOKENS[1].length,
  ].sort((a, b) => a - b));
});

test('detects a generic API key assignment', () => {
  const result = scanContent(fakeFixture.content, 'fixtures/fake-secrets.js');
  const finding = result.findings.find((item) => item.type === 'generic-api-key');

  assert.ok(finding);
  assert.equal(finding.line, 4);
  assert.equal(finding.severity, 'medium');
  assert.match(finding.maskedValue, /^\*+$/);
});

test('detects a hardcoded password assignment', () => {
  const result = scanContent(fakeFixture.content, 'fixtures/fake-secrets.js');
  const finding = result.findings.find((item) => item.type === 'password-assignment');

  assert.ok(finding);
  assert.equal(finding.line, 5);
  assert.equal(finding.severity, 'high');
});

test('detects a private key header', () => {
  const result = scanContent(fakeFixture.content, 'fixtures/fake-secrets.js');
  const finding = result.findings.find((item) => item.type === 'private-key-header');

  assert.ok(finding);
  assert.equal(finding.line, 8);
  assert.equal(finding.severity, 'critical');
  assert.equal(finding.valueLength, PRIVATE_KEY_HEADER.length);
});

test('detects a Slack token', () => {
  // Split at rest so scanning this test file does not produce a false positive.
  const slackToken =
    'xoxb-' + '1234567890-' + '1234567890-' + 'AbCdEfGh' + 'IjKlMnOp' + 'QrStUvWx';
  const result = scanContent(`const slackToken = '${slackToken}';`, 'fixtures/slack.js');
  const finding = result.findings.find((item) => item.type === 'slack-token');

  assert.ok(finding);
  assert.equal(finding.severity, 'high');
  assert.equal(finding.line, 1);
  assert.match(finding.maskedValue, /^\*+$/);
});

test('detects high-entropy values that no pattern describes', () => {
  const result = scanContent(fakeFixture.content, 'fixtures/fake-secrets.js');
  const finding = result.findings.find((item) => item.type === 'high-entropy-string');

  assert.ok(finding);
  assert.equal(finding.line, 9);
  assert.equal(finding.severity, 'low');
  assert.equal(finding.valueLength, ENTROPY_SEED.length);
});

test('the full fake fixture produces seven expected findings', () => {
  const result = scanContent(fakeFixture.content, 'fixtures/fake-secrets.js');

  assert.equal(result.summary.findingsCount, 7);
  assert.deepEqual(result.summary.bySeverity, { critical: 4, high: 1, medium: 1, low: 1 });
  assert.equal(result.summary.highestSeverity, 'critical');
  assert.equal(result.summary.truncated, false);
  assert.equal(result.summary.entropyEnabled, true);
});

test('clean application code produces zero findings', () => {
  const result = scanContent(cleanFixture.content, 'fixtures/clean-file.js');

  assert.deepEqual(result.findings, []);
  assert.equal(result.summary.findingsCount, 0);
  assert.equal(result.summary.highestSeverity, null);
  assert.equal(result.summary.linesScanned, cleanFixture.content.split('\n').length);
});

test('placeholder and inert values produce zero findings', () => {
  const result = scanContent(falsePositiveFixture.content, 'fixtures/false-positives.js');

  assert.deepEqual(result.findings, []);
  assert.equal(result.summary.findingsCount, 0);
});

test('maskSecret never reveals any character of the value', () => {
  assert.equal(maskSecret(AWS_KEY), '********');
  assert.equal(maskSecret('short'), '*****');
  assert.equal(maskSecret(''), '');
  assert.equal(maskSecret(null), '');
  assert.ok(!maskSecret(AWS_KEY).includes(AWS_KEY.slice(0, 3)));
});

test('accepts Buffer content', () => {
  const result = scanContent(Buffer.from(fakeFixture.content, 'utf8'), 'buffer.js');

  assert.equal(result.summary.findingsCount, 7);
  assert.ok(result.findings.every((item) => item.file === 'buffer.js'));
});

test('empty content is a valid clean scan', () => {
  const result = scanContent('', 'empty.js');

  assert.deepEqual(result.findings, []);
  assert.equal(result.summary.findingsCount, 0);
  assert.equal(result.summary.linesScanned, 0);
  assert.equal(result.summary.highestSeverity, null);
});

test('CRLF and lone CR line endings keep accurate line numbers', () => {
  const crlf = `const first = 1;\r\nconst second = '${AWS_KEY}';\r\n`;
  const cr = `const first = 1;\rconst second = '${AWS_KEY}';\r`;
  const crlfResult = scanContent(crlf, 'crlf.js');
  const crResult = scanContent(cr, 'cr.js');

  assert.equal(crlfResult.findings[0].line, 2);
  assert.equal(crResult.findings[0].line, 2);
});

test('maxFindings caps the report and marks it truncated', () => {
  const content = Array.from({ length: 5 }, () => `const key = '${AWS_KEY}';`).join('\n');
  const result = scanContent(content, 'many.js', { maxFindings: 2 });

  assert.equal(result.findings.length, 2);
  assert.equal(result.summary.findingsCount, 2);
  assert.equal(result.summary.truncated, true);
});

test('entropy can be disabled without affecting pattern findings', () => {
  const result = scanContent(fakeFixture.content, 'fixtures/fake-secrets.js', {
    enableEntropy: false,
  });

  assert.equal(result.summary.findingsCount, 6);
  assert.ok(!result.findings.some((item) => item.type === 'high-entropy-string'));
  assert.equal(result.summary.entropyEnabled, false);
});

test('invalid custom patterns fail loudly', () => {
  assert.throws(
    () => scanContent('const x = 1;', 'x.js', { patterns: [{ id: 'broken' }] }),
    /id and a RegExp regex/,
  );
  assert.throws(() => scanContent('const x = 1;', 'x.js', { patterns: 'nope' }), /patterns must be an array/);
});

test('raw secret values never appear in a scan result', () => {
  const result = scanContent(fakeFixture.content, 'fixtures/fake-secrets.js');
  const serialized = JSON.stringify(result);

  for (const secret of fakeFixture.secrets) {
    assert.ok(!serialized.includes(secret.value), `result leaked a raw ${secret.type} value`);
  }

  assert.ok(!serialized.includes(fakeFixture.content));
  for (const finding of result.findings) {
    assert.ok(!('value' in finding));
    assert.ok(!('match' in finding));
  }
});

test('every detector has remediation guidance and a severity in SEVERITY_ORDER', () => {
  const result = scanContent(fakeFixture.content, 'fixtures/fake-secrets.js');

  assert.deepEqual(SEVERITY_ORDER, ['critical', 'high', 'medium', 'low']);
  for (const finding of result.findings) {
    assert.ok(SEVERITY_ORDER.includes(finding.severity));
    assert.equal(typeof finding.remediation, 'string');
    assert.ok(finding.remediation.length > 20);
  }
  for (const type of [
    'aws-access-key-id',
    'github-token',
    'slack-token',
    'generic-api-key',
    'password-assignment',
    'private-key-header',
    'high-entropy-string',
  ]) {
    assert.equal(typeof REMEDIATION[type], 'string', `missing remediation for ${type}`);
  }
});

test('scanFiles aggregates multiple files with the API contract', () => {
  const result = scanFiles([
    { filename: 'fixtures/clean-file.js', content: cleanFixture.content },
    { filename: 'fixtures/fake-secrets.js', content: fakeFixture.content },
  ]);

  assert.equal(result.files.length, 2);
  assert.equal(result.files[0].summary.findingsCount, 0);
  assert.equal(result.files[1].summary.findingsCount, 7);
  assert.equal(result.summary.filesScanned, 2);
  assert.equal(result.summary.findingsCount, 7);
  assert.deepEqual(result.summary.bySeverity, { critical: 4, high: 1, medium: 1, low: 1 });
  assert.equal(result.summary.highestSeverity, 'critical');
  assert.equal(result.summary.truncated, false);
});

test('scanFiles accepts the dashboard fileName alias', () => {
  const result = scanFiles([{ fileName: 'src/config.ts', content: `const key = '${AWS_KEY}';` }]);

  assert.equal(result.files[0].file, 'src/config.ts');
  assert.equal(result.summary.findingsCount, 1);
});

test('scanFiles handles an empty file in the aggregate', () => {
  const result = scanFiles([{ filename: 'empty.js', content: '' }]);

  assert.equal(result.summary.filesScanned, 1);
  assert.equal(result.summary.findingsCount, 0);
  assert.equal(result.files[0].summary.linesScanned, 0);
});

test('scanFiles rejects malformed input', () => {
  assert.throws(() => scanFiles('nope'), /expects an array/);
  assert.throws(() => scanFiles([null]), /entry 0 must be an object/);
  assert.throws(() => scanFiles([{ content: 'x' }]), /entry 0 needs a filename/);
});

test('scanner defaults are exposed and immutable', () => {
  assert.equal(DEFAULT_SCAN_OPTIONS.enableEntropy, true);
  assert.equal(DEFAULT_SCAN_OPTIONS.maxFindings, 500);
  assert.ok(Object.isFrozen(DEFAULT_SCAN_OPTIONS));
  assert.ok(Object.isFrozen(SEVERITY_ORDER));
  assert.ok(Object.isFrozen(REMEDIATION));
});

test('entropy helpers score random strings above placeholders', () => {
  assert.equal(calculateEntropy(''), 0);
  assert.equal(calculateEntropy('aaaaaaaaaaaaaaaa'), 0);
  assert.ok(calculateEntropy(ENTROPY_SEED, { minLength: 0 }) > 4);
  assert.equal(analyzeString(ENTROPY_SEED).isSuspicious, true);
  assert.equal(analyzeString('YOUR_API_KEY_HERE').isSuspicious, false);
  assert.equal(findHighEntropyStrings('short').length, 0);
});
