# COMMIT SINS

COMMIT SINS is a Git-based secret detection and prevention tool. It scans source
code for exposed credentials, explains the risk, tells you how to remediate it,
masks the value in every report, and blocks unsafe commits before they leave a
developer's machine. The same detection engine runs in the dashboard, the local
pre-commit hook and GitHub Actions.

## 1. What COMMIT SINS is

A small, self-contained security tool for catching credentials before they are
committed:

- a **detection engine** for known credential formats and suspicious
  high-entropy values;
- a **pre-commit hook** that scans the staged Git index and blocks the commit;
- a **GitHub Actions workflow** that scans pull requests and pushes to `main`;
- a **React dashboard** that scans pasted or uploaded files and shows a summary
  plus per-finding remediation.

Everything runs locally with Node.js. There is no database, no account system
and no third-party scanning service.

## 2. Why it is needed

A secret committed once is compromised forever: Git keeps it in history, and
public repositories are continuously scraped. Rotating the credential is the
only real fix, which is expensive and disruptive. COMMIT SINS moves the check to
the moment of commit, when the value can still be removed before it is recorded.

## 3. How it works

1. You edit files and stage them with `git add`.
2. The pre-commit hook reads the **staged** version of each added, copied,
   modified or renamed text file directly from the Git index — not the working
   tree.
3. The shared engine applies six credential patterns and a Shannon-entropy
   heuristic. Findings carry type, file, line, column, severity, masked value and
   remediation.
4. If anything is found, the hook prints the masked findings and exits non-zero,
   so Git aborts the commit. A clean commit proceeds normally.
5. In CI, `scripts/scan-changed.js` runs the same engine over the files a pull
   request changes, or over every tracked file on a push to `main`.
6. The dashboard sends file contents to `POST /api/scan`, which uses the same
   engine, and renders the findings without ever showing a raw value.

## 4. Features

- **Known-pattern detection**
  - AWS access key IDs
  - GitHub classic and fine-grained tokens
  - Slack tokens
  - Generic API-key assignments
  - Hardcoded password assignments
  - Private key headers
- **Entropy detection** for random-looking values that no pattern describes.
- **False-positive guards** for placeholders, environment-variable references,
  property access, URLs, RPC routes, code expressions and generated files.
- **Full masking** — every user-facing value is replaced with asterisks; only the
  length is reported.
- **Severity levels** — `critical`, `high`, `medium`, `low` — with a headline
  severity per scan.
- **Remediation guidance** attached to every finding.
- **Staged-content hook** with safe handling of deletions, renames, binaries and
  submodule pointers, and fail-closed behaviour.
- **CI scan** on pull requests and pushes to `main`.
- **Responsive dashboard** with loading, error, clean and findings states.
- **No secret persistence** — request content is scanned in memory and never
  written to disk or logs.

## 5. Tech stack

| Layer     | Technology                                                        |
| --------- | ----------------------------------------------------------------- |
| Backend   | Node.js, Express 5, CommonJS, `dotenv`, `cors`                    |
| Engine    | Plain Node.js modules (no external runtime dependencies)          |
| Frontend  | React 19, Vite, Tailwind CSS v4, `lucide-react`                   |
| Git hooks | POSIX `sh` launcher + Node.js scanner                             |
| CI        | GitHub Actions on Ubuntu, Node.js 22                              |
| Tests     | `node:test` for the backend, Vitest for the dashboard             |

## 6. Repository structure

```text
commit_sins/
├── backend/
│   ├── src/
│   │   ├── engine/
│   │   │   ├── patterns.js      # six credential patterns + severity/remediation
│   │   │   ├── entropy.js       # Shannon entropy and false-positive guards
│   │   │   └── scanner.js       # scanContent/scanFiles, masking, summaries
│   │   ├── routes/scan.js       # POST /api/scan validation and contract
│   │   └── server.js            # standalone Express app + health route
│   ├── tests/
│   │   ├── scanner.test.js      # engine unit tests
│   │   ├── scan-api.test.js     # real HTTP integration tests
│   │   ├── server.test.js       # app/error-handling tests
│   │   └── hook.test.js         # temporary-repo hook integration tests
│   ├── .env.example
│   └── package.json
├── client/
│   └── src/
│       ├── lib/scanApi.ts       # API adapter, response normalization, errors
│       ├── lib/scanApi.test.ts  # adapter tests
│       └── pages/Home.tsx       # dashboard and findings UI
├── hooks/
│   ├── pre-commit               # POSIX launcher installed into .git/hooks
│   └── pre-commit.cjs           # staged-index scanner
├── scripts/
│   ├── install-hooks.js         # safe hook installer with backup/--force
│   └── scan-changed.js          # CI/repository scan CLI
├── tests/fixtures/              # synthetic credentials, clean code, false positives
├── server/_core/                # production server that mounts the shared router
├── .github/workflows/secret-scan.yml
├── .env.example
└── README.md
```

