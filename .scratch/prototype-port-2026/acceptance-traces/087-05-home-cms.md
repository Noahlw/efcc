# 087-05 Home Content CMS Editor acceptance trace

Authority: issue #322, `docs/specs/087-management-hub-approvals-home-cms.md` (US 16-21), and the canonical management prototype (onHomeEditor). The 085-01 layer already provides the `GET /api/v1/home` projection (Template A featured-event + fallback; Template B title/summary/sanitized body/CTA/image) and the `home_content` table.

Run against local `wrangler dev`/local D1 with an authenticated Admin/Staff (with `home.publish` capability) fixture. Assert each step through visible DOM or response state; no fabricated data.

1. Open the Home Content editor.
   - Observe the single-page editor with Template A / Template B switch; the active template is selected; draft state visible.
2. Switch between Template A and B.
   - Observe the editor switches instantly with the relevant fields for each template (Template A: featured-event + fallback; Template B: title/summary/sanitized body/CTA/image).
3. Save a draft.
   - Observe a success notice; drafts persist independently of publish (no unpublished draft is ever visible to the public).
4. Publish immediately vs schedule (HK-time).
   - Observe both modes work; the public projection reflects the published/active content immediately (immediate) or at the scheduled HK-time.
5. Preview toggle (phone / desktop viewports).
   - Observe the content's real rendered shape in both viewports before publishing.
6. Conflict: a save that would overwrite a newer already-published version.
   - Observe an explicit conflict state requiring reload of the latest version — never a silent overwrite.
7. Audit trail.
   - Observe a visible list of who published what and when.

Focused proof: worker tests for draft + publish endpoints (immediate/scheduled HK-time, conflict 409 with reload-from-latest) + audit query + component tests (template switch, draft save, preview toggle, conflict UI) + e2e; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.