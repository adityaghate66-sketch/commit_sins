# COMMIT SINS implementation plan

## Product scope

Build a polished single-page developer security dashboard for COMMIT SINS. The first experience should feel like a real internal security tool: a developer can choose a sample file or paste/upload code, run a scan, see whether a commit is blocked or allowed, inspect masked findings, and understand how the same engine protects Git hooks and GitHub Actions.

The Express server will expose a safe `POST /api/scan` endpoint and `GET /api/health`. The frontend will use the endpoint for scans and provide a resilient demo fallback for local interaction if the request fails. The scanner will detect synthetic examples of AWS keys, GitHub tokens, Slack tokens, generic API keys, hardcoded passwords, private-key headers, and high-entropy strings using regexes plus Shannon entropy. Raw values will never be returned, rendered, logged, or persisted.

## Implementation approach

- Keep the existing React/Vite/Express TypeScript starter and add a focused dashboard page in `client/src/pages/Home.tsx`.
- Replace the starter global styling with a bespoke dark operator-console visual system: near-black graphite canvas, sharp off-white type, acid-lime primary accent, warm amber warning accent, and thin blue-gray borders.
- Build the UI as a left navigation rail plus a responsive main workspace with a command header, health strip, scan workspace, result rail, and educational workflow panels.
- Use `lucide-react` icons and CSS-only treatment; no decorative stock imagery is needed because this is an internal developer security tool.
- Add client-side state for sample selection, scan status, findings, file count, and view tabs. The primary CTA calls `/api/scan` with a JSON payload and handles a structured response.
- Add `server/scanner.ts` with reusable pure scanning functions, entropy calculation, line detection, safe masking, and severity classification. Add the `/api/scan` handler in the Express entrypoint with strict request limits and safe errors.
- Keep the implementation free of auth and database dependencies for this demo surface. Scanned code is held in memory only for the request and is not stored.
- Serve a complete `public/manus-routes.json` route manifest with `/` and `/404`.

## Project structure

- `client/src/pages/Home.tsx` — dashboard layout, scan controls, findings, and workflow education.
- `client/src/index.css` — design tokens, responsive layout, typography, and interaction polish.
- `client/src/App.tsx` — route composition for `/` and `/404`.
- `server/scanner.ts` — detection rules, entropy analysis, masking, and result types.
- `server/_core/index.ts` — Express middleware, `/api/scan`, and health endpoint wiring.
- `public/manus-routes.json` — page route manifest for the website runtime.
- `app.config.ts` — project logo metadata for checkpointing.

## Design

### Style options considered

1. **Operator console noir** — a dark, high-contrast security workstation with neon evidence accents and dense but legible panels. Probability 0.07.
2. **Soft SaaS observatory** — a light, spacious security product with blue gradients and friendly rounded cards. Probability 0.05.
3. **Terminal editorial** — a monochrome, typographic developer journal with green phosphor highlights and minimal chrome. Probability 0.04.

### Chosen style: Operator console noir

- **Design Movement:** Contemporary developer-tool brutalism with security-operations console cues.
- **Core Principles:** Evidence first; zero ambiguity; fast scanning; controlled tension.
- **Color Philosophy:** Graphite and ink make the workspace feel protected and serious. Acid lime marks healthy/allowed states and the product’s ownable signature. Amber flags risk without resorting to generic red everywhere. Muted blue-gray supports hierarchy while keeping the interface technical.
- **Layout Paradigm:** A persistent left rail anchors navigation while the primary content works as a horizontal incident desk: status at the top, scan input in the middle, findings and guidance aligned beneath. Avoid centered marketing sections.
- **Signature Elements:** A lime “S” shield mark; bracketed monospace labels; a thin scanner line / grid texture used sparingly as an active-state motif.
- **Interaction Philosophy:** Every control should communicate state immediately. Loading uses a moving scan-line treatment, findings expand into remediation detail, and sample selection makes the demo feel runnable rather than static.
- **Animation:** 120–220ms transitions for hover/focus; one restrained scan-line sweep while scanning; count values fade/slide in on result; no decorative looping motion.
- **Typography System:** Use a compact sans for UI labels and a monospace face for code, metadata, counts, and command snippets. Headings use tight letter spacing and medium weight, not oversized hero marketing type.
- **Brand Essence:** Pre-commit secret prevention for developers who ship fast and need evidence before risk. Personality: vigilant, direct, composed.
- **Brand Voice:** Headlines are short and operational; CTAs name the action. Example lines: “Scan before the commit.” and “Unsafe code stops here.”
- **Wordmark & Logo:** A boxed shield monogram built from an angular `S` cut by a slash, paired with the uppercase COMMIT SINS wordmark.
- **Signature Brand Color:** Acid lime `#c6f64a`, reserved for safe status, active focus, and the primary scan action.

## Frontend/backend serving

The project remains on the configured port 3000 and uses `pnpm dev`. Vite serves the React app while Express owns `/api/*` routes. The production Dockerfile continues to build the client into `dist/public` and bundle the server into `dist/index.js`.

## Scope boundaries

This pass demonstrates and implements the core scan path with safe synthetic samples. Real Git hook installation, CI workflow files, and repository persistence are represented in the education panels and command snippets, but no external credentials or repository mutations are introduced.
