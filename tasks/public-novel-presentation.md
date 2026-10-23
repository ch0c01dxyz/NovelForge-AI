# Public novel covers and details

Status: IMPLEMENTED AND LOCALLY ACTIVE, 2026-10-23.
Owner: root (sole writer); independent source reviewer public_presentation_review
returned APPROVE for the submitted diff. No author/human acceptance inferred.

Goal: show the applied cover on /browse and cover/public synopsis/genres/rating,
published chapter count and publication dates on /read/:slug. Reuse the existing
stone/orange design, publication visibility and EN/ID resources. No invented
metadata, private planning synopsis exposure, automatic story mutation or publish.

Required reading: AGENTS, START-HERE, CURRENT, DESIGN-TOKENS, publication/discovery
services/routes/tests, NovelCard, reader novel page and NovelDiscoveryEditor.
Allowed: these services/routes/components/tests/locales and progress records.
No gateway, schema migration, chapter/canon changes, commit/push or dependencies.

Public metadata is additive. Public cover URLs contain novel ID/hash only and
require ACTIVE plus a PUBLISHED publication on every request, including ETag
checks. Serve only validated JPEG/PNG/WebP. Listing reads hashes, never image bytes.
Reader synopsis is a separate author-editable publicSynopsis in novel settings;
internal planning synopses remain private. Save with capability/tenant checks,
optimistic comparison, atomic JSON update preserving cover/settings and audit.
Empty/failed cover and unset synopsis/genre states remain clear and accessible.
Author amendment (2026-10-23): browse-card genre/rating tags use a gently skewed
chip shape with upright readable text, following the supplied interaction image
while retaining the existing stone/orange palette.

Checks: anonymous image/metadata visibility (including unpublish/cache), correct
bytes/media/hash, no private config/plan leakage, synopsis authorization/CAS and
preserved settings; UI real data, fallback image, EN/ID and mobile. Run focused
API/web tests, affected types/lint, independent exact review and actual local API/
browser checks. Use disposable databases for mutations; preserve the Windows
Docker stack and existing dirty work/stash. Rollback code leaves additive settings
data intact. Record actual evidence and verified Engram checkpoint before handoff.

## Completion evidence

Author visual follow-up2026-10-23: the desktop card's narrow text column caused
genre chips to stack vertically. Give genres a full-width card row and show the
content rating separately in the metadata footer. Retain skewed genre shapes
with upright text. Follow-up completed:11 discovery tests PASS, actual browser
ID1920/EN1440/ID390/ID320 geometry/screenshots PASS and independent source APPROVE.
Latest NovelCard SHA2567cc3b1300923ba1feff7f71c3709d0fa592b805f00c5dc23e4eb326635be7cb0
supersedes the earlier component hash below; other source remains unchanged.

24 public-discovery DB/API cases and14 public-reader cases PASS. Web discovery,
reader and metadata editor cases:30 total PASS across the focused runs, including
failed-image fallback, escaped synopsis and partial-save CAS acknowledgment.
API/web type checks, scoped ESLint and diff whitespace checks pass.

Independent review found a pre-existing ACTIVE-without-publication metadata leak.
The corrected resolver keeps earliest ACTIVE slug ownership and returns no public
page when that owner has no PUBLISHED publication; it never falls through to a
later tenant. The final reviewer approved this fix and the full requested scope.
Representative SHA256: public-discovery.ts
f26795c9675755f1a764fd915a11e21699bf4758ded646f45544d81557206c29;
publication.ts0576f6e6971fe0054b52198e4b8e0ffade991e14ac91f5e18c0bd495438a1328;
NovelCard.vue36e9ea55009a14104693b76cefa29fa3772e32a6609520ec148788a8e62f0455.

Actual anonymous local browser/API proof passed EN1440/ID390/ID320: current Kaisar
cover decodes on browse/detail, public URL contains no workspace path, conditional
request304, five skewed tags including rating with upright text, no horizontal
overflow/page errors, published chapter navigation and clear empty synopsis.
Screenshots and .nf-artifacts/public-presentation-browser-receipt.json retained.
No synthetic metadata, author synopsis edits or publication changes were applied
to the main novel. Its publicSynopsis is unset; author may fill it in Novel details.

API refreshed to PID41788 through the existing local runtime; /ready200.
No schema migration, worker restart, LLM request, commit or push was needed.
Full repository suite and human screen-reader acceptance were not run.
