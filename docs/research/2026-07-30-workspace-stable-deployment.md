# Workspace Deployment: Does It Fix Anonymous Access + URL Stability? — 2026-07-30

**Status:** READY (with explicit BLOCKED items called out)
**Investigator:** LibrarianWorkspaceStableDeploy (read-only, primary-sources-only)
**Scope:** Verify whether moving the EFCC deployer from personal Gmail to a Google
Workspace (NGO) account fixes (a) the `ANYONE_ANONYMOUS` sign-in-wall bug and (b) the
30-day/URL-rotation instability, per official Apps Script + Workspace Admin docs only.

**Primary sources consulted (fetched directly, quoted verbatim below):**
- `https://developers.google.com/apps-script/guides/web` (Web Apps guide, updated 2026-05-22)
- `https://developers.google.com/apps-script/manifest/web-app-api-executable` (manifest reference, updated 2026-04-20)
- `https://developers.google.com/apps-script/concepts/deployments` (Deployments concept guide, updated 2026-04-20)
- `https://developers.google.com/apps-script/guides/services/quotas` (Quotas guide, updated 2026-04-20)
- `https://knowledge.workspace.google.com/admin/drive/allow-only-certain-external-connections-for-apps-script-and-sheets` (Admin help, updated 2026-07-22)
- `https://knowledge.workspace.google.com/admin/users/access/turn-apps-script-on-or-off-for-users` (Admin help, updated 2026-07-22)

---

## Headline answers (plain statement, not inference)

**Q: Does switching the deployer to a Workspace/NGO account fix the `ANYONE_ANONYMOUS`-ignored bug?**
**BLOCKED / UNDOCUMENTED.** No official Apps Script or Workspace Admin document
states a behavioral difference between personal-Gmail and Workspace-account deployers
for `ANYONE_ANONYMOUS`. The manifest reference (quoted in §1 below) defines
`ANYONE_ANONYMOUS` as "Any user, even if not logged in" with **no account-type
qualifier**. There is no official page that says "on consumer accounts this is
ignored" or "on Workspace accounts this behaves differently." The team's prior
finding (`docs/research/2026-07-29-e2e-gas-auth-approaches.md`) is sourced from
community reports (Stack Overflow, Google Groups), not Google documentation — and
this investigation, restricted to primary sources, found **no official confirmation
or official denial** of that community-reported behavior. This must be verified
empirically (deploy from a real Workspace test account and hit `/exec` from a
signed-out browser) — it cannot be verified from documentation alone.

**Q: Does moving to Workspace fix or not affect the 30-day expiry / URL rotation issue?**
**Does not affect it, and the "30-day expiry" premise itself is not documented by
Google for Apps Script web app deployments.** No official Apps Script page states
that `/exec` URLs or "Anyone" access expires after 30 days. What **is** officially
documented (§4 below) is a *different*, permanent mechanism: the `/exec` URL is tied
to the **deployment ID**, not to the code version, and a deployment ID does not
change when you push new code to the same deployment — it changes only when you
create a **new** deployment. This is identical behavior on personal and Workspace
accounts; nothing in the Workspace Admin docs alters deployment/version semantics.
The repo's actual URL-rotation problem (per `docs/specs/070-form-protection-acceptance-plan.md`
citing `@43` and the CI comment "Every new deployment ID rotates the URL — update
this variable whenever you redeploy") is very likely a **process** issue — the team's
`clasp deploy` step is creating a **new versioned deployment** each time instead of
**editing the existing deployment to point at a new version** — not a Google-imposed
expiry. This is the load-bearing fix candidate; see §6.

---

## 1. `ANYONE_ANONYMOUS` — official definition, no account-type distinction documented

`https://developers.google.com/apps-script/manifest/web-app-api-executable`:

> `access` `string` Web app execution permission levels. Valid settings include:
> `MYSELF`: Only the deploying user can run the app. `DOMAIN`: Only users in the
> same domain as the deployer can run it. `ANYONE`: Any logged-in user.
> `ANYONE_ANONYMOUS`: Any user, even if not logged in.

