'use strict';

/**
 * Integration tests for the COMMIT SINS pre-commit hook.
 *
 * Each test builds a throwaway Git repository, copies in the launcher, the
 * scanner and the detection engine, then runs the hook exactly the way Git
 * would. Nothing here touches the real repository or the real .git/hooks
 * directory, and every credential below is synthetic and assembled at run time
 * so the fixture itself never contains a complete-looking secret.
 *
 * Run with:  cd backend && npm test
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_LAUNCHER = path.join(PROJECT_ROOT, 'hooks', 'pre-commit');
const HOOK_SCRIPT = path.join(PROJECT_ROOT, 'hooks', 'pre-commit.cjs');
const HOOK_INSTALLER = path.join(PROJECT_ROOT, 'scripts', 'install-hooks.js');
const ENGINE_DIRECTORY = path.join(PROJECT_ROOT, 'backend', 'src', 'engine');

// Synthetic credentials, split so this test file is not itself a finding.
const AWS_KEY = 'AKIA' + 'Z7Q2' + 'XWPL' + 'M4RT' + 'V8NY';
const GITHUB_TOKEN =
  'ghp_' + 'a1B2c3' + 'D4e5F6' + 'g7H8i9' + 'J0k1L2' + 'm3N4o5' + 'P6q7R8';
const PRIVATE_KEY = '-----BEGIN ' + 'RSA ' + 'PRIVATE KEY-----';

/** Create an isolated repository with the hook and engine installed. */
function createRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-sins-hook-'));

  fs.cpSync(ENGINE_DIRECTORY, path.join(root, 'backend', 'src', 'engine'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
  fs.copyFileSync(HOOK_SCRIPT, path.join(root, 'hooks', 'pre-commit.cjs'));
  fs.copyFileSync(HOOK_LAUNCHER, path.join(root, 'hooks', 'pre-commit'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.copyFileSync(HOOK_INSTALLER, path.join(root, 'scripts', 'install-hooks.js'));

  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.name', 'COMMIT SINS Test']);
  git(root, ['config', 'user.email', 'test@example.invalid']);
  git(root, ['config', 'commit.gpgsign', 'false']);

  return root;
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function write(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function stage(root, relativePath) {
  git(root, ['add', '--', relativePath]);
}

/** Run the shell launcher exactly as Git would invoke .git/hooks/pre-commit. */
function runHook(root) {
  return spawnSync('sh', [path.join(root, 'hooks', 'pre-commit')], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('allows a clean staged file', () => {
  const root = createRepository();
  try {
    write(root, 'app.js', 'const name = "demo";\nconsole.log(name);\n');
    stage(root, 'app.js');

    const result = runHook(root);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /No secrets detected/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('blocks a staged synthetic secret and masks its value', () => {
  const root = createRepository();
  try {
    write(
      root,
      'config.js',
      `const region = "us-east-1";\nconst key = "${AWS_KEY}";\n`
    );
    stage(root, 'config.js');

    const result = runHook(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Commit blocked/);
    assert.match(result.stderr, /config\.js:2/);
    assert.match(result.stderr, /CRITICAL/);
    assert.match(result.stderr, /aws-access-key-id/);
    assert.match(result.stderr, /masked \*+/);
    assert.match(result.stderr, /Rotate|rotate|revoke/i);
    assert.ok(
      !result.stdout.includes(AWS_KEY) && !result.stderr.includes(AWS_KEY),
      'raw value must never be printed'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scans the staged blob even when the working tree was edited to look clean', () => {
  const root = createRepository();
  try {
    write(root, 'config.js', `const token = "${GITHUB_TOKEN}";\n`);
    stage(root, 'config.js');

    // Replace the working-tree copy with clean code after staging. A hook that
    // scanned the working tree would wrongly allow this commit.
    write(root, 'config.js', 'const token = "removed";\n');

    const result = runHook(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /github-token/);
    assert.ok(!result.stderr.includes(GITHUB_TOKEN));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ignores a working-tree secret that was never staged', () => {
  const root = createRepository();
  try {
    write(root, 'app.js', 'const safe = true;\n');
    stage(root, 'app.js');

    // This file is untracked, so the hook must not read it.
    write(root, 'scratch.js', `const key = "${AWS_KEY}";\n`);

    const result = runHook(root);

    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('handles a deleted file without a false finding', () => {
  const root = createRepository();
  try {
    write(root, 'old.js', `const key = "${AWS_KEY}";\n`);
    stage(root, 'old.js');
    git(root, ['commit', '--quiet', '-m', 'add old file']);

    fs.rmSync(path.join(root, 'old.js'));
    stage(root, 'old.js');

    const result = runHook(root);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /no staged files|No secrets detected/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scans every staged file when several are committed together', () => {
  const root = createRepository();
  try {
    write(root, 'a-clean.js', 'export const answer = 42;\n');
    write(root, 'b-secret.js', `const key = "${AWS_KEY}";\n`);
    write(root, 'c-private.pem', `${PRIVATE_KEY}\nMIIBVAIBADANBgkq\n`);

    stage(root, 'a-clean.js');
    stage(root, 'b-secret.js');
    stage(root, 'c-private.pem');

    const result = runHook(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /b-secret\.js:1/);
    assert.match(result.stderr, /c-private\.pem:1/);
    assert.match(result.stderr, /aws-access-key-id/);
    assert.match(result.stderr, /private-key-header/);
    assert.ok(!result.stderr.includes(AWS_KEY));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('skips a staged binary file', () => {
  const root = createRepository();
  try {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0xff, 0x00, 0x41, 0x42]);
    const binaryPath = path.join(root, 'image.bin');
    fs.writeFileSync(binaryPath, binary);
    stage(root, 'image.bin');

    const result = runHook(root);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /no staged text files|No secrets detected/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('allows a renamed clean file', () => {
  const root = createRepository();
  try {
    write(root, 'before.js', 'export const region = "us-east-1";\n');
    stage(root, 'before.js');
    git(root, ['commit', '--quiet', '-m', 'add before.js']);

    git(root, ['mv', 'before.js', 'after.js']);

    const result = runHook(root);

    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed when the detection engine is missing', () => {
  const root = createRepository();
  try {
    write(root, 'app.js', 'const safe = true;\n');
    stage(root, 'app.js');

    fs.rmSync(path.join(root, 'backend'), { recursive: true, force: true });

    const result = runHook(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /detection engine could not be loaded/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
