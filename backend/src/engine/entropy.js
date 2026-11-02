'use strict';

/**
 * COMMIT SINS — Shannon entropy helpers.
 *
 * Shannon entropy measures how unpredictable the character distribution of a
 * string is, in bits per character:
 *
 *   H = -Σ p(c) · log2 p(c)
 *
 * A value built from a random alphabet scores high (base64 tops out near 6
 * bits/char); repeated or natural-language text scores low. That makes entropy
 * a useful way to spot hardcoded keys that no fixed regex will ever list.
 *
 * IMPORTANT — entropy is a hint, never a verdict. Hashes, UUIDs, minified code,
 * base64 assets and lockfile fragments are all high entropy and perfectly
 * benign, while weak human-chosen passwords can sit well below any threshold.
 * Every result from this module describes a *candidate for review*; nothing
 * here should be reported as proof that a secret leaked.
 *
 * Also note the ceiling: a string drawn from an N-character alphabet can never
 * exceed log2(N) bits/char, so hex-only values (alphabet 16) max out at 4.0.
 * Use a lower threshold (~3.5) for hex-specific checks; the default here is
 * tuned for mixed-case base64-ish tokens.
 */

/** Reminder attached to any finding produced by this module. */
const ENTROPY_DISCLAIMER =
  'High entropy is a heuristic signal only: random-looking text can be benign ' +
  '(hashes, UUIDs, base64 assets) and real secrets can be low entropy. Treat ' +
  'these results as review candidates, not as proof of a leaked credential.';

/**
 * Defaults for the analysis helpers.
 *
 * minLength                strings shorter than this are not meaningful: too
 *                          few characters for a stable distribution
 * threshold                minimum bits per character to flag a candidate
 * minDistinctCharacters    guards against "aaaa...b" style near-repeats
 * requireMixedCharacterClasses  require at least two of lowercase / uppercase /
 *                          digits / symbols, which filters plain words
 * requireDigitOrSymbol     a purely alphabetic run is far more likely to be a
 *                          camelCase identifier ("dangerouslySetInnerHTML") than
 *                          a generated credential; require at least one digit or
 *                          a strong separator such as - + / =
 * rejectWhitespace         prose contains spaces; credentials essentially never do
 * maxLowercaseRatio        natural-language words and URL/path slugs are almost
 *                          entirely lowercase, random tokens are not
 */
const DEFAULT_OPTIONS = Object.freeze({
  minLength: 16,
  threshold: 4.0,
  minDistinctCharacters: 10,
  requireMixedCharacterClasses: true,
  requireDigitOrSymbol: true,
  rejectWhitespace: true,
  maxLowercaseRatio: 0.8,
});

/** `https://`, `git+ssh://`, ... a credential never carries a URL scheme. */
const URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

/** `/webdev.v1.Service/Method` — an RPC route, not a credential. */
const ROUTE_PATTERN = /^\/[A-Za-z0-9._/-]+$/;

/** `images.v1.ImageService/ListModels` — a protobuf service route. */
const SERVICE_PATH_PATTERN = /^[A-Za-z][A-Za-z0-9]*\.v\d+\.[A-Za-z0-9]+\//;

/** Values that are obviously documentation rather than credentials. */
const PLACEHOLDER_PATTERN =
  /^(?:your|my|our|example|sample|demo|dummy|fake|mock|test|placeholder|changeme|change[_-]?me|replace[_-]?me|insert|todo|redacted|none|null|undefined|password|passwd|secret|token|api[_-]?key)/i;

/** Eight or more identical characters in a row, e.g. `xxxxxxxx`. */
const REPEATED_RUN_PATTERN = /(.)\1{7,}/;

/** Merge caller overrides onto the defaults. */
function resolveOptions(options) {
  return { ...DEFAULT_OPTIONS, ...(options || {}) };
}

