# Automated verification — Windows local delivery

These are retained executed results, not checks rerun during artifact cleanup.

## Published artifact

Revision: `74572cccaf45fa94e5459f2b2bdaed4346ce271e`.
[Exact-head CI run](https://github.com/ch0c01dxyz/NovelForge-AI/actions/runs/39015506803):
SUCCESS, lint/typecheck/test/Compose validation; 213 files,2609 tests passed.
Private-repository access may require authentication. The parent run is not
substituted for this revision's evidence.

## Separate NF023/NF039 sequential release battery

| Stage | Result |
| --- | --- |
| Clean-checkout repository lint | exit0 |
| API TypeScript | exit0 |
| Web TypeScript | exit0 |
| API non-E2E, sequential files | 76 files /1331 tests PASS |
| Full web suite | 93 files /589 tests PASS |
| Dedicated E2E | 3 files /21 tests PASS |
| Dedicated axe accessibility | 21 files /93 tests PASS |

All seven final stages passed, zero skipped; 76+3 reconciles all79 API test
files. Axe is included in the full web suite and repeated in its dedicated
contract stage: do not sum both as additional unique test coverage.
Two environment-blocked API attempts were retained before the clean third
attempt: stale database target, then missing process environment propagation.
No product/test edits were used to relabel those failures as passing.
Separate report review initially rejected incomplete disclosure, then approved
the amended report after authenticated CI read-back and record-change disclosure.

## Later local cleanup artifact

Local revision `4290bfdee75b7a12bc545093a4ef2919eb4b9a53` removes duplicate
Nuxt export owners and ignores local evidence in ESLint. Real Nuxt prepare,
web typecheck and original-checkout lint exited0; three composable files had
18/18 tests PASS; separate exact-diff review APPROVE. No full battery rerun
or hosted CI on that unpushed local revision is claimed.