## 7. Installation

Requirements:

- Node.js 22 or newer
- `pnpm` 10 (the repository is pinned to `pnpm@10.18.0`)
- Git

From the repository root:

```bash
pnpm install
npm --prefix backend install
```

The backend has its own `package.json` and `package-lock.json`; the root project
uses `pnpm-lock.yaml`.

## 8. Backend setup

```bash
cp backend/.env.example backend/.env   # optional; defaults work as-is
npm --prefix backend run dev           # nodemon on http://localhost:5001
# or
npm --prefix backend start             # plain Node
```

Health check:

```bash
curl http://localhost:5001/api/health
```

Scan request:

```bash
curl -s http://localhost:5001/api/scan \
  -H 'Content-Type: application/json' \
  -d '{"files":[{"filename":"config.js","content":"const key = process.env.AWS_ACCESS_KEY_ID;\n"}]}'
```

### API contract

`POST /api/scan` accepts one JSON object:

```json
{
  "files": [
    { "filename": "config.js", "content": "const key = \"...\";\n" }
  ]
}
```

Limits:

- at most **100 files** per request;
- at most **1,000,000 bytes** per file;
- at most **5,000,000 bytes** in total;
- filenames must be non-empty strings of at most 512 characters with no control
  characters.

A successful response wraps one result per file plus an aggregate summary:

```json
{
  "files": [
    {
      "file": "config.js",
      "summary": {
        "file": "config.js",
        "linesScanned": 1,
        "findingsCount": 1,
        "bySeverity": { "critical": 1, "high": 0, "medium": 0, "low": 0 },
        "highestSeverity": "critical",
        "truncated": false
      },
      "findings": [
        {
          "id": "…",
          "file": "config.js",
          "type": "aws-access-key-id",
          "severity": "critical",
          "line": 1,
          "column": 15,
          "maskedValue": "********************",
          "valueLength": 20,
          "remediation": "…"
        }
      ]
    }
  ],
  "summary": {
    "filesScanned": 1,
    "findingsCount": 1,
    "bySeverity": { "critical": 1, "high": 0, "medium": 0, "low": 0 },
    "byType": { "aws-access-key-id": 1 },
    "highestSeverity": "critical",
    "truncated": false
  }
}
```

The dashboard derives its `clean` / `blocked` verdict from
`summary.findingsCount`; the raw API intentionally returns data only.

Errors use one envelope and never echo submitted content:

```json
{
  "error": {
    "code": "INVALID_JSON",
    "message": "Request body must be valid JSON."
  }
}
```

Status codes: `400` invalid body/files/JSON, `413` oversized payload, `500`
unexpected scan failure (generic message, no stack trace).

## 9. Frontend setup

In a second terminal, with the backend running on port 5001:

```bash
pnpm dev
```

Open <http://localhost:5173>. Vite proxies `/api/scan` and `/api/health` to
`http://127.0.0.1:5001` (see `vite.config.ts`), so the dashboard talks to the
real backend with no mock data.

The dashboard lets you add sample files or upload files, shows a loading state,
surfaces API errors, displays a clean result, and renders each finding with its
type, filename, line, severity, masked value and remediation. It also shows
files scanned, total findings, critical/high counts and the overall risk level.

## 10. Environment variables

Copy `.env.example` to `.env` at the repository root for the production server,
and/or `backend/.env.example` to `backend/.env` for the standalone API.

| Variable      | Where            | Default                 | Purpose                              |
| ------------- | ---------------- | ----------------------- | ------------------------------------ |
| `PORT`        | root / backend   | `5001` (backend)        | API listen port                      |
| `CLIENT_URL`  | backend          | `http://localhost:5173` | Allowed CORS origin for the dashboard |

`.env` files are ignored by Git. `.env.example` files are tracked and contain no
real values.

