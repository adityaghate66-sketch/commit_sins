#!/usr/bin/env node
'use strict';

/**
 * COMMIT SINS — pre-commit scanner.
 *
 * Reads the staged version of every added/copied/modified/renamed text file
 * directly from the Git index, runs the same detection engine as the API, and
 * blocks the commit when anything is found.
 *
 * Safety rules:
 *   - scan the index, not the working tree, so unstaged "clean" edits cannot
 *     hide a staged secret;
 *   - skip binary blobs and submodule pointers;
 *   - never print a raw matched value, only the scanner's mask, its length and
 *     the remediation guidance;
 *   - fail closed if Git or the scanner cannot be read.
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const MAX_REPORTED_FINDINGS = 50;
const MAX_BUFFER = 50 * 1024 * 1024;

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.cwd,
    encoding: options.encoding,
    maxBuffer: MAX_BUFFER,
  });
}

function fail(message) {
  console.error(`\nCOMMIT SINS: ${message}\n`);
  process.exit(1);
}

/** Keep control characters out of terminal output. */
function displayPath(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, '?');
}

function readStagedPaths(repoRoot) {
  const output = git(
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
    { cwd: repoRoot }
  );
  return output
    .toString('utf8')
    .split('\0')
    .filter((filePath) => filePath.length > 0);
}

/** Map each index path to its mode so submodule pointers can be skipped. */
function readIndexModes(repoRoot) {
  const modes = new Map();
  const output = git(['ls-files', '--stage', '-z'], { cwd: repoRoot });

  for (const entry of output.toString('utf8').split('\0')) {
    if (!entry) continue;
    const tabIndex = entry.indexOf('\t');
    if (tabIndex < 0) continue;

    const [mode, , stage] = entry.slice(0, tabIndex).split(' ');
    if (stage === '0') modes.set(entry.slice(tabIndex + 1), mode);
  }

  return modes;
}

function main() {
  let repoRoot;
  try {
    repoRoot = git(['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    fail('unable to locate the repository root. Commit blocked for safety.');
  }

  let scanner;
  try {
    scanner = require(path.join(repoRoot, 'backend', 'src', 'engine', 'scanner'));
  } catch {
    fail('the detection engine could not be loaded. Commit blocked for safety.');
  }

  let stagedPaths;
  let indexModes;
  try {
    stagedPaths = readStagedPaths(repoRoot);
    indexModes = readIndexModes(repoRoot);
  } catch {
    fail('unable to read the Git index. Commit blocked for safety.');
  }

  if (stagedPaths.length === 0) {
    console.log('COMMIT SINS: no staged files to scan.');
    return;
  }

  const files = [];

  for (const filePath of stagedPaths) {
    if (indexModes.get(filePath) === '160000') continue; // submodule pointer

    let content;
    try {
      content = git(['show', `:${filePath}`], { cwd: repoRoot });
    } catch {
      fail(
        `unable to read the staged version of ${displayPath(filePath)}. ` +
          'Commit blocked for safety.'
      );
    }

    if (content.includes(0)) continue; // binary blob
    files.push({ filename: filePath, content });
  }

  if (files.length === 0) {
    console.log('COMMIT SINS: no staged text files to scan.');
    return;
  }

  let result;
  try {
    result = scanner.scanFiles(files);
  } catch {
    fail('the detection engine failed. Commit blocked for safety.');
  }

  const findings = result.files.flatMap((file) => file.findings);

  if (findings.length === 0) {
    console.log(
      `COMMIT SINS: scanned ${files.length} staged ` +
        `file${files.length === 1 ? '' : 's'}. No secrets detected.`
    );
    return;
  }

  console.error(
    `\nCOMMIT SINS: ${findings.length} potential secret` +
      `${findings.length === 1 ? '' : 's'} in ${files.length} staged ` +
      `file${files.length === 1 ? '' : 's'}. Commit blocked.\n`
  );

  for (const finding of findings.slice(0, MAX_REPORTED_FINDINGS)) {
    console.error(
      `  ${finding.severity.toUpperCase().padEnd(8)} ` +
        `${displayPath(finding.file)}:${finding.line}:${finding.column}`
    );
    console.error(
      `           ${finding.type} — masked ${finding.maskedValue} ` +
        `(${finding.valueLength} chars)`
    );
    console.error(`           ${finding.remediation}\n`);
  }

  if (findings.length > MAX_REPORTED_FINDINGS) {
    console.error(
      `  ...and ${findings.length - MAX_REPORTED_FINDINGS} more finding` +
        `${findings.length - MAX_REPORTED_FINDINGS === 1 ? '' : 's'}.\n`
    );
  }

  console.error('Remove or rotate the credential, stage the fix, and commit again.');
  console.error('Raw values were never printed or stored.\n');
  process.exit(1);
}

main();
