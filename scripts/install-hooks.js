#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const sourceHook = path.join(repositoryRoot, "hooks", "pre-commit");
const force = process.argv.includes("--force");

function git(args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

let hooksDirectory;
try {
  const hooksPath = git(["rev-parse", "--git-path", "hooks"]);
  hooksDirectory = path.isAbsolute(hooksPath)
    ? hooksPath
    : path.resolve(repositoryRoot, hooksPath);
} catch {
  console.error(
    "COMMIT SINS: run this installer from inside a Git repository."
  );
  process.exit(1);
}

if (!fs.existsSync(sourceHook)) {
  console.error(`COMMIT SINS: hook launcher not found at ${sourceHook}.`);
  process.exit(1);
}

const targetHook = path.join(hooksDirectory, "pre-commit");

if (path.resolve(sourceHook) === path.resolve(targetHook)) {
  fs.chmodSync(sourceHook, 0o755);
  console.log(`core.hooksPath already points at ${sourceHook}.`);
  console.log("The COMMIT SINS pre-commit hook is ready.");
  process.exit(0);
}

fs.mkdirSync(hooksDirectory, { recursive: true });

if (fs.existsSync(targetHook)) {
  const existing = fs.readFileSync(targetHook, "utf8");

  if (!existing.includes("COMMIT SINS pre-commit hook")) {
    if (!force) {
      console.error(
        `An existing pre-commit hook is installed at ${targetHook}.`
      );
      console.error(
        "Nothing was changed. Re-run with --force to back it up and replace it."
      );
      process.exit(1);
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = `${targetHook}.backup-${stamp}`;
    fs.copyFileSync(targetHook, backup);
    console.log(`Backed up the existing hook to ${backup}`);
  }

  fs.rmSync(targetHook, { force: true });
}

fs.copyFileSync(sourceHook, targetHook);
fs.chmodSync(targetHook, 0o755);

console.log(`Installed the COMMIT SINS pre-commit hook at ${targetHook}.`);
console.log("It scans staged blobs with hooks/pre-commit.cjs before each commit.");