## 11. How to run tests

Backend engine, API, server and hook tests (real HTTP and real temporary Git
repositories):

```bash
npm --prefix backend test
# equivalently: cd backend && npm test
```

Dashboard adapter and server tests:

```bash
pnpm test
```

Type checking and production builds:

```bash
pnpm check
pnpm build          # client bundle + bundled server
```

Run both test suites at once:

```bash
pnpm test:all
```

Test fixtures contain only synthetic values. They are assembled at runtime so
the repository never stores a complete credential literal, and the scanner must
never print a raw value in any result.

## 12. How to install the pre-commit hook

```bash
pnpm hooks:install
```

The installer writes `hooks/pre-commit` to `.git/hooks/pre-commit` and makes it
executable. If a custom hook already exists it refuses to overwrite it; re-run
with `--force` to back it up first:

```bash
node scripts/install-hooks.js --force
```

The launcher calls `hooks/pre-commit.cjs` from the repository root. The hook:

- scans only staged added/copied/modified/renamed content;
- ignores deleted files, binary blobs and submodule pointers;
- reports masked values only;
- exits `1` and blocks the commit on findings;
- fails closed when Git or the engine cannot be read.

To remove it, delete `.git/hooks/pre-commit` (or restore the `.backup-*` file the
installer created).

## 13. How to test secret detection with synthetic examples

All examples below are fake. They are split into short fragments so the
repository itself does not contain a scannable credential literal.

Create a demo file **inside the repository** (the hook only sees staged paths)
with a synthetic AWS key and stage it:

```bash
printf 'const key = "AKIA%s%s";\n' 'Z7Q2' 'XWPLM4RTV8NY' > demo-secret.js
git add demo-secret.js
git commit -m "demo: should be blocked"   # the hook must abort this commit
```

Expected: the commit is blocked, and the hook prints
`demo-secret.js:1`, `CRITICAL`, `aws-access-key-id`, a fully masked value and
remediation text. It never prints the key itself.

Clean commit:

```bash
printf 'export const region = "us-east-1";\n' > demo-clean.js
git add demo-clean.js
git commit -m "demo: clean commit"        # allowed
```

Remove the demo files (do not commit them):

```bash
git reset demo-secret.js demo-clean.js 2>/dev/null || true
rm -f demo-secret.js demo-clean.js
```

Scan the repository from the command line without installing the hook:

```bash
node scripts/scan-changed.js --all        # every tracked file at HEAD
node scripts/scan-changed.js --staged     # staged files only
node scripts/scan-changed.js --base HEAD^ --head HEAD
```

Exit codes: `0` clean, `1` findings, `2` the scan could not run.

## 14. How GitHub Actions works

`.github/workflows/secret-scan.yml` runs on:

- every pull request targeting `main` — scans the files changed between the pull
  request base and head commits;
- every push to `main` — scans every tracked file in the pushed commit;
- manual `workflow_dispatch` — scans every tracked file.

The job checks out full history, installs backend dependencies, runs the
backend test suite (including the hook tests), then invokes
`node scripts/scan-changed.js`. It fails when a finding is present. The script
prints only masked values, so CI logs cannot leak a credential. The only
permission requested is `contents: read`.

To reproduce the PR scan locally:

```bash
node scripts/scan-changed.js --base origin/main --head HEAD
```

## 15. Known limitations

- Detection is heuristic. Patterns can miss unusual credential formats, and
  entropy scoring can produce false positives in generated or minified content.
  Generated files and lockfiles skip the entropy heuristic only.
- The tool scans current file content. It does **not** rewrite or inspect
  existing Git history; if a secret was already committed, rotate it and use
  history-rewriting tools separately.
- The pre-commit hook can be bypassed with `git commit --no-verify`. CI is the
  second line of defence, not a replacement for discipline.
- The hook skips binary files and submodule pointers. Content above 1 MB per file
  (or 5 MB per request through the API) is not scanned.
- Finding a secret does not revoke it. Follow the remediation text: rotate the
  credential, remove it from the repository, and purge history if it was pushed.
- The dashboard accepts files up to the API limits; very large uploads are
  rejected with a safe `413` response.
- There is no authentication, database or multi-tenant storage. The tool is
  designed to run locally or in a single trusted CI job.
- Masking is complete: reports show only asterisks and the value length, not a
  partial prefix or suffix.