No personal-vs-Workspace qualifier appears anywhere on this page, nor on
`https://developers.google.com/apps-script/guides/web`. The Web Apps guide's only
account-type-sensitive statement is scoped to **`executeAs: USER_ACCESSING`** (not
EFCC's `USER_DEPLOYING`), and is about **authorization rate limits**, not access
enforcement:

> "To prevent abuse, Apps Script imposes limits on the rate at which new users can
> authorize a web app that executes as the user. These limits depend, among other
> factors, on whether the publishing account is part of a
> [Google Workspace](https://gsuite.google.com/) domain."

This is the **only** place the official Apps Script docs mention Workspace vs.
non-Workspace as a factor in web app access behavior, and it does not apply to
EFCC's manifest (`executeAs: USER_DEPLOYING`, not `USER_ACCESSING`).

**Conclusion:** the personal-Gmail sign-in-wall behavior the team observed and
documented in `docs/research/2026-07-29-e2e-gas-auth-approaches.md` is **not
confirmed or denied by any official Google documentation** found in this
investigation. It is real (the team observed it directly), but its cause (why
`ANYONE_ANONYMOUS` didn't behave as documented) and whether a Workspace deployer
changes it are **not answerable from documentation** — they require an empirical
test: deploy the same manifest from a Workspace test account and load `/exec` in a
signed-out browser.

**What I checked and could not find:** Apps Script troubleshooting guide
(`https://developers.google.com/apps-script/guides/support/troubleshooting`),
the Web Apps guide, the manifest reference, and the deployments concept guide —
none mention `ANYONE_ANONYMOUS` enforcement varying by account type. If Google has
non-public or forum-only guidance on this, it is out of scope for "official docs
only."

---

## 2. The "30-day public link expiration" — not found in any official Apps Script or Drive-sharing document

No official Google document (Apps Script guides, manifest reference, deployments
concept guide, or Drive sharing help) states a 30-day expiration specific to Apps
Script `/exec` "Anyone" deployments. The closest official statement found is about
Drive's **file-sharing** expiration feature, which is unrelated to Apps Script
deployment access and explicitly does **not** apply to unrestricted "anyone" links:

> "The 'Set Expiration' feature in Google Drive only works when sharing files with
> specific people or groups. It does not currently support expiration timers for
> unrestricted public links." — Google Drive Community support thread
> (`https://support.google.com/drive/thread/421372812`)

This is a community support thread, not an authoritative Google doc, but it is
consistent with the absence of any 30-day clause on the four Apps Script pages
fetched directly for this investigation
(`guides/web`, `manifest/web-app-api-executable`, `concepts/deployments`,
`guides/services/quotas`). **Scoping conclusion: BLOCKED — the "30-day public link
expiration" premise from the prior diagnosis doc is not documented by Google for
Apps Script web apps on either personal or Workspace accounts.** It may be a
conflation with the general "Anyone with the link" Drive-sharing expiration feature
(which doesn't apply to Apps Script `/exec` deployments at all), or with OAuth
consent-screen "testing" mode 7-day refresh-token expiry (a different mechanism,
also undocumented as 30 days). Either way, **it is not an account-type-dependent
behavior that a Workspace migration would fix or not fix — because no such Apps
Script deployment expiration exists in the documentation to begin with.**

---

## 3. Admin console controls that could additionally restrict/block anonymous access

### 3a. "Turn Apps Script on or off for users" (org-wide kill switch)

`https://knowledge.workspace.google.com/admin/users/access/turn-apps-script-on-or-off-for-users`:

> "As an administrator, you can turn Google Apps Script on or off for people in
> your organization. ... By default, Apps Script is turned on for all users and
> guests in your organization."

> "When Apps Script is off: People in your organization can't create or edit
> scripts. Script and trigger executions are blocked. Blocked scripts include web
> apps, custom functions, and macros recorded in Sheets."

This is scoped to accounts **inside** the Workspace domain (the deployer and any
domain co-editors) — it does not gate the anonymous internet visitor calling
`/exec` from outside the domain, because that visitor has no account in the domain
and is not a "user in your organization." **This control affects whether the
Workspace-domain deployer/editors can build and maintain the script — it is
unrelated to blocking external anonymous visitors.**

### 3b. "Allow only certain external connections for Apps Script and Sheets" (URL Fetch allowlist)

`https://knowledge.workspace.google.com/admin/drive/allow-only-certain-external-connections-for-apps-script-and-sheets`:

> "As an administrator, you can control which external domains your users can
> access through Apps Script and Sheets. By default, Apps Script scripts and
> Google Sheets functions can send or fetch data using any URL. By creating a list
> of allowed URLs and blocking all others, you can help make your organization's
> data more secure."

> *Supported editions for this feature: Frontline Plus; Business Plus; Enterprise
> Standard and Enterprise Plus; Education Standard and Education Plus; Enterprise
> Essentials Plus.*

This setting governs **outbound** `UrlFetchApp` calls made by scripts running under
domain accounts — it restricts what URLs the *script* can call out to, not who can
call *into* the `/exec` web app endpoint. It is irrelevant to inbound anonymous
visitor access, and it is not available on lower Workspace tiers (notably not
listed for Business Starter or Business Standard, and its edition list does not
mention a Nonprofit-specific tier — see §8 below on Nonprofit-edition mapping).

### 3c. "Control which apps access Google Workspace data" (API access control) — scoped to OAuth client IDs, does not reach an Apps Script web app's inbound `/exec` traffic

`https://knowledge.workspace.google.com/admin/apps/control-which-apps-access-google-workspace-data`:

> "If your users **sign in to apps through their Google accounts**, you can
> control how these apps access your organization's data. Using OAuth 2.0
> settings in the Google Admin console, you can manage 3 types of apps:
> Google-owned, Internal, Third-party."

> "**View information about the app**—Shows the full **OAuth2 client ID** of the
> app, the number of users, the privacy policy, and the support information."

This entire control surface (Security > Access and data control > API controls >
Manage App Access) is keyed to **OAuth 2.0 client IDs** that appear because a
domain user *signed in through their Google account* to authorize that app. An
Apps Script web app deployed with `access: ANYONE_ANONYMOUS` and
`executeAs: USER_DEPLOYING` is not something an anonymous visitor "signs in to" —
the visitor makes an unauthenticated HTTP request to `script.google.com/macros/s/.../exec`,
and the code runs under the **deployer's** authorization (the deployer is the one
who consented to the script's OAuth scopes at deployment time, and that consent is
what would appear in this list, as an *internal* app tied to the deployer's own
account — not as something a visiting church member "accessed"). **This means an
admin cannot use API access control to selectively block anonymous visitors from
reaching the `/exec` endpoint**: the only lever this page exposes is to
Restrict/Block the **deployer's own** OAuth grant (e.g., blocking the scopes the
Apps Script project consumes — Sheets, Properties, etc.), which would break the
web app for **every** visitor, not just external ones. There is no "visitor-facing
OAuth client ID" for a `USER_DEPLOYING` web app for an admin to target.

**Conclusion for Q3/Q3b:** No Admin console setting found in official documentation
blocks or restricts **inbound** anonymous access to a Workspace-deployed Apps
Script web app's `/exec` URL. The three closest-sounding controls
("Turn Apps Script on/off", "Allow only certain external connections", and "API
access control") all govern the **domain's own users and their own OAuth-scoped
apps** — none is a gate on external, non-domain, non-authenticated visitors
reaching a public `/exec` URL, and §3c's OAuth-client-ID scoping is the specific
mechanical reason why: there is nothing for an admin's app-access policy to attach
to on the visitor side, since the visitor never authenticates or consents to
anything. **A generic Workspace domain's default external-sharing restrictions
(e.g., "Sharing outside your organization" settings that govern Drive/Docs/Calendar
sharing) were not found to apply to Apps Script web app deployments in any official
document reviewed** — those settings, per the official Web Apps guide (§1, §"Deploy
a script as a web app" section), govern the deployment configuration's own `access`
field (`ANYONE_ANONYMOUS`, `ANYONE`, `DOMAIN`, `MYSELF`), which is set at deploy
time in the Apps Script editor/manifest, not layered by a separate Drive-sharing
policy. **This narrower "does domain external-sharing default touch Apps Script
access" question is BLOCKED pending an empirical test on the actual NGO Workspace
domain's Admin console** — domain-specific external-sharing defaults are configured
per-domain and their interaction with Apps Script specifically is not written up by
Google as a single authoritative cross-reference — but per §3c, the mechanism by
which such an interaction *could* occur (an OAuth client ID an admin can target) does
not exist for this deployment shape, which narrows the residual risk considerably.

---

## 4. Deployment vs. Version — the official "stable URL" mechanism (identical on any account type)

`https://developers.google.com/apps-script/concepts/deployments`:

> "There are two types of deployments: *Head deployments*, which always sync to the
> current project code. *Versioned deployments*, which connect to a specific
> project version."

> "**[Version](/apps-script/guides/versions)**: A static snapshot of your script
> project's code. Once created, a version is immutable. Think of a version as a
> 'save point' in your development history."
> "**Deployment**: A release that makes a specific version of your script available
> for users. A deployment has a unique URL or ID."

> "When you want to update the code used by an existing deployment (like a web
> app), you create a new **version** and then [edit the deployment](#edit-versioned)
> to point to that new version. This updates the application for all users while
> maintaining the same URL or deployment ID."

> "To edit a versioned deployment: 1. Open the Apps Script project. 2. Click
> **Deploy** > **Manage deployments**. 3. Select the active deployment and click
> **Edit**. 4. Make your changes and click **Deploy**."

> "To deploy a change to the project code, create a new **version** and edit the
> deployment to use it. **This is the standard way to update your application
> without changing its URL or deployment ID.** The deployment automatically uses
> the new version for all users."

This is unqualified by account type — it is the same mechanism on personal Gmail
and Workspace accounts. **This directly answers the "does the URL rotate on every
deploy" question: it does not have to.** The URL/deployment-ID only changes when a
**new** deployment is created (`Deploy > New deployment`); it stays fixed when you
**edit an existing deployment** to point at a new version (`Deploy > Manage
deployments > Edit > select new version > Deploy`).

---

## 5. `/exec` URL rotation under `clasp` — this is a tooling/process gap, not a Google platform limitation

Cross-referencing the repo's own evidence (already gathered in
`docs/research/2026-07-30-efcc-deployment-access-diagnosis.md` §4 and §8):

- `docs/specs/070-form-protection-acceptance-plan.md:153-155` cites a fresh
  deployment ID + URL (`@43`) as the "latest".
- `.github/workflows/e2e.yml` comment (per that same doc, §8): "Every new
  deployment ID rotates the URL — update this variable whenever you redeploy."

Per §4's quoted mechanism, **this rotation is avoidable**: it happens because each
`clasp deploy` in the current pipeline is invoked without `-i <existing deploymentId>`
(clasp's flag for updating an existing deployment in place), so `clasp` creates a
**new versioned deployment** each time rather than editing the existing one to
point at a new version. Per the official docs, the correct pattern is: create the
versioned deployment **once**, note its deployment ID, and on every subsequent code
push, redeploy to that **same** deployment ID (`clasp deploy -i <deploymentId>` in
clasp terms, or **Deploy > Manage deployments > Edit > (new version) > Deploy** in
the UI) — this keeps the `/exec` URL permanently fixed. **This is the "stable
production deployment" pattern requested in the assignment, and it is unaffected by
which Google account type owns the project.**

---

## 6. Recommended official process for a stable production URL (verbatim guidance)

Already quoted in full in §4. Restated as a procedure per the doc's own text:

1. **Head deployment** exists automatically and always mirrors saved code — "Use
   head deployments to test code. Don't use head deployments for public use."
2. **Create one versioned deployment** for production (`Deploy > New deployment`).
   Record its **deployment ID** (`Deploy > Manage deployments > select the active
   deployment` to view the ID).
3. **On every future code change:** create a new **version**, then **edit that
   same versioned deployment** to point at the new version
   (`Deploy > Manage deployments > Edit > choose new version > Deploy`). Per the
   docs: "This updates the application for all users while maintaining the same
   URL or deployment ID."
4. **Never** run `Deploy > New deployment` again for production after step 2 —
   that action mints a brand-new deployment ID/URL, which is exactly the rotation
   behavior the team is fighting.

This is the actual, permanent, documented mechanism for a stable `/exec` URL. It is
orthogonal to the custom-domain question (§7) and orthogonal to personal-vs-Workspace
account type.

---

## 7. Custom domain support — confirmed absent, same on Workspace

No official Google document states that Apps Script web apps can be served from a
domain other than `script.google.com`. The Web Apps guide (§1's source page) and the
Deployments concept guide describe deployment URLs exclusively in terms of the
Apps Script-issued `/exec` and `/dev` URL forms; neither mentions custom-domain
hosting, CNAME mapping, or Cloud Load Balancer fronting as a supported Apps Script
web app feature. **No official document was found confirming or denying it
explicitly for Workspace-specific setups either** — the absence of any custom-domain
configuration option in the deployment UI/API described by
`https://developers.google.com/apps-script/concepts/deployments` and
`https://developers.google.com/apps-script/guides/web` is the strongest available
evidence, but this is an absence-of-feature inference, not a quoted denial.
**Confirmed: nothing in the Workspace Admin documentation reviewed adds
custom-domain support for Apps Script web apps.** (Google Sites custom-domain
mapping is a separate product and does not change the underlying `script.google.com`
URL of an embedded web app.)

---

## 8. Quota differences: consumer vs. Workspace (documented), Nonprofit-tier specifics (BLOCKED)

`https://developers.google.com/apps-script/guides/services/quotas` gives an explicit
side-by-side table, "Quotas are set at different levels for users of consumer
accounts (such as gmail.com) and Google Workspace accounts. Quotas are per user and
reset 24 hours after the first request." Relevant excerpts (verbatim from the table):

| Feature | Consumer accounts (gmail.com) | Google Workspace accounts |
|---|---|---|
| URL Fetch calls | 20,000 / day | 100,000 / day |
| Triggers total runtime | 90 min / day | 6 hr / day |
| Properties read/write | 50,000 / day | 500,000 / day |
| Spreadsheets created | 250 / day | 3,200 / day |

Execution-time limits are **not** account-type-dependent: "Script runtime: 6 min /
execution (Consumer) / 6 min / execution (Workspace)" and "Simultaneous executions
per user: 30 / user (both)."

**Nonprofit-tier-specific quotas: BLOCKED — not documented.** The quotas page does
not break out a separate Nonprofit-edition row or column; it only distinguishes
"consumer accounts" vs. "Google Workspace accounts" as two buckets. Google Workspace
for Nonprofits provisions Business Starter-equivalent (and higher, on request)
licenses under the standard Workspace SKUs, so the quota table's "Google Workspace
accounts" column would apply, but **no official document explicitly states "Nonprofit
edition = Workspace edition for quota purposes."** This is inferred from the absence
of a distinct Nonprofit row, not a quoted confirmation.

---

## 9. Google Workspace for Nonprofits — Apps Script-specific documentation: BLOCKED, not found

Searched official surfaces: `developers.google.com/apps-script/*` (no nonprofit
references anywhere in the guides, manifest reference, deployments, or quotas
pages), and general web search for `"Google for Nonprofits" OR "Workspace for
Nonprofits" Apps Script restrictions`. **No official Google for Nonprofits or
Workspace for Nonprofits documentation page was found that mentions Apps Script at
all** (restrictions, allowances, or otherwise). Google's nonprofit program
documentation (`google.com/nonprofits`, `support.google.com/nonprofits`) covers
eligibility, product bundling (Workspace, Ad Grants, YouTube), and general Workspace
feature parity, but none of the pages surfaced by search results address Apps
Script specifically. **Explicit BLOCKED status: the Nonprofit-edition question (Q8)
cannot be answered from official documentation** — Nonprofit editions of Workspace
should inherit the general Workspace behavior documented in §8's quota table (since
Nonprofit accounts run on standard Workspace infrastructure), but this is an
inference, not a documented fact, and should be verified against the specific
Workspace SKU the NGO is actually provisioned on (Business Starter/Standard/Plus
equivalent) once known.

---

## Summary (≤10 bullets)

- **`ANYONE_ANONYMOUS` personal-vs-Workspace behavior difference: UNDOCUMENTED.**
  The manifest reference defines `ANYONE_ANONYMOUS` identically regardless of
  account type; no official page confirms or denies the community-reported
  personal-Gmail sign-in-wall bug, or that Workspace fixes it. **Must be verified
  empirically**, not by documentation.
- **The "30-day public link expiration" premise itself is not documented** by
  Google for Apps Script web app deployments on either account type — it does not
  appear on the Web Apps guide, manifest reference, deployments guide, or quotas
  guide. This is not an account-type distinction to resolve; it's an
  undocumented/likely-non-existent mechanism as applied to `/exec` URLs.
- **The actual, documented, permanent mechanism for a stable `/exec` URL exists and
  is unrelated to account type:** create one versioned deployment, then on every
  code change create a new **version** and **edit that same deployment** to point
  at it — "This updates the application for all users while maintaining the same
  URL or deployment ID" (`concepts/deployments`). The repo's current URL-rotation
  problem is almost certainly caused by always creating a **new** deployment
  instead of editing the existing one.
- **No Admin console policy found blocks inbound anonymous internet visitors** to a
  Workspace-deployed Apps Script web app; "Turn Apps Script on/off", "Allow only
  certain external connections", and "API access control" all govern the domain's
  own users/scripts/OAuth grants, not external anonymous callers. §3c: API access
  control is keyed to **OAuth2 client IDs** created when a domain user signs in to
  an app — an anonymous `/exec` visitor never authenticates, so there is no
  visitor-facing client ID for an admin to target; the only lever is blocking the
  *deployer's own* scopes, which breaks the app for everyone, not selectively. The
  narrower question of domain default external-sharing settings touching Apps
  Script specifically remains **BLOCKED/unverified** — recommend testing on the
  actual NGO Admin console.
- **Custom domains: confirmed absent** — no official page describes any
  custom-domain hosting option for Apps Script web apps, on any account type.
- **Quota differences are real and documented**: Workspace accounts get materially
  higher URL Fetch (100k/day vs 20k), trigger runtime (6h vs 90min), and Properties
  storage (500k vs 50k) quotas than consumer accounts; execution-time and
  simultaneous-execution limits are identical across both.
- **Nonprofit-tier-specific Apps Script documentation: BLOCKED, not found.** No
  official Google for Nonprofits / Workspace for Nonprofits page mentions Apps
  Script. Inference (not confirmed): Nonprofit Workspace accounts should get the
  "Google Workspace accounts" quota row since they run on standard Workspace
  infrastructure — verify against the NGO's actual provisioned SKU.
- **Plain-language bottom line on the two original defects**: Workspace migration's
  effect on the `ANYONE_ANONYMOUS` sign-in wall is **unverified by documentation —
  test it**; Workspace migration has **no effect** on the 30-day-expiry story
  because that story isn't a documented Apps Script behavior in the first place —
  the real, fixable issue is the deployment-vs-version process gap in §4–§6, which
  applies equally regardless of which account owns the project.
