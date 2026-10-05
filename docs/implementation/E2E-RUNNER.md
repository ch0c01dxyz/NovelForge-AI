# E2E Runner (NF-WF-011)

## Command

```bash
pnpm e2e
```

Root `pnpm e2e` → `pnpm --filter @novelforge/api e2e` → `node --experimental-transform-types src/e2e/run.ts`.

## What it does

1. **Preflight**: loads repo-root `.env` (if `DATABASE_URL` not set), checks PostgreSQL and Redis reachability. Exits 2 on failure.
2. **Spawns vitest**: `vitest run --no-file-parallelism src/e2e` from `apps/api/`.
   - `--no-file-parallelism` is required: all files share the single `novelforge_test_e2e` database (dropped/recreated by the harness).
3. **Propagates** vitest's exit code.

## Test files

| File | Tests | Purpose |
|------|-------|---------|
| `author-preview.loop.test.ts` | 3 | G4+G6: full 8-step UI sequence (generate → approve → save → canon → review → publish → continuity → checkpoint/restore) + 409 gate first; G10 reviewFinalText evidence half |
| `gates.test.ts` | 10 | G1, G2, G3, G5, G7, G8, G9, G10 (health evidence half) + authorization negatives (run route + checkpoint/restore `revision:manage`) |
| `long-novel.measure.test.ts` | 7 | Thresholds: compile/recall/rebuild/health/restore p95+query ceilings; real timed fixture build + determinism (row counts + hashes); baseline receipt + >2× no-regression enforcement |

## Fixture

`long-novel.fixture.ts`: 300 chapters / 60 characters / 3,000 canon facts / 300 timeline events / 30 threads / 1 approved outline / 300 outline nodes (materialized through the planning service) / planning-horizon policy / chapter 300 published through the real review+setStatus path. Every measured row is written through the real service paths, so every row is attributable to a real revision — which yields roughly 4,500 revisions (GAP-042: the contract's "30 revisions" is a floor, `revisionCount >= 30`, not an exact count). `FIXTURE_SEED`-deterministic (identical row counts and sampled content hashes across builds with different tags).

## Baseline

`docs/implementation/e2e-baseline.json`: first measurements + thresholds. The >2× no-regression rule applies to deterministic measurements (query counts); latency is local-only with recorded tolerance.

## Local-only measurements

`SKIP_FIXTURE_BUILD=1 pnpm e2e` skips the real timed fixture build and the determinism builds (about 2–3 minutes of extra novel builds). The baseline test then carries the committed `fixture_build` receipt forward instead of re-measuring it; with no committed baseline it fails loudly and asks for one unskipped run. Which measurements run in CI vs locally:

| Measurement | CI (`pnpm e2e`) | Local full run |
|---|---|---|
| compile/recall/rebuild/health/restore thresholds | ✅ | ✅ |
| fixture build (real, uncached) + determinism | ✅ (receipt committed; re-runs each time) | ✅ |
| with `SKIP_FIXTURE_BUILD=1` | skips build, reuses committed receipt | skips build, reuses committed receipt |

Per the contract, "too slow for CI" without a committed receipt is not a pass — the receipt is always committed.
