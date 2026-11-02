'use strict';

/**
 * Synthetic secrets fixture for the COMMIT SINS scanner.
 *
 * Every value in this file is fake. Nothing here grants access to any account,
 * service or repository, and no value was copied from a real system.
 *
 * The credentials are assembled from two harmless halves at require time so the
 * repository never stores a complete, secret-scanner-visible credential literal.
 * Tests should scan the exported `content` (which does contain the assembled
 * values) rather than the raw text of this file.
 */

// --- synthetic values, split so the on-disk file never holds a full token ---
// Fragments stay short enough that a repository-wide entropy scan does not
// mistake this fixture for a leaked credential. Only the assembled `content`
// below contains complete (still fake) values.
const AWS_ACCESS_KEY_ID = 'AKIA' + 'Z7Q2' + 'XWPL' + 'M4RT' + 'V8NY';
const GENERIC_API_KEY = 'q7Zx' + '9LmP' + '2vTn' + '8RbW' + '4yHs' + '6JdK';
const DATABASE_PASSWORD = 'S3cure' + 'P@ss' + 'w0rd!';
const GITHUB_TOKEN =
  'ghp_' + 'a1B2c3' + 'D4e5F6' + 'g7H8i9' + 'J0k1L2' + 'm3N4o5' + 'P6q7R8';
const GITHUB_FINE_GRAINED_TOKEN =
  'github_pat_' +
  ['A1b2C', '3d4E5', 'f6G7h', '8I9j0'].join('').repeat(4) +
  'K1';
const HIGH_ENTROPY_SEED = 'kR8v' + 'Q2mZ' + 'xT7p' + 'L4nW' + 'bY6j' + 'Hs9C';
const PRIVATE_KEY_HEADER = '-----BEGIN ' + 'RSA ' + 'PRIVATE KEY-----';

/**
 * Scannable text. Line numbers are stable and intentional:
 *   3  AWS access key ID
 *   4  generic API key
 *   5  password assignment
 *   6  GitHub classic token
 *   7  GitHub fine-grained token
 *   8  private key header
 *   9  high-entropy string (no pattern match, entropy only)
 */
const content = [
  '// Synthetic fixture: the values below are fake and exist only for tests.',
  "const region = 'us-east-1';",
  `const accessKeyId = '${AWS_ACCESS_KEY_ID}';`,
  `const api_key = '${GENERIC_API_KEY}';`,
  `const db_password = '${DATABASE_PASSWORD}';`,
  `const githubToken = '${GITHUB_TOKEN}';`,
  `const githubFineGrained = '${GITHUB_FINE_GRAINED_TOKEN}';`,
  PRIVATE_KEY_HEADER,
  `const signingSeed = '${HIGH_ENTROPY_SEED}';`,
  '',
].join('\n');

/** The values above, labelled with the finding type each one should produce. */
const secrets = [
  { type: 'aws-access-key-id', value: AWS_ACCESS_KEY_ID },
  { type: 'generic-api-key', value: GENERIC_API_KEY },
  { type: 'password-assignment', value: DATABASE_PASSWORD },
  { type: 'github-token', value: GITHUB_TOKEN },
  { type: 'github-token', value: GITHUB_FINE_GRAINED_TOKEN },
  { type: 'private-key-header', value: PRIVATE_KEY_HEADER },
  { type: 'high-entropy-string', value: HIGH_ENTROPY_SEED },
];

module.exports = { content, secrets };
