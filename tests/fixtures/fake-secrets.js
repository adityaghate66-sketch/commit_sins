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
const AWS_ACCESS_KEY_ID = 'AKIA' + 'Z7Q2XWPLM4RTV8NY';
const GENERIC_API_KEY = 'q7Zx' + '9LmP2vTn8RbW4yHs6JdK';
const DATABASE_PASSWORD = 'S3cure' + 'P@ssw0rd!';
const GITHUB_TOKEN = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
const GITHUB_FINE_GRAINED_TOKEN =
  'github_pat_' + 'A1b2C3d4E5f6G7h8I9j0'.repeat(4) + 'K1';
const HIGH_ENTROPY_SEED = 'kR8vQ2mZ' + 'xT7pL4nWbY6jHs9C';

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
  '-----BEGIN RSA PRIVATE KEY-----',
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
  { type: 'private-key-header', value: '-----BEGIN RSA PRIVATE KEY-----' },
  { type: 'high-entropy-string', value: HIGH_ENTROPY_SEED },
];

module.exports = { content, secrets };
