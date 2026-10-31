// Pre-commit hook: blocks the commit if the staged content contains secrets.
// Install with: chmod +x server/scripts/pre-commit.ts && ln -sf ../../server/scripts/pre-commit.ts .git/hooks/pre-commit
//
// It reuses the exact same detection engine as the web dashboard (/api/scan)
// so the verdict is identical locally and in CI.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);

const ROOT = join(__dirname, "..");
const MAX_FILES = 20;
const MAX_FILE_BYTES = 250_000;

function getAllStagedFiles(): string[] {
  // git diff --cached --name-only --diff-filter=ACMR
  const output = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function readFile(path: string, relative: string): { fileName: string; content: string } | null {
  try {
    const full = join(ROOT, path);
    const stat = statSync(full);
    if (stat.size > MAX_FILE_BYTES) {
      console.warn(`[pre-commit] ${relative} exceeds the ${MAX_FILE_BYTES} byte limit, skipping.`);
      return null;
    }
    const content = readFileSync(full, "utf-8");
    return { fileName: relative, content };
  } catch {
    return null;
  }
}

const main = async (): Promise<void> => {
  const staged = getAllStagedFiles();
  if (staged.length === 0) {
    console.log("[pre-commit] No staged files to scan.");
    return;
  }

  const files = staged.map(p => readFile(p, p)).filter(Boolean) as { fileName: string; content: string }[];
  if (files.length > MAX_FILES) {
    console.warn(`[pre-commit] ${files.length} staged files exceeds the ${MAX_FILES} file limit. Only scanning the first ${MAX_FILES}.`);
  }

  // Dynamically import the shared scanner so the hook stays in sync with the web dashboard.
  const { scanFiles } = require('../scanner.js') as { scanFiles: (files: Array<{ fileName: string; content: string }>) => any; };
  const result = scanFiles(files);

  if (result.status === "blocked") {
    console.error("[pre-commit] ❌ Commit blocked — unsafe content was detected.");
    console.error(`[pre-commit] ${result.summary.findings} finding(s) across ${result.summary.filesScanned} file(s):`);
    for (const finding of result.findings) {
      console.error(
        `  [${finding.severity.toUpperCase()}] ${finding.fileName}:${finding.line} — ${finding.type}`
      );
    }
    console.error("[pre-commit] Fix the findings and try committing again.\n");
    process.exitCode = 1;
    return;
  }

  console.log("[pre-commit] ✅ No secrets detected. Commit allowed.");
};

main();
