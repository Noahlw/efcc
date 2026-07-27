# 01 — Scaffold TypeScript WebApp Architecture & Mock RPC Layer

**What to build:** Initialize `src/frontend/` with Vite, React 19, TypeScript, `vite-plugin-singlefile`, `types.ts`, `session.ts`, and `apiService` mock RPC service layer (`api.ts`). Enables `npm run dev` local hot-reloading with mock data fallback and `npm run build` producing a single self-contained `index.html` file for Google Apps Script deployment.

**Blocked by:** None — can start immediately  
**Status:** ready-for-agent

- [ ] `src/frontend/package.json` created with Vite, React 19, TypeScript, and `vite-plugin-singlefile`.
- [ ] `src/frontend/vite.config.ts` configured with `viteSingleFile()` plugin.
- [ ] `src/frontend/src/types.ts` defines TypeScript interfaces for `User`, `Program`, `Enrollment`, `Event`, `Attendance`, `Role`, and RPC payloads.
- [ ] `src/frontend/src/services/api.ts` implements `apiService` handling `google.script.run` in production and mock data fallback in local Vite dev (`typeof google === "undefined"`).
- [ ] `src/frontend/src/services/session.ts` manages 30-day persistent `localStorage` session payloads (`sessionToken`, `userId`, `role`).
- [ ] `npm run dev` launches standalone local Vite dev server with mock RPC responses.
- [ ] `npm run build` compiles TypeScript (`tsc --noEmit`) and bundles frontend into a single `index.html` at the project root.
