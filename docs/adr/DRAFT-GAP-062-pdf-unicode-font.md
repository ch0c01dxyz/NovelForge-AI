# DRAFT — GAP-062: Unicode-capable font for PDF export (options)

## Status

**Draft — decision pending (owner: Klein).** Not an accepted ADR. Prepared 2026-10-06 as
decision groundwork for GAP-062 in `docs/implementation/ISSUES-AND-GAPS.md`.

## Context

`renderPdf` in `apps/api/src/services/export-render.ts` embeds only
`StandardFonts.Helvetica` / `HelveticaBold` via `pdf-lib@1.17.1`. The 14 standard PDF fonts
are WinAnsi/CP1252-encoded (218 Latin characters), so `page.drawText` throws
`WinAnsi cannot encode "中" (0x4e2d)` for CJK, Cyrillic, Arabic, emoji, etc. The exception
propagates out of `renderPdf` → `exportNovel` → `GET .../export?format=pdf`, i.e. a 500 for
an otherwise valid novel. The 015 sanitized-HTML content model has no script restriction,
and the frozen genre taxonomy includes xianxia/wuxia, where CJK names and terms are
plausible — so this limitation hits the platform's target content. TXT/MD/DOCX/EPUB are
UTF-8 throughout and unaffected.

GAP-062's closure check: closes when `renderPdf` either embeds a Unicode-capable font
(an ADR-level packaging decision — a font asset lands in `apps/api`) or returns an
actionable typed refusal for unencodable prose instead of a 500.

## Options

### Option A — Embed a Unicode-capable font via `@pdf-lib/fontkit` (needs verification)

Mechanism (standard pdf-lib practice, confirmed against current pdf-lib docs/community):

1. `npm install @pdf-lib/fontkit`, then `pdfDoc.registerFontkit(fontkit)` once per document.
2. Load a `.ttf`/`.otf` that contains the needed glyphs; `fontkit` only enables embedding,
   it does not add missing glyphs.
3. `await doc.embedFont(fontBytes, { subset: true })` — **subsetting is mandatory**:
   without it the entire font file is embedded in every PDF (a 16 MB CJK font would make
   every export 16+ MB even for 10 CJK characters); with it only used glyphs are embedded
   (kilobytes of output).

Font candidates (sizes are approximate, per current public sources):

| Asset | Coverage | Size per weight |
|---|---|---|
| Noto Sans static (Latin) | Latin, Latin-ext, Cyrillic, Greek | ~358 KB |
| Noto Sans JP static | Japanese + Latin | ~4 MB |
| Noto Sans CJK SC (OTF) | Full CJK + Latin (Simplified-first glyph forms — correct for xianxia names) | ~16–17 MB |

Regular + bold are both needed (the exporter uses HelveticaBold for headings), so the
CJK option adds roughly **~33 MB** to the `apps/api` package/install artifact; the Latin
option adds ~700 KB but does **not** fix CJK.

**Known risk — verify before closing:** a recent issue report against the `@pdf-lib/fontkit`
fork (verified on a pdf-lib fork, `@cantoo/pdf-lib@2.7.4`) found that `subset: true` on
CJK fonts can silently corrupt the embedded font (invalid CFF `offSize` byte), so the PDF
renders **blank** in FreeType/poppler-based viewers while text extraction still works —
the bugs were fixed upstream in `fontkit` 1.8/1.9, but the `@pdf-lib/fontkit` fork is
unmaintained and predates them. This is *not yet verified* against this repo's
`pdf-lib@1.17.1`. Mitigations if verification fails: (a) embed without subsetting
(output PDFs carry the full ~16 MB font — heavy), or (b) try the upstream `fontkit`
package with `registerFontkit` instead of the fork. **GAP-062 must not be closed on
`pdftotext` evidence alone — the corrupted-subset failure is invisible to text
extraction; a real viewer (or pixel render) check is required.**

Effort: small — one dependency, one font asset, ~30 lines in `renderPdf`, plus a render
verification test. Packaging decision: committing a 16–33 MB binary font into the repo
(or fetching it at build time — build-time fetch needs network at build, commit keeps it
reproducible offline).

### Option B — Actionable typed refusal instead of 500

Detect unencodable characters before rendering (WinAnsi encode check over the stripped
text) and return a typed error (e.g. `409`/`422` with a code like
`PDF_FONT_UNSUPPORTED_SCRIPT`) naming the offending scripts and pointing the user at
TXT/MD/DOCX/EPUB export instead of dying with a 500.

Effort: tiny. Product cost: PDF export stays unusable for any novel with CJK names —
a poor fit for a webnovel platform whose taxonomy includes xianxia/wuxia. This satisfies
the letter of GAP-062's closure check but leaves the real limitation in place.

### Option C — Chromium/HTML→PDF (rejected as disproportionate)

Full Unicode via system fonts and CSS layout, but adds a ~150 MB Chromium runtime, new
memory/CPU cost per export, and heavier deployment — against this project's
deliberately light infra posture (no Docker, host-run Postgres/Redis). Not recommended.

## Out of scope either way

Color emoji: neither Noto Sans nor Noto Sans CJK covers emoji; pdf-lib's color-glyph
support is unreliable. Emoji in PDF export remains best-effort regardless of the choice
above; a typed refusal path (Option B's detector) could name emoji explicitly.

## Recommendation for the decision

Option A with Noto Sans CJK SC (+ bold), **conditional on the render-verification step
passing** — it is the only option that actually fixes PDF export for the platform's
target content. If verification fails, fall back to Option B (typed refusal) rather than
shipping full-font embeds.

Sources: pdf-lib custom-font/subsetting guidance (github.com/openaec-foundation
pdf-lib skill docs); `@pdf-lib/fontkit` CJK-subset corruption report
(github.com/cantoo-scribe/pdf-lib/issues/144); Noto CJK OTF sizes 16–17 MB/weight
(multiple; e.g. fonts README survey); Noto Sans static Regular 357,864 bytes (dev.to
font-size census); NotoSansJP static ~4 MB (fonts README survey).
