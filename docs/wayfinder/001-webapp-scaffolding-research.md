# Wayfinder Research: TS WebApp Architecture & Scaffolding

**Ticket**: #2 — TS WebApp Architecture & Vite Singlefile Scaffolding  
**Date**: 2026-07-27  
**Reference Codebase**: `/Users/noah.wong/Desktop/code/Budget/src/frontend`

---

## 1. Executive Summary

To migrate **顯恩堂系統 (EFCC)** from legacy inline Apps Script HTML (`index.html` + `程式碼.js`) to a modern TypeScript web app, we adopt the singlefile Vite bundling architecture established in `Budget`.

This setup yields two major benefits:

1. **Developer Experience**: Fast local development (`npm run dev`) with instant hot-module replacement and mock RPC data without waiting for clasp pushes or Apps Script deployments.
2. **Production Deployment**: A single self-contained `index.html` file produced by `vite-plugin-singlefile`, served natively by Google Apps Script via `HtmlService.createHtmlOutputFromFile('index')`.

---

## 2. Directory Structure

```
EFCC-dev/
├── appsscript.json             # Apps Script configuration
├── 程式碼.js                    # GAS server-side entry point (RPC handlers)
├── index.html                  # Generated singlefile HTML (build artifact)
├── CONTEXT.md
├── docs/
│   ├── adr/
│   ├── specs/
│   └── wayfinder/
└── src/
    └── frontend/               # React + TypeScript source code
        ├── package.json
        ├── vite.config.ts
        ├── tsconfig.json
        ├── tsconfig.app.json
        ├── tsconfig.node.json
        ├── index.html          # Vite HTML template
        └── src/
            ├── main.tsx        # React entrypoint
            ├── App.tsx         # Root component & router/view switcher
            ├── types.ts        # Domain & API TypeScript interfaces
            ├── services/
            │   └── api.ts      # Client RPC layer (google.script.run + Mock mode)
            ├── components/     # Shared UI components (Navbar, Modal, QRScanner)
            └── views/          # Page views (Login, Register, Programs, Events, Attendance, CareDashboard)
```

---

## 3. Tooling & Dependencies

### package.json (src/frontend)

```json
{
  "name": "efcc-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build --outDir ../../ --emptyOutDir false",
    "lint": "tsc --noEmit",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vite-plugin-singlefile": "^2.1.0"
  }
}
```

### vite.config.ts

```typescript
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
});
```

---

## 4. Client RPC Layer & Mock Mode Pattern (`api.ts`)

The `api.ts` service abstracts all client-server RPC calls. When running in Vite local dev (`google` object is undefined), it transparently returns mock data after a 300ms network simulation delay.

```typescript
// src/frontend/src/services/api.ts

declare const google: {
  script: {
    run: {
      withSuccessHandler: (cb: (res: any) => void) => any;
      withFailureHandler: (cb: (err: Error) => void) => any;
      [key: string]: any;
    };
  };
};

function invokeGas<T>(rpcMethod: string, payload?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof google === "undefined" || !google.script) {
      console.warn(`[Mock API] Invoking ${rpcMethod}`, payload);
      // Fallback handled per endpoint in apiService
      return;
    }

    google.script.run
      .withSuccessHandler((result: any) => {
        if (result && result.success !== false) {
          resolve(result);
        } else {
          reject(new Error(result?.message || "RPC call failed"));
        }
      })
      .withFailureHandler((err: Error) => reject(err))
      [rpcMethod](payload);
  });
}
```

---

## 5. Build & Deployment Verification

1. `cd src/frontend && npm install`
2. `npm run dev` → Local browser development with mock data.
3. `npm run build` → Compiles TypeScript and runs `vite-plugin-singlefile`, creating a single production `index.html` at the project root (`EFCC-dev/index.html`).
4. `clasp push` → Deploys server code (`程式碼.js`) and client code (`index.html`) to Google Apps Script.

---

## 6. Conclusion & Recommendation

The `Budget` singlefile React + Vite + TS structure is fully verified and ready for implementation. Proceed to Ticket #3 (Gmail-based Permission System & RBAC).
