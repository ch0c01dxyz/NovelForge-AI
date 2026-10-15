# Correction — NF-WF-052 dispatch manifest (2026-10-14, second pass)

Status: DATED CORRECTION to `tasks/NF-WF-052-dispatch-manifest.md`. The
manifest itself is preserved byte-identical; this correction supersedes the
specific statements listed in §2 and is the newest artifact of the dispatch
chain. Nothing here reopens the reviewed algorithm.

## 1. Referenced artifact hashes (re-verified this session)

| Artifact | sha256 |
|---|---|
| Original contract `tasks/NF-WF-052-global-memory-union-read.md` | `ccffa3bb4f40d303551992f75f3431a51217513ee6ef4921812c55ded41793a3` |
| Amendment `tasks/NF-WF-052-amendment-2026-10-14.md` | `7075d793d3974d8d5478bf9270b2e41ae2e9e64096836edea46648507d5d7f04` |
| Correction `tasks/NF-WF-052-correction-2026-10-14.md` | `1febd2d236277d74bca47893accd07b9cb02c21715ff10896d379c47770162b2` |
| Addendum `tasks/NF-WF-052-addendum-2026-10-14.md` | `7bd1074cf628e146b834b62243ee4fcaf86d428102b1670419b832f0bfb49c0b` |
| Dispatch manifest `tasks/NF-WF-052-dispatch-manifest.md` | `f10e231d1ff1504d1732beea8cdab13825d51e53d5c62329d03c8a3893b1d2b7` |

## 2. Corrections (each supersedes the cited manifest statement)

**2.1 — excluded[] reason enum (supersedes manifest §6 sentence "each is
returned in excluded[] with reason OVER_CAP").** Per amendment §A1,
`OVER_CAP` is removed from the per-scope exclusion enum. `excluded[]` carries
only `"MISSING" | "UNRESOLVABLE_SOURCE"`. Over-cap arcs are NEVER enumerated
entry-by-entry anywhere in the response.

**2.2 — overflow shape (supersedes manifest §6 flat-field description).**
Over-cap reporting is exactly ONE bounded aggregate object in the response:

```
overflow: {
  overCapCount: number,                       // exact total beyond cap
  overCapArcIds: string[],                    // first 50 in ordering; prefix
  firstExcludedOrderingKey: { createdAt, id } | null
}
```

All-zero/empty (`0`, `[]`, `null`) when nothing is over cap. `overCapCount`
is authoritative when the id list truncates at 50. Arcs 21 onward therefore
appear ONLY through this aggregate — count, bounded id prefix, resume key —
never as per-scope `excluded[]` entries.

**2.3 — algorithm unchanged.** The reviewed addendum semantics stand
verbatim: disjoint sources by construction (S = every Saga row of the novel;
P = orphan arc scopes only, via novel-scoped `NOT EXISTS` against `sagas`),
one normalized key `(createdAt, id)`, ONE global boundary `lastKey` = key of
the CAP-th merged entry, successor predicates per-domain projected, exact
two-term `overCapCount`, GROUP BY-scoped P-side counting, §5 domain
agreement, all queries LIMIT/aggregate-bounded. §2.1/§2.2 change only where
the overflow is REPORTED, not how it is computed.

**2.4 — verification commands (supersedes manifest §4 web-only entry
`pnpm -F @novelforge/web exec tsc --noEmit`).** The slice touches backend
packages and the API only; the web filter was wrong. PROPOSED commands
(implementer verifies filters before first run):

```
pnpm --filter @novelforge/api exec vitest run src/memory.test.ts <new-suite-path>
pnpm --filter @novelforge/memory test
pnpm --filter @novelforge/ai-services test
pnpm --filter @novelforge/api typecheck
pnpm --filter @novelforge/memory typecheck
pnpm --filter @novelforge/ai-services typecheck
```

Plus the manifest §4 grep-based contract checks (addendum §8), unchanged.

**2.5 — NF-WF-051 dependency wording (supersedes manifest §3 row).
NF-WF-051 (interval sweeper) is integrated in the CURRENT WORKING TREE
(packages/memory/src/constants.ts, apps/worker/src/memory-jobs.ts,
apps/worker/src/memory-sweeper.test.ts — uncommitted WIP). No Git merge has
been performed for it; do not cite "MERGED" as Git evidence.

## 3. Unchanged positions

Open decisions 1–3 (ordering policy, `MEMORY_ARC_SCOPES_MAX` cap,
compiler adoption) remain PENDING author decisions; the recorded defaults are
recommendations only. NF-WF-053 and ADR-0017 are NOT readiness gates. Task
remains NOT READY: no endpoint implementation until the author records the
three decisions. Frozen contracts stay byte-identical to §1 hashes.
