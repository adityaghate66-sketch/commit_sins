# COMMIT SINS delivery outcomes

## Dashboard scan workspace

- [ ] The React dashboard lets a developer choose a safe sample file or enter source code, shows the selected filename and line count, and provides a clear scan action.
- [ ] The dashboard presents a scan summary showing clean or blocked status, finding count, and severity counts.
- [ ] The dashboard presents each finding with filename, line number, secret type, severity, masked value, and remediation guidance.
- [ ] The dashboard remains responsive and usable on narrow screens while preserving the developer-tool visual hierarchy.

## Secret detection and safe API boundary

- [ ] The Express backend provides `POST /api/scan` for source content and returns structured scan results.
- [ ] The scanner detects AWS credentials, GitHub tokens, Slack tokens, generic API keys, hardcoded passwords, private-key headers, and suspicious high-entropy strings using reusable regex and Shannon entropy logic.
- [ ] The scanner supports multiple findings, line numbers, severity classification, safe masking, remediation guidance, and clean results.
- [ ] The scan endpoint validates input, applies payload limits, handles malformed requests safely, never logs or returns raw detected values, and does not persist scanned content.
- [ ] Scanning failure is visible as an error state rather than silently allowing unsafe content.

## Pre-commit and CI education

- [ ] The website explains the staged-content pre-commit workflow, including block-on-findings and allow-on-clean behavior.
- [ ] The website explains that GitHub Actions reuses the same detection engine for pushes and pull requests.
- [ ] The website presents setup-oriented command/code snippets and the secure operating principles without using real credentials.

## Runtime and delivery

- [ ] The website serves a valid `/manus-routes.json` manifest covering all page routes.
- [ ] `pnpm check` and the production build complete without actionable source errors.
- [ ] The project has a durable project logo URL literal in `app.config.ts` before checkpointing.
