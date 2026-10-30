'use strict';

/**
 * COMMIT SINS — core secret scanning engine.
 *
 * Takes the text of a single file, runs every configured pattern line by line,
 * adds Shannon entropy checks for values no pattern captured, and returns
 * structured findings plus a summary.
 *
 * Privacy contract: this module never returns or logs raw secret material.
 * Every detected value is masked before it leaves a scan, and there is no
 * console output anywhere in this file, so callers cannot leak a credential by
 * printing or shipping the result.
 */

const crypto = require('crypto');

const { patterns: LIBRARY_PATTERNS } = require('./patterns');
const {
  findHighEntropyStrings,
  DEFAULT_OPTIONS: ENTROPY_DEFAULTS,
} = require('./entropy');

/** Type id used for findings that come from entropy alone. */
const ENTROPY_TYPE = 'high-entropy-string';

/** Entropy is a hint, never proof, so it never outranks a pattern match. */
const ENTROPY_SEVERITY = 'low';

/** Longest mask emitted; the real scalar length is reported separately. */
const MAX_MASK_LENGTH = 8;

/** Most severe first, used to pick the headline severity of a scan. */
const SEVERITY_ORDER = Object.freeze(['critical', 'high', 'medium', 'low']);

/**
 * Defaults for scanContent.
 *
 * patterns        null means the shared library in patterns.js
 * enableEntropy   add entropy candidates for values no pattern matched
 * entropyThreshold / entropyMinLength  forwarded to entropy.js
 * maxFindings     hard cap so a huge file cannot produce an unbounded report
 */
const DEFAULT_SCAN_OPTIONS = Object.freeze({
  patterns: null,
  enableEntropy: true,
  entropyThreshold: ENTROPY_DEFAULTS.threshold,
  entropyMinLength: ENTROPY_DEFAULTS.minLength,
  maxFindings: 500,
});

/**
 * Fix-it guidance per finding type. Advice only — the scanner never edits files
 * and never tries to rewrite Git history on its own.
 */
const REMEDIATION = Object.freeze({
  'aws-access-key-id':
    'Revoke the key in AWS IAM (deactivate, then delete), issue a replacement, ' +
    'and supply it from an environment variable or secrets manager. Rotate before ' +
    'rewriting Git history.',
  'github-token':
    'Revoke the token under GitHub → Settings → Developer settings → Personal ' +
    'access tokens, issue a replacement with the narrowest scopes, and inject it ' +
    'at runtime instead of committing it.',
  'slack-token':
    'Revoke the token in the Slack app configuration (reinstalling the app ' +
    'invalidates it), then keep the replacement outside the repository.',
  'generic-api-key':
    'Rotate the credential with its provider, load the replacement from an ' +
    'environment variable or secrets manager, and remove this value from version ' +
    'history.',
  'password-assignment':
    'Change the password everywhere it is used, move it to a secrets manager or ' +
    'environment variable, and purge the value from Git history.',
  'private-key-header':
    'Treat the private key as compromised: generate a new key pair, register the ' +
    'new public key with the service, and remove the old key from the repository ' +
    'and its history.',
  [ENTROPY_TYPE]:
    'Confirm whether this random-looking string is a credential. If it is, rotate ' +
    'it and move it out of the repository; if it is a hash, lockfile entry or ' +
    'generated asset, record it as a false positive.',
});

const DEFAULT_REMEDIATION =
  'Treat the value as compromised: rotate it with the provider, store the ' +
  'replacement in an environment variable or secrets manager, and purge it from ' +
  'version history.';

/**
 * Mask a detected value so a report can be shared safely.
 * Only asterisks are emitted; the character count never exceeds MAX_MASK_LENGTH
 * and no character of the original value is revealed.
 *
 * @param {string} value
 * @returns {string}
 */
function maskSecret(value) {
  if (typeof value !== 'string' || value.length === 0) return '';
  return '*'.repeat(Math.min(value.length, MAX_MASK_LENGTH));
}

/** Accept a string or Buffer and reject anything else with a clear error. */
function normalizeContent(content) {
  if (Buffer.isBuffer(content)) return content.toString('utf8');
  if (typeof content === 'string') return content;
  throw new TypeError('scanContent expects the file content as a string or Buffer');
}

/** Build a global copy of a pattern so every line can iterate all matches. */
function toGlobalRegex(regex) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  return new RegExp(regex.source, flags);
}

/**
 * Resolve the configured rule set into [{ ...pattern, globalRegex }].
 * A malformed entry fails loudly here rather than producing silent misses.
 */
function resolvePatterns(configured) {
  const list = configured == null ? LIBRARY_PATTERNS : configured;
  if (!Array.isArray(list)) {
    throw new TypeError('patterns must be an array of pattern definitions');
  }

  return list.map((pattern) => {
    if (!pattern || typeof pattern.id !== 'string' || !(pattern.regex instanceof RegExp)) {
      throw new TypeError('each pattern needs an id and a RegExp regex');
    }
    return {
      id: pattern.id,
      description: pattern.description || pattern.id,
      severity: pattern.severity || 'medium',
      remediation: pattern.remediation || REMEDIATION[pattern.id] || DEFAULT_REMEDIATION,
      globalRegex: toGlobalRegex(pattern.regex),
    };
  });
}

