# COMMIT SINS

React / Express / tRPC / Drizzle starter, adapted from the Sandbox web-db-user template.

- `pnpm dev`: Vite dashboard on http://localhost:5173.
- `pnpm dev:api`: Express scan API on http://localhost:5001.
- `pnpm build` / `pnpm start`: build and serve `dist/server.js` and `dist/public/`.
- `pnpm db:migrate`: apply checked-in migrations. `pnpm db:push`: generate and apply new schema changes.
- `pnpm check` / `pnpm test`: types and application tests.
- `pnpm test:api`: backend scanner/API tests. `pnpm test:all`: both suites.
- `pnpm hooks:install`: install the COMMIT SINS pre-commit hook (run `node scripts/install-hooks.js --force` to replace an existing custom hook after a backup).

Start with the Webdev skill's default-template guide. Platform login, storage, payments and service contracts live in its shared references; read the relevant capability before extending its helper.

`server/_core/publicConfig.ts` exposes only named public runtime values. Private keys stay server-side. The platform serves managed `/manus-storage/` assets; the application does not register a second proxy.

Platform configuration is readable and editable through `webdev.config`. Default settings are initial values, not enforced constraints. The agent may modify the files, commands and configuration or follow the flexible guide for another stack.