/** Round to three decimals so reports stay readable. */
function round(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Calculate the Shannon entropy of a string in bits per character.
 *
 * Empty, non-string and too-short inputs return 0 instead of NaN, so callers
 * can use the result without guarding first. Pass `{ minLength: 0 }` to score
 * any non-empty string, including very short ones (useful for tests).
 *
 * @param {string} input
 * @param {{ minLength?: number }} [options]
 * @returns {number} entropy in bits per character (0 when ignored)
 */
function calculateEntropy(input, options = {}) {
  if (typeof input !== 'string') return 0;

  const minLength = Number.isFinite(options.minLength)
    ? options.minLength
    : DEFAULT_OPTIONS.minLength;

  // Count by code point so surrogate pairs (emoji) count as one character.
  const characters = Array.from(input);
  const length = characters.length;

  if (length === 0 || length < minLength) return 0;

  const frequencies = new Map();
  for (const character of characters) {
    frequencies.set(character, (frequencies.get(character) || 0) + 1);
  }

  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / length;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

/** Count of ASCII lowercase letters in a value. */
function countLowercaseLetters(value) {
  const matches = value.match(/[a-z]/g);
  return matches ? matches.length : 0;
}

/**
 * How many distinct character classes a value uses out of four:
 * lowercase, uppercase, digits, symbols.
 */
function characterClassCount(value) {
  let count = 0;
  if (/[a-z]/.test(value)) count += 1;
  if (/[A-Z]/.test(value)) count += 1;
  if (/[0-9]/.test(value)) count += 1;
  if (/[^A-Za-z0-9\s]/.test(value)) count += 1;
  return count;
}

/**
 * Score a single string and explain the outcome.
 *
 * The `reasons` array always records why a value was accepted or rejected,
 * which keeps later reporting honest and makes thresholds tunable.
 *
 * @param {string} input
 * @param {object} [options] overrides for DEFAULT_OPTIONS
 * @returns {{
 *   value: string,
 *   length: number,
 *   entropy: number,
 *   distinctCharacters: number,
 *   threshold: number,
 *   isSuspicious: boolean,
 *   reasons: string[]
 * }}
 */
function analyzeString(input, options = {}) {
  const settings = resolveOptions(options);

  const analysis = {
    value: typeof input === 'string' ? input : '',
    length: typeof input === 'string' ? Array.from(input).length : 0,
    entropy: 0,
    distinctCharacters: 0,
    threshold: settings.threshold,
    isSuspicious: false,
    reasons: [],
  };

  if (typeof input !== 'string' || input.length === 0) {
    analysis.reasons.push('not a non-empty string');
    return analysis;
  }

  // Score the full value here; the length gate is applied below so a caller can
  // still see the entropy of a short string for debugging.
  analysis.entropy = calculateEntropy(input, { minLength: 0 });
  analysis.distinctCharacters = new Set(Array.from(input)).size;

  if (analysis.length < settings.minLength) {
    analysis.reasons.push(
      `shorter than minLength (${analysis.length} < ${settings.minLength})`
    );
    return analysis;
  }

  if (settings.rejectWhitespace && /\s/.test(input)) {
    analysis.reasons.push('contains whitespace, so it reads as prose not a token');
    return analysis;
  }

  if (analysis.distinctCharacters < settings.minDistinctCharacters) {
    analysis.reasons.push(
      `only ${analysis.distinctCharacters} distinct characters ` +
        `(minimum ${settings.minDistinctCharacters})`
    );
    return analysis;
  }

  if (
    settings.requireMixedCharacterClasses &&
    characterClassCount(input) < 2
  ) {
    analysis.reasons.push(
      'characters come from a single class (letters, digits or symbols only)'
    );
    return analysis;
  }

  if (
    settings.requireDigitOrSymbol &&
    !/[0-9]/.test(input) &&
    !/[+/=\-]/.test(input)
  ) {
    analysis.reasons.push(
      'has no digits or strong separators, so it reads as an identifier or word'
    );
    return analysis;
  }

  if (
    URL_PATTERN.test(input) ||
    ROUTE_PATTERN.test(input) ||
    SERVICE_PATH_PATTERN.test(input) ||
    // `WebDevAuthPublicService/ExchangeToken`-style path segments contain no
    // digits and read as identifiers, not as generated credential material.
    (input.includes('/') && !/[0-9]/.test(input))
  ) {
    analysis.reasons.push('looks like a URL, route or path rather than a credential');
    return analysis;
  }

  const lowercaseRatio = countLowercaseLetters(input) / analysis.length;
  if (lowercaseRatio >= settings.maxLowercaseRatio) {
    analysis.reasons.push(
      `${Math.round(lowercaseRatio * 100)}% lowercase letters, so it reads as a ` +
        'word, slug or path rather than a random token'
    );
    return analysis;
  }

  if (PLACEHOLDER_PATTERN.test(input)) {
    analysis.reasons.push('matches a known placeholder prefix');
    return analysis;
  }

  if (REPEATED_RUN_PATTERN.test(input)) {
    analysis.reasons.push('contains a run of eight or more identical characters');
    return analysis;
  }

  if (analysis.entropy < settings.threshold) {
    analysis.reasons.push(
      `entropy ${round(analysis.entropy).toFixed(2)} is below threshold ` +
        `${settings.threshold}`
    );
    return analysis;
  }

  analysis.isSuspicious = true;
  analysis.reasons.push(
    `entropy ${round(analysis.entropy).toFixed(2)} bits/char meets threshold ` +
      `${settings.threshold}`
  );
  return analysis;
}

/**
 * Convenience predicate over analyzeString.
 *
 * @param {string} input
 * @param {object} [options]
 * @returns {boolean}
 */
function isHighEntropy(input, options = {}) {
  return analyzeString(input, options).isSuspicious;
}

/**
 * Pull high-entropy candidates out of a larger blob of text.
 *
 * Free text is split into token-like runs (letters, digits, `+ / _ -`), each run
 * is scored, and only suspicious runs are returned. Duplicate values are
 * reported once, at their first position, so repeated keys do not inflate a
 * report.
 *
 * @param {string} text
 * @param {object} [options]
 * @returns {Array<{value: string, index: number, length: number, entropy: number, distinctCharacters: number}>}
 */
function findHighEntropyStrings(text, options = {}) {
  const settings = resolveOptions(options);
  if (typeof text !== 'string' || text.length === 0) return [];

  const minimumRun = Math.max(1, Math.floor(settings.minLength));
  // `=` and `.` are deliberately excluded so `NAME=value` splits into a label
  // and a value, and UUID/JWT style separators break tokens into segments.
  const candidatePattern = new RegExp(`[A-Za-z0-9+/_-]{${minimumRun},}`, 'g');

  const findings = [];
  const seen = new Set();

  let match;
  while ((match = candidatePattern.exec(text)) !== null) {
    const candidate = match[0].replace(/[_-]+$/, '');
    if (candidate.length < minimumRun || seen.has(candidate)) continue;

    const analysis = analyzeString(candidate, settings);
    if (!analysis.isSuspicious) continue;

    seen.add(candidate);
    findings.push({
      value: candidate,
      index: match.index,
      length: analysis.length,
      entropy: round(analysis.entropy),
      distinctCharacters: analysis.distinctCharacters,
    });
  }

  return findings;
}

module.exports = {
  calculateEntropy,
  analyzeString,
  isHighEntropy,
  findHighEntropyStrings,
  DEFAULT_OPTIONS,
  ENTROPY_DISCLAIMER,
};