/** Assemble one finding. The raw value is used only to compute the mask. */
function createFinding({
  filename,
  line,
  column,
  type,
  severity,
  description,
  remediation,
  value,
}) {
  return {
    id: crypto.randomUUID(),
    file: filename,
    line,
    column,
    type,
    severity,
    description,
    maskedValue: maskSecret(value),
    valueLength: value.length,
    remediation,
  };
}

/** True when a candidate range overlaps any range already reported as a hit. */
function overlapsReported(start, end, ranges) {
  return ranges.some(([reportedStart, reportedEnd]) => start < reportedEnd && end > reportedStart);
}

/** Summarise a scan without exposing any matched value. */
function buildSummary({ filename, linesScanned, findings, patternsApplied, settings, truncated }) {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byType = {};

  for (const finding of findings) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
    byType[finding.type] = (byType[finding.type] || 0) + 1;
  }

  return {
    file: filename,
    linesScanned,
    patternsApplied,
    entropyEnabled: settings.enableEntropy,
    findingsCount: findings.length,
    bySeverity,
    byType,
    highestSeverity: SEVERITY_ORDER.find((severity) => bySeverity[severity] > 0) || null,
    truncated,
  };
}

/**
 * Scan one file's content.
 *
 * Line numbers are 1-based and refer to the physical lines of `content`
 * (`\n`, `\r\n` and lone `\r` all count as breaks). Columns are 1-based
 * character offsets within the line.
 *
 * @param {string|Buffer} content raw file text
 * @param {string} [filename] reported file name, never used for I/O
 * @param {object} [options] overrides for DEFAULT_SCAN_OPTIONS
 * @returns {{ file: string, summary: object, findings: object[] }}
 */
function scanContent(content, filename = '<unknown>', options = {}) {
  const settings = { ...DEFAULT_SCAN_OPTIONS, ...(options || {}) };
  const text = normalizeContent(content);
  const activePatterns = resolvePatterns(settings.patterns);

  const maxFindings = Number.isFinite(settings.maxFindings)
    ? Math.max(1, Math.floor(settings.maxFindings))
    : DEFAULT_SCAN_OPTIONS.maxFindings;

  const lines = text.length === 0 ? [] : text.split(/\r\n|\r|\n/);
  const findings = [];
  let truncated = false;

  for (let index = 0; index < lines.length; index += 1) {
    if (findings.length >= maxFindings) {
      truncated = true;
      break;
    }

    const line = lines[index];
    const lineNumber = index + 1;
    const reportedRanges = [];
    const lineFindings = [];
    const seenColumns = new Set();

    if (line.length > 0) {
      // 3 + 4 — every configured pattern, at every position on the line.
      for (const pattern of activePatterns) {
        for (const match of line.matchAll(pattern.globalRegex)) {
          const value = match[0];
          if (!value) continue;

          const column = match.index + 1;
          const dedupeKey = `${pattern.id}:${column}`;
          if (seenColumns.has(dedupeKey)) continue;
          seenColumns.add(dedupeKey);

          reportedRanges.push([match.index, match.index + value.length]);
          lineFindings.push(
            createFinding({
              filename,
              line: lineNumber,
              column,
              type: pattern.id,
              severity: pattern.severity,
              description: pattern.description,
              remediation: pattern.remediation,
              value,
            })
          );
        }
      }

      // 4 — entropy only for values no pattern already explained.
      if (settings.enableEntropy && line.length >= settings.entropyMinLength) {
        const candidates = findHighEntropyStrings(line, {
          threshold: settings.entropyThreshold,
          minLength: settings.entropyMinLength,
        });

        for (const candidate of candidates) {
          const start = candidate.index;
          const end = start + candidate.value.length;
          if (overlapsReported(start, end, reportedRanges)) continue;

          lineFindings.push(
            createFinding({
              filename,
              line: lineNumber,
              column: start + 1,
              type: ENTROPY_TYPE,
              severity: ENTROPY_SEVERITY,
              description:
                'Random-looking string with high Shannon entropy; entropy alone is ' +
                'not proof of a secret, so confirm before reporting it as a leak.',
              remediation: REMEDIATION[ENTROPY_TYPE],
              value: candidate.value,
            })
          );
        }
      }
    }

    lineFindings.sort((a, b) => a.column - b.column);

    for (const finding of lineFindings) {
      if (findings.length >= maxFindings) {
        truncated = true;
        break;
      }
      findings.push(finding);
    }
  }

  return {
    file: filename,
    summary: buildSummary({
      filename,
      linesScanned: lines.length,
      findings,
      patternsApplied: activePatterns.length,
      settings,
      truncated,
    }),
    findings,
  };
}

module.exports = {
  scanContent,
  maskSecret,
  DEFAULT_SCAN_OPTIONS,
  SEVERITY_ORDER,
  REMEDIATION,
};
