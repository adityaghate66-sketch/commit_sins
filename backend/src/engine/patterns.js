/**
 * COMMIT SINS — secret detection pattern library.
 *
 * Each entry describes one class of credential:
 *   id          stable identifier used by reports and configuration
 *   description human readable explanation of what is matched
 *   severity    'critical' | 'high' | 'medium' | 'low'
 *   regex       a stateless RegExp (no /g flag) so repeated .test() calls
 *               never depend on a stale lastIndex
 *
 * The patterns are deliberately conservative about documentation values:
 * obvious placeholders (YOUR_API_KEY_HERE, EXAMPLE_TOKEN, CHANGE_ME) and
 * filler runs such as xxxxxxxx are rejected on the value side of each regex,
 * so a match is a better signal that a real credential is present.
 *
 * To scan a document, build a fresh global copy per subject:
 *   const re = new RegExp(pattern.regex.source, `${pattern.regex.flags}g`);
 *   const matches = [...subject.matchAll(re)];
 */

const SEVERITY = Object.freeze({
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
});

/**
 * Guard applied immediately before a captured credential value.
 * Rejects runtime references, template markers, documentation words and
 * repeated-character filler. Kept as a string so it can be reused in the
 * RegExp constructors below without duplicating the rules.
 */
const VALUE_PLACEHOLDER_GUARD = [
  // process.env.X, ${VAR}, <PLACEHOLDER>, {{ var }}
  '(?!(?:process\\.env|\\$\\{|<|\\{\\{))',
  // your / example / changeme / todo ... prefixed values
  '(?!(?:your|my|our|example|sample|demo|dummy|fake|mock|test|placeholder|changeme|change[_-]?me|replace[_-]?me|insert|todo|redacted|none|null|undefined|password|passwd|secret|token))',
  // property access on a local object, e.g. `token.accessToken` or `config.apiKey`
  '(?![A-Za-z_$][A-Za-z0-9_$]*\\.[A-Za-z_$])',
  // xxxxxxxx style filler
  '(?![A-Za-z0-9_\\-]*[Xx]{8})',
].join('');

/** Labels that introduce an API key style credential, e.g. `api_key:`. */
const API_KEY_LABEL =
  '(?:api[_-]?key|apikey|api[_-]?secret|app[_-]?secret|client[_-]?secret|' +
  'secret[_-]?key|access[_-]?token|auth[_-]?token)';

/** Labels that introduce a password style credential, e.g. `db_password =`. */
const PASSWORD_LABEL = '(?:db[_-]?)?(?:password|passwd|pwd|passphrase)';

/**
 * Password value shapes: a quoted string (which may contain spaces, as in a
 * passphrase) or a single bare token. The placeholder guard is repeated inside
 * each quoted form so the quote itself cannot smuggle a placeholder through.
 */
const PASSWORD_VALUE = [
  '(?:"' + VALUE_PLACEHOLDER_GUARD + '[^"\\r\\n]{8,}")',
  "(?:'" + VALUE_PLACEHOLDER_GUARD + "[^'\\r\\n]{8,}')",
  '(?:`' + VALUE_PLACEHOLDER_GUARD + '[^`\\r\\n]{8,}`)',
  // An unquoted value must be a standalone token. Excluding brackets,
  // parentheses and quotes stops code such as `password = body.files[0]`
  // from being mistaken for a credential.
  '(?:' +
    VALUE_PLACEHOLDER_GUARD +
    '[A-Za-z0-9_+./=!@#$%^&*-]{8,})(?=["\'`;,\\s}]|$)',
].join('|');

const patterns = [
  {
    id: 'aws-access-key-id',
    description:
      'AWS access key ID for long-lived or STS temporary credentials (AKIA, ASIA and related prefixes).',
    severity: SEVERITY.CRITICAL,
    // Rejects the documented sample key whose body ends in EXAMPLE.
    regex:
      /\b(?:AKIA|ASIA|ABIA|ACCA|AGPA|AIDA|AIPA|ANPA|ANVA|APKA|AROA|ASCA)(?![0-9A-Z]*EXAMPLE)[0-9A-Z]{16}\b/,
  },
  {
    id: 'github-token',
    description:
      'GitHub personal access, OAuth, app, server-to-server or fine-grained token.',
    severity: SEVERITY.CRITICAL,
    regex:
      /\b(?:gh[pousr]_(?![A-Za-z0-9]*[Xx]{8})[A-Za-z0-9]{36}|github_pat_(?![A-Za-z0-9_]*[Xx]{8})[A-Za-z0-9_]{82})\b/,
  },
  {
    id: 'slack-token',
    description:
      'Slack bot, user, app-level or legacy workspace token (xox* and xapp-).',
    severity: SEVERITY.HIGH,
    regex:
      /\b(?:xox[baprs]-(?![A-Za-z0-9-]*[Xx]{8})[A-Za-z0-9]{10,}(?:-[A-Za-z0-9]{10,}){0,2}|xapp-\d-[A-Z0-9]{6,}-\d{10,}-(?![A-Za-z0-9]*[Xx]{8})[A-Za-z0-9]{20,})\b/,
  },
  {
    id: 'generic-api-key',
    description:
      'High-entropy value assigned to an API key, client secret or access token field.',
    severity: SEVERITY.MEDIUM,
    regex: new RegExp(
      '\\b' +
        API_KEY_LABEL +
        '["\']?\\s*[:=]\\s*["\'`]?' +
        VALUE_PLACEHOLDER_GUARD +
        '[A-Za-z0-9_\\-.+/=]{16,}' +
        // The value must end like a standalone token, so a call expression
        // such as `API_KEY = encodeURIComponent(...)` is not a finding.
        '(?=["\'`;,\\s}\\)]|$)',
      'i'
    ),
  },
  {
    id: 'password-assignment',
    description:
      'Hardcoded password or passphrase assigned in source or configuration.',
    severity: SEVERITY.HIGH,
    // Requires at least 8 characters so empty or elided values are ignored.
    regex: new RegExp(
      '\\b' + PASSWORD_LABEL + '\\b["\']?\\s*[:=]\\s*(?:' + PASSWORD_VALUE + ')',
      'i'
    ),
  },
  {
    id: 'private-key-header',
    description:
      'PEM or PGP private key block header (RSA, EC, DSA, OpenSSH, encrypted or PGP).',
    severity: SEVERITY.CRITICAL,
    regex: /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY(?: BLOCK)?-----/,
  },
];

module.exports = { patterns, SEVERITY };
