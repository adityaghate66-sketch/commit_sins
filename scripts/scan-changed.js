#!/usr/bin/env node
/**
 * COMMIT SINS — repository scan CLI.
 *
 * Used by GitHub Actions to scan repository content with the same detection
 * engine as the dashboard and the pre-commit hook. It never prints a raw
 * credential: only the scanner's mask, location, severity and remediation.
 *
 * Usage:
 *   node scripts/scan-changed.js --all
 *   node scripts/scan-changed.js --base <rev> --head <rev>
 *   node scripts/scan-changed.js --staged
 *   node scripts/scan-changed.js --base origin/main --head HEAD
 *
 * Exit codes:
 *   0  clean
 *   1  findings detected
 *   2  the scan could not run (git error, unreadable blob, missing engine)
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");

const MAX_FILE_BYTES = 1_000_000;
const MAX_REPORTED_FINDINGS = 200;

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: options.cwd,
    encoding: options.encoding,
    maxBuffer: 100 * 1024 * 1024,
  });
}

function usage() {
  console.log(
    [
      "COMMIT SINS scan",
      "",
      "  node scripts/scan-changed.js --all",
      "  node scripts/scan-changed.js --base <rev> --head <rev>",
      "  node scripts/scan-changed.js --staged",
      "",
      "Scans committed, changing or staged file contents with the shared engine.",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const options = { all: false, staged: false, base: null, head: null };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--all") options.all = true;
    else if (argument === "--staged") options.staged = true;
    else if (argument === "--base") options.base = argv[++index] ?? null;
    else if (argument === "--head") options.head = argv[++index] ?? null;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else {
      console.error(`COMMIT SINS: unknown argument "${argument}".`);
      options.invalid = true;
    }
  }

  return options;
}

function fail(message) {
  console.error(`COMMIT SINS: ${message}`);
  process.exit(2);
}

function displayPath(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, "?");
}

function isZeroSha(value) {
  return typeof value === "string" && /^0+$/.test(value);
}

function revExists(cwd, rev) {
  try {
    git(["cat-file", "-e", `${rev}^{commit}`], { cwd });
    return true;
  } catch {
    return false;
  }
}

/** Split a NUL-delimited git path list into strings. */
function parsePaths(output) {
  return output
    .toString("utf8")
    .split("\0")
    .filter((filePath) => filePath.length > 0);
}

function listChanged(cwd, base, head) {
  return parsePaths(
    git(
      [
        "diff",
        "--name-only",
        "--diff-filter=ACMR",
        "-z",
        `${base}..${head}`,
      ],
      { cwd }
    )
  );
}

function listStaged(cwd) {
  return parsePaths(
    git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
      cwd,
    })
  );
}

function listAll(cwd, head) {
  return parsePaths(git(["ls-tree", "-r", "--name-only", "-z", head], { cwd }));
}

function readBlob(cwd, revision, filePath) {
  return git(["show", `${revision}:${filePath}`], { cwd });
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    usage();
    return;
  }
  if (options.invalid) {
    usage();
    process.exit(2);
  }

  let repoRoot;
  try {
    repoRoot = git(["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
  } catch {
    fail("run this command from inside a Git repository.");
  }

  let scanner;
  try {
    scanner = require(path.join(
      projectRoot,
      "backend",
      "src",
      "engine",
      "scanner.js"
    ));
  } catch {
    fail("the detection engine could not be loaded.");
  }

  let paths;
  let revision;

  try {
    if (options.staged) {
      paths = listStaged(repoRoot);
      revision = null;
    } else if (options.all) {
      const head = options.head || "HEAD";
      if (!revExists(repoRoot, head)) fail(`revision "${head}" does not exist.`);
      paths = listAll(repoRoot, head);
      revision = head;
    } else {
      const head = options.head || "HEAD";
      if (!revExists(repoRoot, head)) fail(`revision "${head}" does not exist.`);

      let base = options.base;
      if (!base || isZeroSha(base) || !revExists(repoRoot, base)) {
        // First push on a branch (or a shallow clone): fall back to the parent,
        // then to every tracked file so nothing silently escapes the scan.
        base = revExists(repoRoot, `${head}^`) ? `${head}^` : null;
      }

      if (base) {
        paths = listChanged(repoRoot, base, head);
      } else {
        paths = listAll(repoRoot, head);
      }
      revision = head;
    }
  } catch {
    fail("the Git index or diff could not be read.");
  }

  const files = [];
  let skippedBinary = 0;
  let skippedLarge = 0;
  let skippedSubmodule = 0;

  for (const filePath of paths) {
    let content;
    try {
      content = options.staged
        ? git(["show", `:${filePath}`], { cwd: repoRoot })
        : readBlob(repoRoot, revision, filePath);
    } catch {
      // A gitlink (submodule) has no blob at this revision.
      skippedSubmodule += 1;
      continue;
    }

    if (!Buffer.isBuffer(content) || content.includes(0)) {
      skippedBinary += 1;
      continue;
    }

    if (content.length > MAX_FILE_BYTES) {
      skippedLarge += 1;
      continue;
    }

    files.push({ filename: filePath, content });
  }

  if (files.length === 0) {
    console.log(
      `COMMIT SINS: no scannable ${
        options.staged ? "staged " : ""
      }file content found.`
    );
    if (skippedBinary || skippedLarge || skippedSubmodule) {
      console.log(
        `COMMIT SINS: skipped ${skippedBinary} binary, ${skippedLarge} oversized and ` +
          `${skippedSubmodule} submodule path(s).`
      );
    }
    return;
  }

  let result;
  try {
    result = scanner.scanFiles(files);
  } catch {
    fail("the detection engine failed.");
  }

  const findings = result.files.flatMap((file) => file.findings);

  console.log(
    `COMMIT SINS: scanned ${files.length} file${files.length === 1 ? "" : "s"} ` +
      `(${result.summary.findingsCount} finding${
        result.summary.findingsCount === 1 ? "" : "s"
      }).`
  );

  if (skippedBinary || skippedLarge || skippedSubmodule) {
    console.log(
      `COMMIT SINS: skipped ${skippedBinary} binary, ${skippedLarge} oversized and ` +
        `${skippedSubmodule} submodule path(s).`
    );
  }

  if (findings.length === 0) {
    console.log("COMMIT SINS: clean — no secrets detected.");
    return;
  }

  for (const finding of findings.slice(0, MAX_REPORTED_FINDINGS)) {
    console.log(
      `  ${finding.severity.toUpperCase().padEnd(8)} ` +
        `${displayPath(finding.file)}:${finding.line}:${finding.column}  ` +
        `${finding.type}  masked ${finding.maskedValue} (${finding.valueLength} chars)`
    );
    console.log(`           ${finding.remediation}`);
  }

  if (findings.length > MAX_REPORTED_FINDINGS) {
    console.log(
      `  ...and ${findings.length - MAX_REPORTED_FINDINGS} more finding(s).`
    );
  }

  console.log("COMMIT SINS: secrets detected. Failing the scan.");
  process.exitCode = 1;
}

main();
