# Platform identity and reference indexing

Status: IMPLEMENTED AND VERIFIED LOCALLY,2026-10-23. Root is sole integration
writer; branding and catalog builders used separate worktrees; reviewer is separate.

Author request: add a platform administration tab to change the logo's small
letter/text and letter color; verify real embeddings/index the six Chapter6
references; fix reference detail rendering failure. Bounded plan:
1. Restore the authoritative reference-detail version metadata contract, with
   focused regression proof. Do not mask a missing backend field in the UI.
2. Inspect router source/catalog and probe a real embedding model with synthetic
   text. Verify1536-dimensional compatibility before adjusting only EMBEDDING
   mappings. Preserve old mappings/history in a private receipt; index/activate
   existing six versions and prove author search citations without changing story.
3. Persist singleton platform branding (name, badge text, badge foreground color)
   with versioned CAS, SUPER_ADMIN mutation, safe public projection and audit.
   Existing orange tile/design remains. Admin Identity form offers live preview,
   validation, save and explicit conflict/reload; shared logo renders across public,
   author, sign-in, Studio and writer headers. Preserve text case. Defaults N /
   NovelForge; no image upload or arbitrary CSS/HTML. EN/ID UI.

Required reading: AGENTS/START-HERE/CURRENT, tokens, reference service/routes/UI,
existing platform admin/auth/audit, router embedding adapter/catalog. Allowed:
those bounded modules, validation/schema/additive migration, focused tests/locales/
task/progress. Preserve all dirty work/stash, existing Docker/data, manuscript,
canon, publications and accounts. No router edits, commit, push or deployment.

Acceptance: correct history/count after create/version/ingest; error/empty states;
real gateway embedding shape/numeric checks; six version hashes unchanged,
scope/spoiler-safe author search, audit/model attribution; branding anonymous read,
unauthorized/ordinary-author write refusal, invalid input/CAS conflict, persistent
read-back, EN/ID/missing-key fallback, actual desktop/mobile UI/focus and separate
exact-diff review. Additive migration must be reviewed and rehearsed on a disposable
DB before local application; reuse current Docker, never reset it. Rollback retains
branding table/history data and restores previous values via API; embedding receipt
preserves previous mapping values for recovery. Save verified Engram checkpoint
at milestones/before handoff. Record limitations, never infer human acceptance.

## Implementation and proof

Reference detail now returns immutable version metadata from the authorized
stored reference; the missing versions[] caused the reported TypeError. The UI
also now displays saved content in a bounded scroll region as safely interpolated
text. Source URLs wrap. Regression failed before repair; final29retrieval API
cases PASS, including version metadata, ingest state, tenant/spoiler safety and
observed model aliases. Research UI27PASS, including markup-as-text rendering.

Router inspection and a real synthetic EN/ID probe proved OpenRouter small returns
two finite/nonzero1536-dimensional vectors. Added dedicated embedding catalog
adapter/manager/service/admin sync and profile-aware listing; no text fallback.
Modality refresh preserves capability markers, disabled state and an omitted
shared context window. Explicit disable of old incompatible mappings remains
allowed; enabling unsupported mappings is refused. Root catalog/branding API16
PASS after those regressions. Builder core112PASS retained; no unrelated rerun.

Actual catalog sync registered16 new rows;15 unverified rows were disabled,
including Gemini. Only openrouter/openai/text-embedding-3-small is enabled/mapped
for EMBEDDING. Prior3 text mappings disabled with preimage retained; all other
profile hashes unchanged. Six existing version1 references are ACTIVE,30chunks,
real embedding model used. Author search ran LEXICAL+VECTOR, returned10hits whose
spans resolve exactly to reference text. Unclassified sources remain withheld
in READER mode. Re-ingesting all6 skipped without another model call. Manuscript,
novel, publication, canon, entity, character and revision snapshot hash unchanged.
Evidence: .nf-artifacts/chapter6-index-receipt.json. Content remains research,
not canon or external proof of fictional effects.

Branding: admin Identity tab, live preview, native color picker/hex entry, strict
text/hex limits, casing preserved, explicit reload/conflict and safe defaults on
malformed reads. Shared BrandLogo covers public, author, sign-in, Studio and
writer headers. Writes recheck the database SUPER_ADMIN role, use singleton CAS
and atomic audit; public projection exposes only name/mark/color/version.
Restore scope classifies platform_branding as CONFIGURATION (105models/18config).
Restore classification8PASS. Selected web60PASS; final identity/locale24PASS
including existing missing-key fallback; API/services/web types and scoped TS
lint/diff check PASS. Existing Vue tooling plugin warning remains non-blocking.

Migration20261023000000_platform_branding reviewed APPROVE, backup read-back and
clone restore/migrate proof PASS, owned clone dropped, then main migration applied.
Backup .nf-artifacts/platform-identity-pre-migration.dump,3253491bytes,SHA256
082298166480a6a87efcc2f39c09bda8b8e282a822f52ef4fcac080ebe92a8d8.
Separate real PostgreSQL clone proof verified anonymous projection,401/403/400,
casing/color persistence, concurrent200/409, stale409 and2atomic audits; clone
removed. Evidence .nf-artifacts/platform-branding-db-proof.json and activation receipt.

Actual browser EN1440/ID390 PASS: admin preview/color/reload and all6reference
details, zero page errors/mutation requests. Screenshots personally inspected;
default platform branding preserved (browser changes were drafts only). Temporary
sessions removed and absence verified. .nf-artifacts/identity-reference-browser-receipt.json.
Independent final source review APPROVE, including follow-up content rendering;
critical SHA256: retrieval a6adc6759caaacfef51fd35604b32fa398a47d9b3931357266599def837efb2c;
ai.ts916361717ea5de8d4cd643598a1005f4fefa267736c0b87bb7fac0ae6f28c03a;
ReferenceIngest88f6879c05c22d531354b1a3dcd35dcfa07452566c5459a7306db452c5d587eb.

Final runtime: API6216 /ready200, Nuxt35384 /browse200, workflow38544 and cover29380
preserved; Windows Docker/data intact. HEAD32fe443, existing stash/dirty work and
both new worktrees retained. No commit/push. Whole-suite/production build and
human screen-reader acceptance not claimed. No implementation step remains in
this bounded task; author may choose branding values through the new tab.
