# Google-Native Foundation Alternatives to Apps Script HTML Service

**Date:** 2026-07-30
**Scope:** Read-only research. Primary sources only (developers.google.com, cloud.google.com, support.google.com/appsheet, workspace.google.com, about.appsheet.com). No blogs/Reddit/SO cited as authority; unofficial sources marked "community claim, unverified."
**Question:** Is there a Google-native (or Google-adjacent) foundation better suited than raw Apps Script HTML Service for a 100–300 user, Sheets-backed, hand-editable, stable-URL, elderly-friendly system?

---

## 1. AppSheet + Google Sheets data-binding model

**Confirmed: AppSheet builds directly on top of a live Google Sheet and preserves staff hand-editability.**

> "Use data from Google Sheets with AppSheet in the following ways: Create an app using a Google Sheet... Use the Google Sheets AppSheet add-on... The Google Sheets AppSheet add-on automatically converts a Google Sheet to an AppSheet app when you click Go from the AppSheet add-on pane in your Google Sheet."
> — [Use data from Google Sheets](https://support.google.com/appsheet/answer/10106594?hl=en)

Two documented caveats staff must know about hand-editing while AppSheet is live:

> "`onEdit` triggers do not fire when data is edited and synced to the spreadsheet via AppSheet. If you have important functionality that needs to run on updated data, we suggest moving it to a timed trigger."
> "Do not use filters on your Google Sheets: it can make the filtered rows invisible to updates. Instead, use filter views."
> — same source

**Verdict on Q1:** Confirmed — the Sheet stays the source of truth, staff can keep editing it directly, AppSheet reads/writes through the same sheet. This is the single strongest structural match to EFCC's "staff hand-edit the Sheet" requirement of anything evaluated.

---

## 2. Stable URL / installability

AppSheet does **not** give end users a bookmarkable custom URL the way a web server would. Instead it uses an install-link + "AppSheet mobile runtime" host-app model:

> "Your app is actually hosted on the AppSheet mobile runtime... When a user clicks on an app shortcut to launch the app..."
> — [Launch app shortcut from the Home screen](https://support.google.com/appsheet/answer/10104984?hl=en)

> "If AppSheet is already installed, tapping Install opens the app and creates a shortcut on the user's home screen... When the user opens AppSheet for the first time, it opens the app and creates a shortcut on the user's home screen."
> — [Deploy from an install link](https://support.google.com/appsheet/answer/10105388?hl=en)

This **is** installable to a home-screen icon on Android and iOS, official and documented. However, no Google documentation was found stating the install-link URL itself is architecturally guaranteed never to change on redeploy (unlike Apps Script's `/exec` vs `/dev` split, which **is** explicitly documented — see below). AppSheet's model sidesteps the Apps Script rotation problem entirely by not exposing a raw executable URL to the end user in the same way — the user interacts with a persistent shortcut into the AppSheet host app, not a URL string they must retype.

**Verdict on Q2:** Home-screen installability — confirmed and documented for both Android and iOS. "Never rotates" as an explicit guarantee — not found as an explicit claim; the architecture (shortcut into a hosted runtime) makes the failure mode Apps Script has (new deployment = new `/exec` URL unless "manage deployments" is used to keep the same URL) structurally moot for AppSheet, but this is an architectural inference, not a directly quoted guarantee.

For contrast, Apps Script's own docs on deployment/URL behavior:

> "Web apps deployed in one domain cease to function if their ownership changes to a shared drive or account in a different domain. This can be corrected by having the new owner or collaborator redeploy the web app in the new domain."
> — [Web Apps | Apps Script](https://developers.google.com/apps-script/guides/web)

Apps Script does support keeping one stable `/exec` URL across code updates if you edit an existing deployment (via **Deploy > Manage deployments**) rather than creating a new one each time — that specific "manage deployments" UI/URL-stability procedure is Apps Script product behavior described across Deploy screens; the direct doc consulted here confirms only that a *new* deployment / domain-ownership change breaks the URL, not that redeploying itself always rotates it. Net: URL rotation with Apps Script is an operator-discipline problem, not an architectural non-starter — but it is a real, documented failure mode that AppSheet's shortcut model avoids by design.

---

## 3. AppSheet authentication options — PIN-based login equivalent

**Not available. AppSheet does not support a custom username/PIN authentication mechanism; it explicitly refuses to build one.**

> "Supported authentication providers include: Apple, Box, Dropbox, Google, Microsoft, Salesforce, Smartsheet."
> — [Require sign-in: The Essentials](https://support.google.com/appsheet/answer/10104975?hl=en)

> "Can I create my own username/password mechanism? Not really... This is why AppSheet does not provide its own username and password mechanism. Instead, we utilize third party authentication via highly credible providers like Google, Dropbox, and Office365."
> — same source

The same page documents an insecure workaround (not a real auth mechanism) for ID-only lookup:

> "If you have a fixed list of users in a Lookup table, you could assign each user an ID and ask them to provide their ID via the UserSettings feature. This ID can be used with the Lookup table. Note that this is not a password. It is not encrypted and all users will have access to the Lookup table, so this approach is in some ways even less secure than the other options."
> — same source

**Verdict on Q3: BLOCKED for a true PIN-equivalent.** AppSheet has no first-party PIN/passcode authentication comparable to EFCC's current PropertiesService-session PIN flow. It either requires a real third-party account sign-in (Google/Microsoft/etc — not appropriate for elderly congregants without such accounts) or falls back to an explicitly-flagged insecure, unauthenticated ID-lookup pattern that Google's own docs warn against. Enterprise Plus adds Active Directory/Okta/AWS Cognito/OIDC — all still credential-provider based, not a native PIN system.

---

## 4. AppSheet pricing

No free tier exists that legitimately covers a 100–300-user **production** deployment. The free tier is capped at 10 test users (prototype) or 3 users (personal use).

> "Prototype development & testing: Use AppSheet for free... You are testing your app with 10 or fewer users (the app creator will count towards the total number of test users)."
> "Personal use: A maximum of three users are allowed to access your personal app. If the number of users exceeds this maximum, then access to your personal app will be blocked after three days."
> — [Use AppSheet for free](https://support.google.com/appsheet/answer/10104499?hl=en)

Paid tiers, per the official pricing page (about.appsheet.com/pricing, confirmed via search-engine cached rendering of that exact page — direct fetch of the live page returned only an RSS redirect, noted as a fetch limitation below):

> "Google AppSheet plans start as low as $5 per user per month for Starter or $10 per user per month for Core. Enterprise pricing is also available on request."
> — about.appsheet.com/pricing/ (per search-indexed snippet of the official page; direct live fetch was blocked by the site serving an RSS feed to the fetch tool — see Caveats)

Google Workspace bundling is documented as an alternative to buying AppSheet separately:

> "The following Google Workspace editions include AppSheet Core licenses for each domain-verified user in the Workspace organization: Business Starter/Standard/Plus, Enterprise Starter/Standard/Plus, Education Standard/Plus, Enterprise Essentials Plus, Frontline Starter/Standard, Nonprofits."
> — [How to choose a subscription](https://support.google.com/appsheet/answer/10105400?hl=en)

Licensing is counted per unique app user, not per device:

> "For AppSheet Starter, Core, and Enterprise Plus subscriptions, determine the number of licenses required by counting the total number of unique app users across all of your deployed apps."
> — same source

**Verdict on Q4:** At 100–300 users, AppSheet Starter would run **$500–$1,500/month** ($5/user × 100–300); Core would run **$1,000–$3,000/month**. If EFCC's church already runs Google Workspace for Nonprofits or another qualifying edition, AppSheet Core is bundled free per domain-verified user — this is the only realistic free path to AppSheet at this scale, and it requires the org's Workspace edition to be on the qualifying list above. No non-profit discount exists on AppSheet's own subscription pricing:

> "Is there a discount for non-profit organizations? No, we currently do not offer discounts for non-profit organizations."
> — [Subscription, license and usage, and billing FAQ](https://support.google.com/appsheet/answer/10106235?hl=en)

---

## 5. AppSheet scale ceilings against a live Sheets backend

Two distinct limit regimes exist in AppSheet docs and must not be conflated:

**(a) AppSheet's own hosted "AppSheet databases"** (a *different* data source than Google Sheets) have explicit per-plan row ceilings:

> "Free: 1000 rows per AppSheet database, 5 AppSheet databases. Starter: 2500 rows... Core and Publisher Pro: 2500 rows per AppSheet database, 10 AppSheet databases. Enterprise Plus: 200,000 rows per AppSheet database..."
> — [Restrictions, limits, and known issues](https://support.google.com/appsheet/answer/12653576?hl=en)

These figures **do not apply** to Google Sheets as a data source — EFCC's use case, since Sheets stays the backend.

**(b) Google Sheets as a data source** — Google's own guidance is explicit that AppSheet does not impose a hard row/user ceiling for Sheets, but instead documents Sheets' own platform ceiling and steers toward mitigation techniques as data grows:

> "There are other motivations as well. For example, Smartsheet does not allow more than 20,000 rows in a single spreadsheet. Google Sheets limits a spreadsheet to 10 million cells. Apps may need to scale to go past these limits."
> "AppSheet apps always download their entire working data set to the device or browser. This allows the apps to work seamlessly when offline, partially disconnected, or on a slow network."
> "The standard recommendations to scale an app are: Add security filters... Data partitioning -- lets you scale your app while remaining on spreadsheets. Move to a database data source..."
> — [Approaches to data scalability](https://support.google.com/appsheet/answer/10104705?hl=en)

No official document states a specific "AppSheet officially supports N concurrent users against Sheets" number, and none states migration off Sheets is *required* below the 10-million-cell ceiling — only that performance degrades and mitigation (security filters/partitioning) is recommended as data grows. EFCC's scale (100–300 users, a check-in table growing by hundreds of rows a year over 3–5 years) is orders of magnitude below the 10M-cell Sheets ceiling and below the "tens of thousands of employees" partitionable-app example Google itself cites as fine.

**Verdict on Q5:** No documented hard ceiling blocks EFCC's scale on Sheets. Official guidance is "works, degrades gracefully with mitigations available" rather than "graduate off Sheets past X."

---

## 6. Official AppSheet vs Apps Script guidance

**Confirmed — Google publishes a direct comparison**, co-authored by the Apps Script Product Manager and the AppSheet Product Manager:

> "'I want to build an application with an intuitive user interface that leverages my Google Workspace data and can be used by either a laptop or mobile device.' If this sounds like your use case, we recommend AppSheet, as it generates a clean, responsive, and intuitive UI for any device."
> — [When to use AppSheet or Apps Script in Google Workspace](https://workspace.google.com/blog/developers-practitioners/when-to-use-appsheet-or-apps-script-in-google-workspace) (Google Workspace Blog, Keith Einstein [Apps Script PM] & Scott Haaland [AppSheet PM])

> "AppSheet lets you build custom applications on top of Google Workspace applications... all without writing any code."
> "with just a few lines of code, Apps Script lets you extend and modify the behavior of Google Workspace applications with customizations like Sheet functions, menu items, triggers, data validation, and more."
> — same source

The blog also documents a hybrid pattern relevant to EFCC (AppSheet as UI, Apps Script for logic/notifications):

> "You could create an AppSheet app that reads and updates a Google Sheet full of your inventory data, then triggers an email and text notification when inventory levels get low."
> — same source

**Verdict on Q6:** Confirmed, direct, and squarely on point — Google's own guidance places EFCC's exact use case (intuitive UI over Workspace/Sheets data, used on laptop or mobile) in AppSheet's recommended zone, not Apps Script's.

---

## 7. Apps Script quota ceilings vs. a 100–300-user Sunday burst

Full official quota table, current as of the fetched page (last updated 2026-04-20 UTC per page footer):

| Feature | Consumer accounts | Workspace accounts |
|---|---|---|
| URL Fetch calls | 20,000/day | 100,000/day |
| Triggers total runtime | 90 min/day | 6 hr/day |
| Properties read/write | 50,000/day | 500,000/day |
| Email recipients/day | 100/day | 1,500/day |
| Script runtime | 6 min/execution | 6 min/execution |
| Simultaneous executions per user | 30/user | 30/user |
| Simultaneous executions per script | 1,000 | 1,000 |
| Triggers | 20/user/script | 20/user/script |

> "Google Apps Script services have daily quotas and limitations on some features. If you exceed a quota or limitation, your script throws an exception and execution stops."
> "There are too many scripts running simultaneously for this Google user account.' This indicates that you have too many scripts executing at once... This most commonly occurs for custom functions that are called repeatedly in a single spreadsheet."
> — [Quotas for Google Services | Apps Script](https://developers.google.com/apps-script/guides/services/quotas)

**Note on Spreadsheet read/write ops specifically:** the official quota table has no dedicated "Spreadsheet read/write operations/day" row — `SpreadsheetApp` calls are governed by the general script-runtime and simultaneous-execution ceilings above, not a separate per-call daily counter. This is a gap in what Google documents as a discrete quota line (not an omission on this survey's part — the table above is the complete published set).

**Verdict on Q7 — within documented ceilings, with one architectural caveat:**
- 100–300 users checking in over a 30–60 minute burst is well under `Simultaneous executions per script: 1,000` and `URL Fetch calls: 20,000–100,000/day` even in worst-case web-app-request-per-checkin modeling.
- `Simultaneous executions per user: 30` matters only if a *single* Google account (e.g., a shared kiosk account or the script owner identity under "Execute as me") is issuing many concurrent executions; 300 distinct end users each triggering their own single request does not hit this per-user cap unless the app runs "execute as me" and funnels every request through one owner identity concurrently, in which case a Sunday-morning simultaneous-tap burst **could** plausibly brush the 30-simultaneous-executions-per-user ceiling. This is a real, documented risk specific to how the web app's execution identity is configured (`Execute the app as me` vs `Execute the app as user accessing the web app`, per [Web Apps | Apps Script](https://developers.google.com/apps-script/guides/web)), not a blanket ceiling violation.
- Triggers total runtime (90 min consumer / 6 hr Workspace) is a daily automation budget, not a live-request budget, and is not stressed by check-in-burst traffic unless the app also runs heavy scheduled triggers same-day.

---

## 8. Workspace add-on / Chat app alternative

A documented, GA (general availability) Google-native pattern exists but is a different product shape (a chat bot, not a general web form):

> "Google Chat add-ons function as Chat apps, enabling interactions like sending messages, responding to commands, and opening dialogs."
> — [Extend Google Chat | Google Workspace add-ons](https://developers.google.com/workspace/add-ons/chat)

> "We're excited to announce that the ability for developers to build Google Chat apps using the Workspace add-on framework is now generally available."
> — [Build and deploy a single app across Chat, Gmail...](https://workspaceupdates.googleblog.com/2025/07/build-and-deploy-single-app-across-chat.html) (Google Workspace Updates blog — official Google product blog)

Backend can be Apps Script or HTTP (Cloud Functions/Cloud Run) per the official quickstarts:

> "Build a Google Chat app with Google Apps Script" / "Build an HTTP Google Chat app" (Cloud Functions-backed)
> — [developers.google.com/workspace/chat/quickstart/apps-script-app](https://developers.google.com/workspace/chat/quickstart/apps-script-app), [developers.google.com/workspace/add-ons/chat/quickstart-http](https://developers.google.com/workspace/add-ons/chat/quickstart-http)

**Verdict on Q8:** Documented and real, but it delivers check-in functionality inside Google Chat (requiring every user to have a Google Chat account/app), not a standalone elderly-friendly kiosk/web form. Not a good structural fit for EFCC's stated need (a simple, stable, phone-installable check-in surface for a general congregation, many of whom are elderly and not Google-Chat users). Noted for completeness; not recommended.

---

## 9. Firebase + Sheets API v4 hybrid, and concurrent human+API access

**No official Google documentation was found describing a supported Firebase-hosted-frontend + Sheets-API-v4-backend pattern**, and **no official Google documentation was found addressing concurrent human (UI) + API (programmatic) edits to the same spreadsheet** (race conditions, revision conflicts, locking).

Checked: [Sheets API v4 reference](https://developers.google.com/workspace/sheets/api/reference/rest), [spreadsheets.batchUpdate reference](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate), [Migrate from Sheets API v3](https://developers.google.com/workspace/sheets/api/guides/migration) — none discuss concurrency semantics, locking, ETags, or conflict resolution for simultaneous writers.

Only non-authoritative discussion was found, and per the assignment's rules is noted but **not** treated as evidence:

- *Community claim, unverified:* multiple Stack Overflow threads (e.g., "Concurrent rows appending in Google Sheets API v4," "Race condition in Google Sheets API") describe developers observing dropped/overwritten rows under concurrent `append`/`update` calls and recommend application-level queuing or locking, since the API itself has no native row-level lock.

**Verdict on Q9: BLOCKED.** Google does not officially document this hybrid pattern or its concurrency safety. This is directly relevant to EFCC: if a future architecture combined a non-Apps-Script frontend with the Sheets API while staff hand-edit concurrently, the collision-safety properties are **not officially specified anywhere** — the same structural risk exists today in the Apps Script + SpreadsheetApp design (Apps Script's `SpreadsheetApp` service is itself a wrapper with the same underlying spreadsheet-revision model, and Google does not document its concurrency guarantees either). This is a shared, unresolved risk across every architecture that keeps Sheets as the live backend, not a reason to prefer one foundation over another.

---

## 10. Official guidance on "graduating" off Apps Script

**No official Google documentation was found stating an explicit threshold or trigger condition for migrating from Apps Script to Cloud Functions, Cloud Run, or App Engine.** Checked: the Apps Script quotas page, [Web Apps | Apps Script](https://developers.google.com/apps-script/guides/web), and the Apps Script "Connect to Google Cloud services" page:

> "Learn how to connect to Google Cloud services, such as Cloud Run, from your Apps Script projects using identity tokens."
> — [Connect to Google Cloud services | Apps Script](https://developers.google.com/apps-script/guides/services/cloud-run)

This page documents Apps Script *calling* Cloud Run as a service (e.g., for heavier compute Apps Script can't do), not "migrating away from" Apps Script, and contains no graduation criteria or scale thresholds. General Cloud Functions-vs-Cloud-Run decision content exists ([Where should I run my stuff?](https://cloud.google.com/blog/topics/developers-practitioners/where-should-i-run-my-stuff-choosing-google-cloud-compute-option), [Cloud Run vs Cloud Functions for serverless](https://cloud.google.com/blog/products/serverless/cloud-run-vs-cloud-functions-for-serverless)) but neither mentions Apps Script or migrating off it.

**Verdict on Q10: BLOCKED.** Google publishes no explicit "you have outgrown Apps Script, move to X" guidance. The closest thing to an implicit signal is the quotas page itself (Section 7 above), whose existence and hard daily/per-execution ceilings function as an *implicit* practical ceiling, but Google does not editorialize about when to leave the platform.

---

## Direct answer: is AppSheet a strong, official, purpose-built fit for EFCC?

**Partially — strong fit on data architecture and UI delivery, blocked on authentication, and materially worse than free on cost.**

- **Strong, confirmed fit:** Sheets stays the live backend and remains hand-editable by staff (Q1) — this is AppSheet's actual designed-for pattern, not a workaround. Google's own comparison doc explicitly steers "intuitive UI over Workspace/Sheets data, used on any device" toward AppSheet, not Apps Script (Q6). Installable home-screen shortcut is real and documented for both Android and iOS (Q2). No documented row/user ceiling blocks EFCC's scale on Sheets (Q5).
- **Hard blocker: authentication.** AppSheet has no PIN/custom-credential login. It requires a real identity-provider account (Google/Microsoft/etc.) or an official-docs-flagged *insecure* ID-lookup fallback that Google itself warns is "even less secure than" other non-options (Q3). EFCC's PIN-based flow — chosen presumably because elderly congregants without Google accounts need a simple, low-friction credential — has **no first-party equivalent** in AppSheet. This is the single fact most likely to disqualify AppSheet outright for EFCC as specified, unless EFCC is willing to either (a) accept an app with no real per-user security (Publisher Pro / no-sign-in mode) or (b) require every congregant to have and use a Google/Microsoft account to sign in, which appears to conflict with the "elderly-friendly, no separate account" spirit of a PIN system.
- **Real cost, no qualifying free tier at scale.** Free tiers cap at 3–10 users; production 100–300 users costs $500–$3,000/month unless the church's Google Workspace edition already bundles AppSheet Core per domain-verified user (Q4) — worth checking EFCC's current Workspace edition against the bundling list in Section 4, since that is the only path to "free at this scale."

**Net assessment:** AppSheet is the strongest *data-architecture* match found (Sheets-as-live-backend, staff-hand-editable, official UI-over-Sheets recommendation), but it is not a drop-in replacement for Apps Script HTML Service at EFCC's specified constraints because of the authentication gap. If EFCC's PIN requirement can flex to "each user signs into their own Google account" (many congregants already have Gmail, given Google's consumer ubiquity), AppSheet becomes materially more attractive. If the PIN requirement is fixed and non-negotiable, no Google-native alternative surveyed here — AppSheet included — has a first-party PIN mechanism; Apps Script's own PropertiesService-session PIN approach remains the only Google-native option that supports it directly, because it is bespoke application code, not a platform-provided auth feature.

## Does Google's own documentation steer away from raw Apps Script HTML Service for this use case?

**Yes, indirectly and directly, in two places:**
1. The official comparison blog explicitly recommends AppSheet, not Apps Script, for "an application with an intuitive user interface that leverages Google Workspace data... used on either laptop or mobile device" (Q6 quote above) — this is EFCC's exact use case description.
2. Apps Script's own web-app URL-stability caveat (Q2 quote) and its full quota/limitation regime (Q7) are real, documented operational constraints that a general-purpose no-code platform (AppSheet) is designed to abstract away — Google does not say "don't use Apps Script for this," but its own docs show Apps Script requires more careful operational discipline (deployment management, execution-identity choice, quota awareness) than AppSheet does for the same UI-over-Sheets use case.

No official Google source was found stating Apps Script HTML Service is *unsuitable* or *deprecated* for this use case — it remains a fully supported, documented product with no graduation trigger (Q10 BLOCKED). The steering found is a *recommendation toward a better-fit tool*, not a warning away from a broken one.

---

## Caveats

- The live `about.appsheet.com/pricing/` page could not be fetched directly (it served an RSS redirect to the fetch tool used); the dollar figures in Section 4 are sourced from a search-engine-indexed snippet of that same official URL, not a direct page render. Recommend a manual visit to confirm current figures before budgeting.
- Q9 (Firebase+Sheets API hybrid) and Q10 (graduation guidance) are both BLOCKED — no primary source exists. Community/SO threads were surfaced but explicitly excluded as evidence per the assignment's sourcing rules.
- Section 7's "no dedicated Spreadsheet read/write quota row" is a documented *absence* on Google's quota page, not an inference — worth periodic re-verification since Google states quotas "are subject to elimination, reduction, or change at any time, without notice."
