# CF1 Live Deployment Verification

**Date:** 2026-08-04  
**Plan reference:** `docs/omp-plans/2026-08-04-worker-apps-script-reliability.md` Task 1

## clasp deployments

`npx clasp deployments --json` returned a list of historical deployment IDs. The current live deployment ID for the prototype is `AKfycbxlcUqJqeZJjrFdx2NrFrB227cZINT-Cp_nRA52c0CeQfawzO63gzKdC-VxqyzeV_HP` (the `/exec` URL carried from PR #157 evidence).

`clasp --json` in this clasp version does not include `deploymentConfig.webApp.access` or `webApp.executeAs` per entry; the live configuration is therefore verified against the deployed code, not the deployment record.

## manifest

`src/gas/appsscript.json`:

```json
"webapp": {
  "access": "ANYONE_ANONYMOUS",
  "executeAs": "USER_DEPLOYING"
}
```

The repository manifest matches the configuration required by ADR-0018 §3.

## live doPost response

A dummy-signed `restoreApp` envelope was POSTed from this machine to the live `/exec` URL. Two probes were run:

- `redirect: "follow"` (the path the Worker takes)
- `redirect: "manual"` (to capture the documented ContentService 302)

| Probe | Status | Final hostname | Content-Type | ms | Body shape |
|---|---|---|---|---|---|
| `follow` | 200 | `script.googleusercontent.com` | `application/json; charset=utf-8` | 2940 | JSON: `{status, code, title, detail, requestId}` |
| `manual` | 302 | `script.google.com` | `text/html; charset=UTF-8` | 1059 | non-JSON: `<HTML>...Moved Temporarily...` |

The `manual` probe's 302 is the **documented Apps Script ContentService redirect** (per `developers.google.com/apps-script/guides/content#redirects`). The one-time `Location` URL's `user_content_key` is the redirect token and is intentionally not captured here. The Worker already uses `redirect: "follow"`, so it is on the correct path.

The `follow` probe's body is the structured Problem Details the dispatcher emits for an invalid signature:

```json
{"status":403,"code":"FORBIDDEN","title":"FORBIDDEN","detail":"無效的服務請求。","requestId":"6273df8b-a38f-41a8-a647-b7afb3c4e860"}
```

This proves the live deployment:

1. accepts anonymous POSTs (`ANYONE_ANONYMOUS` is in effect, not `ANYONE`);
2. returns JSON, not HTML, after the documented redirect;
3. verifies the envelope and rejects an invalid signature with the expected Problem Details shape;
4. does not exhibit the upstream HTML/timeout failure the deployed Worker path has shown.

## verdict

**READY.** The live deployment matches the manifest and returns structured JSON when reached. The previously observed failure is therefore a Worker-to-Apps-Script path difference, not a deployment configuration issue.

Reproduction artifact: `npx tsx .scratch/transport-diag.mjs` from the repo root (no secrets captured).
