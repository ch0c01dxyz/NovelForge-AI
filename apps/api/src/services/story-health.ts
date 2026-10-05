/**
 * NF-WF-010 Consumer 3 — health/consistency evaluation.
 *
 * `evaluateHealth` implements the STORY-INTELLIGENCE.md health
 * categories as evidence-backed rules (Invariant 5), plus the
 * 010-specific findings (CLOCK_CONTRADICTION, UNRESOLVED_IDENTITY,
 * MALFORMED_POLICY on read). Every finding conforms to the normative
 * EvidenceFinding schema (Invariant 7): rule, severity, evidence
 * (never a bare score), affected entities, status, remediation, and
 * BOTH clocks pinned (story-time chapter(s) + revision-time
 * sourceRevisionId).
 *
 * BOUNDED (per the 003 budget discipline, 009 F7 precedent):
 * HEALTH_MAX_FINDINGS caps the total; the stale-thread and
 * neglected-relationship windows are bounded to HEALTH_HISTORY_CHAPTERS;
 * every rule has a named per-rule cap.
 *
 * Rule-local definitions (documented per rule, Invariant 7):
 *
 * - TIMELINE_CONFLICT: two timeline entries linked to story events
 *   whose chapter numbers rank opposite to their timeline orders
 *   (orderA < orderB but chapterA > chapterB). Both entries' evidence.
 * - STALE_MAJOR_THREAD: an ACTIVE thread with importance >= 4 whose
 *   last touch (max chapter among its thread events' story events'
 *   chapters, else introducedAtChapter) is more than
 *   HEALTH_STALE_THREAD_GAP chapters behind the evaluation chapter.
 * - NEGLECTED_RELATIONSHIP: a directed pair whose covering stance's
 *   most recent fromChapter is more than HEALTH_NEGLECT_WINDOW
 *   chapters behind the evaluation chapter (advisory/OPEN, never a
 *   refusal).
 * - KNOWLEDGE_BOUNDARY_VIOLATION: a fact cited by the evaluation
 *   chapter's current version (CanonFactSource) where a cast
 *   character's knowledge row for that fact is absent or
 *   UNKNOWN/BELIEVED_FALSE in the chapter's window. Heuristic and
 *   bounded — the contract pins the finding shape and the negative
 *   test, not recall.
 * - REPEATED_NARRATIVE_PATTERN: >= HEALTH_PATTERN_MIN_CONSECUTIVE
 *   consecutive chapters within the last HEALTH_PATTERN_WINDOW whose
 *   drama-window state (assessDramaWindow over the beat projection) is
 *   BEYOND_EXTENDED_CALM. Requires a DRAMA_GAP policy; without one
 *   there is nothing to assess.
 * - IMPOSSIBLE_PREREQUISITE: an ACTIVE canon fact with a
 *   prerequisite predicate (REQUIRES_PREDICATES) and an entity-valued
 *   object, where no ACTIVE canon fact establishes the prerequisite
 *   entity (as subject or object). Literal-object prerequisites are not
 *   machine-checkable in 010 and are skipped (documented).
 * - UNRESOLVED_ENDGAME: a critical (importance 5) open promise older
 *   than HEALTH_ENDGAME_GAP chapters with no causal activity since its
 *   introduction. 010 cannot resolve promise→event linkage (no such FK
 *   exists); the rule treats the absence of any causal edge effect
 *   after introduction as "no causal path". remediation: null,
 *   status UNRESOLVED.
 * - CLOCK_CONTRADICTION: a timeline entry whose availableFromChapter
 *   names a chapter beyond the novel's current max chapter number —
 *   the story-time claim points past what exists. Evidence carries the
 *   story-time pin and the revision-time pin (birth revision).
 * - UNRESOLVED_IDENTITY: (a) a causal edge whose cause→effect timeline
 *   order span crosses a timeline entry with NULL story_event_id —
 *   traversal cannot resolve the crossing; (b) a character with NULL
 *   story_entity_id holding character_knowledge rows (canon claims
 *   with no entity to join). remediation: null, status UNRESOLVED.
 * - MALFORMED_POLICY: a stored policy failing read-side validation —
 *   treated as unconfigured (fail-open), UNRESOLVED, naming the row.
 *
 * Rejected proposals, superseded facts, and UNSUPPORTED items are
 * invisible (008/009 discipline carries over): canon reads filter to
 * ACTIVE facts.
 */
import type { NovelForgeDb } from "@novelforge/database";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import { NotFoundError } from "./platform.ts";
import type { AuditService } from "./audit.ts";
import { assessDramaWindow, type DramaBeat } from "@novelforge/narrative-rhythm";
import { MemoryError } from "./memory.ts";
import { readHeadRevisionId } from "./revisions.ts";
import { validatePolicyPayloadOnRead } from "./final-text-review.ts";
import { birthRevisionNumbers } from "./revision-birth.ts";
import {
  assertFindingEvidence,
  type EvidenceFinding,
  type FindingEvidence,
} from "./evidence-findings.ts";

export const HEALTH_MAX_FINDINGS = 200;
export const HEALTH_HISTORY_CHAPTERS = 50;
export const HEALTH_STALE_THREAD_GAP = 15;
export const HEALTH_MAJOR_THREAD_IMPORTANCE = 4;
export const HEALTH_NEGLECT_WINDOW = 20;
export const HEALTH_PATTERN_MIN_CONSECUTIVE = 3;
export const HEALTH_PATTERN_WINDOW = 12;
export const HEALTH_ENDGAME_GAP = 30;
export const HEALTH_MAX_FINDINGS_PER_RULE = 25;
/** Prerequisite predicates checked by IMPOSSIBLE_PREREQUISITE (lowercase). */
export const REQUIRES_PREDICATES = ["requires", "needs", "depends_on", "depends on"] as const;

export function createStoryHealthServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
}): {
  evaluateHealth(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapter?: number;
    asOfRevisionId?: string;
    simulation?: boolean;
  }): Promise<{
    findings: EvidenceFinding[];
    unresolved: EvidenceFinding[];
    sourceRevisionId: string;
  }>;
  unresolvedIdentities(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<EvidenceFinding[]>;
} {
  const { db } = deps;

  async function gate(
    actorUserId: string,
    workspaceId: string,
    novelId: string,
  ): Promise<void> {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
      select: { role: true },
    });
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true },
    });
    if (!membership || !novel) throw new NotFoundError("novel");
    requireCapability(membership.role, "canon:read" as Capability);
  }

  function now(): string {
    return new Date().toISOString();
  }

  function push(
    findings: EvidenceFinding[],
    perRule: Map<string, number>,
    finding: EvidenceFinding,
  ): void {
    if (findings.length >= HEALTH_MAX_FINDINGS) return;
    const count = perRule.get(finding.rule) ?? 0;
    if (count >= HEALTH_MAX_FINDINGS_PER_RULE) return;
    perRule.set(finding.rule, count + 1);
    findings.push(finding);
  }

  /** The beat projection (shared with final-text review's definition). */
  async function dramaBeats(
    novelId: string,
    chapterById: Map<string, number>,
  ): Promise<DramaBeat[]> {
    const events = await db.storyEvent.findMany({
      where: { novelId, chapterId: { not: null } },
      select: { id: true, chapterId: true },
    });
    const beats: DramaBeat[] = [];
    for (const e of events) {
      const n = chapterById.get(e.chapterId as string);
      if (n !== undefined) beats.push({ id: e.id, type: "CUSTOM", chapter: n });
    }
    return beats;
  }

  async function evaluate(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapter?: number;
    asOfRevisionId?: string;
    simulation?: boolean;
  }): Promise<{ findings: EvidenceFinding[]; unresolved: EvidenceFinding[]; sourceRevisionId: string }> {
    const { actorUserId, workspaceId, novelId } = input;
    await gate(actorUserId, workspaceId, novelId);
    if (input.simulation === true) {
      throw new MemoryError(
        400,
        "SIMULATION_SOURCE_REFUSED",
        "story health refuses simulation-tagged input",
      );
    }

    const headRevisionId = await readHeadRevisionId(db, novelId);
    if (!headRevisionId) throw new NotFoundError("revision");
    let rNumber: number | null = null;
    if (input.asOfRevisionId) {
      const rev = await db.revision.findFirst({
        where: { id: input.asOfRevisionId, novelId },
        select: { number: true },
      });
      if (!rev) throw new NotFoundError("revision");
      rNumber = rev.number;
    }
    const sourceRevisionId = input.asOfRevisionId ?? headRevisionId;

    const chapters = await db.chapter.findMany({
      where: { novelId },
      select: { id: true, number: true },
      orderBy: { number: "asc" },
    });
    const maxChapter = chapters.length > 0 ? chapters[chapters.length - 1]!.number : 0;
    const chapter = input.chapter ?? maxChapter;
    const chapterById = new Map(chapters.map((c) => [c.id, c.number]));

    /**
     * Temporal-negative gate: when asOfRevisionId is given, a row is
     * citable only if its birth revision ≤ R. Birth unknown → kept.
     */
    async function bornOk(
      refs: Array<{ entityType: string; entityId: string }>,
    ): Promise<Set<string>> {
      if (rNumber === null) return new Set(refs.map((r) => r.entityId));
      const births = await birthRevisionNumbers(db, refs);
      return new Set(
        refs
          .filter((r) => {
            const b = births.get(r.entityId);
            return b === undefined || b <= (rNumber as number);
          })
          .map((r) => r.entityId),
      );
    }

    const findings: EvidenceFinding[] = [];
    const perRule = new Map<string, number>();
    const at = now();

    // -- shared reads ----------------------------------------------------
    const timelineEvents = await db.timelineEvent.findMany({
      where: { novelId, workspaceId },
      orderBy: { order: "asc" },
      take: 500,
      select: {
        id: true,
        order: true,
        description: true,
        storyEventId: true,
        availableFromChapter: true,
      },
    });
    const tlOk = await bornOk(
      timelineEvents.map((e) => ({ entityType: "TimelineEvent", entityId: e.id })),
    );
    const tl = timelineEvents.filter((e) => tlOk.has(e.id));

    const storyEvents = await db.storyEvent.findMany({
      where: { novelId },
      take: 1000,
      select: { id: true, chapterId: true, description: true },
    });
    const seOk = await bornOk(
      storyEvents.map((e) => ({ entityType: "StoryEvent", entityId: e.id })),
    );
    const se = storyEvents.filter((e) => seOk.has(e.id));
    const chapterOfEvent = new Map<string, number>();
    for (const e of se) {
      if (e.chapterId) {
        const n = chapterById.get(e.chapterId);
        if (n !== undefined) chapterOfEvent.set(e.id, n);
      }
    }

    // -- TIMELINE_CONFLICT ------------------------------------------------
    const linked = tl
      .filter((e) => e.storyEventId !== null)
      .map((e) => ({
        ...e,
        eventChapter: chapterOfEvent.get(e.storyEventId as string),
      }))
      .filter((e) => e.eventChapter !== undefined) as Array<
      (typeof tl)[number] & { eventChapter: number }
    >;
    for (let i = 0; i < linked.length; i++) {
      for (let j = i + 1; j < linked.length; j++) {
        const a = linked[i]!;
        const b = linked[j]!;
        const orderRank = Math.sign(a.order - b.order);
        const chapterRank = Math.sign(a.eventChapter - b.eventChapter);
        if (orderRank !== 0 && chapterRank !== 0 && orderRank !== chapterRank) {
          const evidence: FindingEvidence[] = [
            {
              kind: "timelineEvent",
              id: a.id,
              order: a.order,
              revisionId: sourceRevisionId,
              detail: `order ${a.order}, linked event in chapter ${a.eventChapter}`,
            },
            {
              kind: "timelineEvent",
              id: b.id,
              order: b.order,
              revisionId: sourceRevisionId,
              detail: `order ${b.order}, linked event in chapter ${b.eventChapter}`,
            },
          ];
          push(
            findings,
            perRule,
            assertFindingEvidence({
              rule: "TIMELINE_CONFLICT",
              severity: "WARNING",
              status: "OPEN",
              evidence,
              affectedEntities: [
                { type: "event", id: a.storyEventId as string },
                { type: "event", id: b.storyEventId as string },
              ],
              remediation:
                "reconcile the timeline orders with the chapters that established the events, or unlink the entries the timeline cannot place",
              sourceRevisionId,
              evaluatedAt: at,
            }),
          );
        }
      }
    }

    // -- CLOCK_CONTRADICTION ----------------------------------------------
    for (const e of tl) {
      if (e.availableFromChapter !== null && e.availableFromChapter > maxChapter) {
        push(
          findings,
          perRule,
          assertFindingEvidence({
            rule: "CLOCK_CONTRADICTION",
            severity: "WARNING",
            status: "OPEN",
            evidence: [
              {
                kind: "timelineEvent",
                id: e.id,
                order: e.order,
                chapter: e.availableFromChapter,
                revisionId: sourceRevisionId,
                detail: `story-time pin: available from chapter ${e.availableFromChapter}, but the novel has ${maxChapter} chapters — the claim points past what exists`,
              },
            ],
            affectedEntities: [],
            remediation:
              "correct the entry's availableFromChapter to an existing chapter, or author the missing chapters first",
            sourceRevisionId,
            evaluatedAt: at,
          }),
        );
      }
    }

    // -- STALE_MAJOR_THREAD -----------------------------------------------
    const threads = await db.storyThread.findMany({
      where: { novelId, status: "ACTIVE", importance: { gte: HEALTH_MAJOR_THREAD_IMPORTANCE } },
      take: 200,
      select: { id: true, title: true, importance: true, introducedAtChapter: true },
    });
    const thOk = await bornOk(
      threads.map((t) => ({ entityType: "StoryThread", entityId: t.id })),
    );
    for (const t of threads.filter((t) => thOk.has(t.id))) {
      const links = await db.storyThreadEvent.findMany({
        where: { threadId: t.id },
        select: { eventId: true },
      });
      let lastTouch = t.introducedAtChapter ?? 0;
      for (const l of links) {
        const ch = chapterOfEvent.get(l.eventId);
        if (ch !== undefined && ch > lastTouch) lastTouch = ch;
      }
      const gap = chapter - lastTouch;
      if (gap > HEALTH_STALE_THREAD_GAP && chapter - lastTouch <= HEALTH_HISTORY_CHAPTERS + HEALTH_STALE_THREAD_GAP) {
        push(
          findings,
          perRule,
          assertFindingEvidence({
            rule: "STALE_MAJOR_THREAD",
            severity: "WARNING",
            status: "OPEN",
            evidence: [
              {
                kind: "fact",
                id: t.id,
                chapter: lastTouch,
                revisionId: sourceRevisionId,
                detail: `major thread "${t.title}" (importance ${t.importance}) last touched at chapter ${lastTouch}; ${gap} chapters ago (evaluation chapter ${chapter})`,
              },
            ],
            affectedEntities: [{ type: "thread", id: t.id }],
            remediation:
              "advance, resolve, or explicitly dormatize the thread — a major thread silent for this long reads as forgotten",
            sourceRevisionId,
            evaluatedAt: at,
          }),
        );
      }
    }

    // -- NEGLECTED_RELATIONSHIP -------------------------------------------
    const windowStart = Math.max(1, chapter - HEALTH_HISTORY_CHAPTERS);
    const stances = await db.relationshipStance.findMany({
      where: {
        fromCharacter: { novelId, workspaceId },
        fromChapter: { lte: chapter },
        OR: [{ toChapter: null }, { toChapter: { gt: chapter } }],
      },
      take: 500,
      select: {
        id: true,
        fromCharacterId: true,
        toCharacterId: true,
        stance: true,
        fromChapter: true,
      },
    });
    const stOk = await bornOk(
      stances.map((s) => ({ entityType: "RelationshipStance", entityId: s.id })),
    );
    const seenPairs = new Map<string, (typeof stances)[number]>();
    for (const s of stances.filter((s) => stOk.has(s.id))) {
      const key = `${s.fromCharacterId}→${s.toCharacterId}`;
      const prev = seenPairs.get(key);
      if (!prev || s.fromChapter > prev.fromChapter) seenPairs.set(key, s);
    }
    for (const s of seenPairs.values()) {
      if (s.fromChapter >= windowStart && chapter - s.fromChapter > HEALTH_NEGLECT_WINDOW) {
        push(
          findings,
          perRule,
          assertFindingEvidence({
            rule: "NEGLECTED_RELATIONSHIP",
            severity: "INFO",
            status: "OPEN",
            evidence: [
              {
                kind: "stance",
                id: s.id,
                chapter: s.fromChapter,
                revisionId: sourceRevisionId,
                detail: `stance ${s.stance} unchanged since chapter ${s.fromChapter} (${chapter - s.fromChapter} chapters, evaluation chapter ${chapter})`,
              },
            ],
            affectedEntities: [
              { type: "character", id: s.fromCharacterId },
              { type: "character", id: s.toCharacterId },
            ],
            // Advisory/OPEN, never a refusal (contract).
            remediation:
              "consider whether this relationship still serves the story — stasis this long is a note, not a defect",
            sourceRevisionId,
            evaluatedAt: at,
          }),
        );
      }
    }

    // -- KNOWLEDGE_BOUNDARY_VIOLATION --------------------------------------
    const evalChapter = chapters.find((c) => c.number === chapter);
    if (evalChapter) {
      const currentVersion = await db.chapterVersion.findFirst({
        where: { chapterId: evalChapter.id },
        orderBy: { number: "desc" },
        select: { id: true },
      });
      if (currentVersion) {
        const sources = await db.canonFactSource.findMany({
          where: { chapterVersionId: currentVersion.id },
          select: { canonFactId: true },
          take: 100,
        });
        const factIds = [...new Set(sources.map((s) => s.canonFactId))];
        if (factIds.length > 0) {
          const cast = await db.characterState.groupBy({
            by: ["characterId"],
            where: {
              character: { novelId },
              fromChapter: { lte: chapter },
              OR: [{ toChapter: null }, { toChapter: { gt: chapter } }],
            },
            orderBy: { characterId: "asc" },
            take: 12,
          });
          const knowledge = await db.characterKnowledge.findMany({
            where: {
              characterId: { in: cast.map((c) => c.characterId) },
              factId: { in: factIds },
              fromChapter: { lte: chapter },
              OR: [{ toChapter: null }, { toChapter: { gt: chapter } }],
            },
            select: { characterId: true, factId: true, stance: true },
          });
          const knownBy = new Map<string, string>();
          for (const k of knowledge) knownBy.set(`${k.characterId}:${k.factId}`, k.stance);
          for (const c of cast) {
            for (const factId of factIds) {
              const stance = knownBy.get(`${c.characterId}:${factId}`);
              // Heuristic (contract): the chapter cites the fact and the
              // character is in the chapter's cast; an absent row or an
              // explicit UNKNOWN/BELIEVED_FALSE is the boundary signal.
              if (stance === undefined || stance === "UNKNOWN" || stance === "BELIEVED_FALSE") {
                push(
                  findings,
                  perRule,
                  assertFindingEvidence({
                    rule: "KNOWLEDGE_BOUNDARY_VIOLATION",
                    severity: "WARNING",
                    status: "OPEN",
                    evidence: [
                      {
                        kind: "chapterVersion",
                        id: currentVersion.id,
                        chapter,
                        revisionId: sourceRevisionId,
                        detail: `chapter ${chapter}'s current version cites canon fact ${factId}`,
                      },
                      {
                        kind: "character",
                        id: c.characterId,
                        chapter,
                        detail:
                          stance === undefined
                            ? `no knowledge row for fact ${factId} in chapter ${chapter}'s window`
                            : `knowledge stance for fact ${factId} is ${stance} in chapter ${chapter}'s window`,
                      },
                    ],
                    affectedEntities: [
                      { type: "character", id: c.characterId },
                      { type: "entity", id: factId },
                    ],
                    remediation:
                      "record the character's knowledge of this fact (or confirm they act without it) — the boundary is unguarded here",
                    sourceRevisionId,
                    evaluatedAt: at,
                  }),
                );
              }
            }
          }
        }
      }
    }

    // -- REPEATED_NARRATIVE_PATTERN ---------------------------------------
    const dramaPolicy = await db.narrativePolicy.findFirst({
      where: { novelId, kind: "DRAMA_GAP" },
      select: { id: true, payload: true },
    });
    if (dramaPolicy) {
      const readProblem = validatePolicyPayloadOnRead("DRAMA_GAP", dramaPolicy.payload);
      if (readProblem === null) {
        const beats = await dramaBeats(novelId, chapterById);
        const beatChapters = beats.map((b) => b.chapter).sort((a, b) => a - b);
        const chaptersSince = (c: number): number => {
          let last = 0;
          for (const b of beatChapters) {
            if (b < c) last = b;
            else break;
          }
          return c - last;
        };
        let run = 0;
        const runChapters: number[] = [];
        const patternStart = Math.max(1, chapter - HEALTH_PATTERN_WINDOW);
        for (let c = patternStart; c <= chapter; c++) {
          const w = assessDramaWindow({
            policy: dramaPolicy.payload as never,
            chaptersSinceDrama: chaptersSince(c),
          });
          if (!("problem" in w) && w.state === "BEYOND_EXTENDED_CALM") {
            run++;
            runChapters.push(c);
          } else {
            run = 0;
            runChapters.length = 0;
          }
          if (run >= HEALTH_PATTERN_MIN_CONSECUTIVE) break;
        }
        if (run >= HEALTH_PATTERN_MIN_CONSECUTIVE) {
          push(
            findings,
            perRule,
            assertFindingEvidence({
              rule: "REPEATED_NARRATIVE_PATTERN",
              severity: "INFO",
              status: "OPEN",
              evidence: runChapters.map((c) => ({
                kind: "span" as const,
                chapter: c,
                revisionId: sourceRevisionId,
                detail: `chapter ${c}: drama window BEYOND_EXTENDED_CALM`,
              })),
              affectedEntities: [],
              remediation:
                "the calm-after-payoff pattern repeats across consecutive chapters — vary the rhythm or confirm the extended calm is intended",
              sourceRevisionId,
              evaluatedAt: at,
            }),
          );
        }
      }
    }

    // -- IMPOSSIBLE_PREREQUISITE --------------------------------------------
    const reqFacts = await db.canonFact.findMany({
      where: {
        novelId,
        status: "ACTIVE",
        objectEntityId: { not: null },
      },
      take: 500,
      select: { id: true, predicate: true, objectEntityId: true, statement: true },
    });
    const reqOk = await bornOk(
      reqFacts.map((f) => ({ entityType: "CanonFact", entityId: f.id })),
    );
    const prereqFacts = reqFacts.filter(
      (f) =>
        reqOk.has(f.id) &&
        (REQUIRES_PREDICATES as readonly string[]).includes(f.predicate.toLowerCase()),
    );
    for (const f of prereqFacts) {
      // The requiring fact itself mentions the prerequisite as its object —
      // that dependency claim does not establish the entity exists, so it
      // is excluded: establishment needs a DIFFERENT active fact.
      const established = await db.canonFact.findFirst({
        where: {
          novelId,
          status: "ACTIVE",
          id: { not: f.id },
          OR: [{ entityId: f.objectEntityId as string }, { objectEntityId: f.objectEntityId as string }],
        },
        select: { id: true },
      });
      const estOk =
        established &&
        (await bornOk([{ entityType: "CanonFact", entityId: established.id }])).has(established.id);
      if (!estOk) {
        push(
          findings,
          perRule,
          assertFindingEvidence({
            rule: "IMPOSSIBLE_PREREQUISITE",
            severity: "CRITICAL",
            status: "OPEN",
            evidence: [
              {
                kind: "fact",
                id: f.id,
                revisionId: sourceRevisionId,
                detail: `ACTIVE fact "${f.statement}" requires entity ${f.objectEntityId}, but no ACTIVE canon fact establishes that entity`,
              },
            ],
            affectedEntities: [{ type: "entity", id: f.objectEntityId as string }],
            remediation:
              "establish the prerequisite in canon (an ACTIVE fact about the entity) or revise the requiring fact",
            sourceRevisionId,
            evaluatedAt: at,
          }),
        );
      }
    }

    // -- UNRESOLVED_ENDGAME ---------------------------------------------------
    const promises = await db.storyPromise.findMany({
      where: {
        novelId,
        importance: 5,
        status: { in: ["SETUP", "DEVELOPING", "READY_FOR_PAYOFF"] },
      },
      take: 50,
      select: { id: true, title: true, introducedAtChapter: true },
    });
    const prOk = await bornOk(
      promises.map((p) => ({ entityType: "StoryPromise", entityId: p.id })),
    );
    for (const p of promises.filter((p) => prOk.has(p.id))) {
      const introduced = p.introducedAtChapter ?? 0;
      if (chapter - introduced <= HEALTH_ENDGAME_GAP) continue;
      // No causal path: no causal edge whose effect event was
      // established after the promise's introduction. 010 cannot
      // resolve promise→event linkage (no such FK); the absence of
      // any later causal activity is the checkable proxy.
      const edges = await db.causalEdge.findMany({
        where: { novelId },
        select: { effectEventId: true },
        take: 500,
      });
      let causalSince = false;
      for (const e of edges) {
        const ch = chapterOfEvent.get(e.effectEventId);
        if (ch !== undefined && ch > introduced) {
          causalSince = true;
          break;
        }
      }
      if (!causalSince) {
        push(
          findings,
          perRule,
          assertFindingEvidence({
            rule: "UNRESOLVED_ENDGAME",
            severity: "CRITICAL",
            status: "UNRESOLVED",
            evidence: [
              {
                kind: "fact",
                id: p.id,
                chapter: introduced,
                revisionId: sourceRevisionId,
                detail: `critical promise "${p.title}" introduced at chapter ${introduced} with no causal activity since (evaluation chapter ${chapter})`,
              },
            ],
            affectedEntities: [{ type: "promise", id: p.id }],
            remediation: null,
            sourceRevisionId,
            evaluatedAt: at,
          }),
        );
      }
    }

    // -- UNRESOLVED_IDENTITY --------------------------------------------------
    // (a) causal edges whose cause→effect timeline span crosses an
    // unlinked timeline entry.
    const causalEdges = await db.causalEdge.findMany({
      where: { novelId },
      take: 500,
      select: { id: true, causeEventId: true, effectEventId: true },
    });
    const orderByEvent = new Map<string, number>();
    for (const t of tl) {
      if (t.storyEventId) orderByEvent.set(t.storyEventId, t.order);
    }
    for (const edge of causalEdges) {
      const causeOrder = orderByEvent.get(edge.causeEventId);
      const effectOrder = orderByEvent.get(edge.effectEventId);
      if (causeOrder === undefined || effectOrder === undefined) continue;
      const lo = Math.min(causeOrder, effectOrder);
      const hi = Math.max(causeOrder, effectOrder);
      const crossed = tl.find(
        (t) => t.order > lo && t.order < hi && t.storyEventId === null,
      );
      if (crossed) {
        push(
          findings,
          perRule,
          assertFindingEvidence({
            rule: "UNRESOLVED_IDENTITY",
            severity: "WARNING",
            status: "UNRESOLVED",
            evidence: [
              {
                kind: "timelineEvent",
                id: crossed.id,
                order: crossed.order,
                revisionId: sourceRevisionId,
                detail: `timeline entry "${crossed.description.slice(0, 80)}" (order ${crossed.order}) has NULL story_event_id and sits between the cause (order ${causeOrder}) and effect (order ${effectOrder}) of causal edge ${edge.id}`,
              },
            ],
            affectedEntities: [{ type: "event", id: edge.causeEventId }],
            remediation: null,
            sourceRevisionId,
            evaluatedAt: at,
          }),
        );
      }
    }
    // (b) characters with NULL story_entity_id holding canon knowledge.
    const unlinkedChars = await db.character.findMany({
      where: { novelId, storyEntityId: null },
      take: 200,
      select: { id: true, name: true },
    });
    if (unlinkedChars.length > 0) {
      const knowledgeCounts = await db.characterKnowledge.groupBy({
        by: ["characterId"],
        where: { characterId: { in: unlinkedChars.map((c) => c.id) } },
        _count: { id: true },
      });
      const withKnowledge = new Set(knowledgeCounts.map((k) => k.characterId));
      for (const c of unlinkedChars.filter((c) => withKnowledge.has(c.id))) {
        push(
          findings,
          perRule,
          assertFindingEvidence({
            rule: "UNRESOLVED_IDENTITY",
            severity: "WARNING",
            status: "UNRESOLVED",
            evidence: [
              {
                kind: "character",
                id: c.id,
                revisionId: sourceRevisionId,
                detail: `character "${c.name}" has NULL story_entity_id but holds character_knowledge rows — canon joins for this character need an author-authored link`,
              },
            ],
            affectedEntities: [{ type: "character", id: c.id }],
            remediation: null,
            sourceRevisionId,
            evaluatedAt: at,
          }),
        );
      }
    }

    // -- MALFORMED_POLICY (read-side, fail-open) ------------------------------
    const policyRows = await db.narrativePolicy.findMany({
      where: { novelId },
      select: { id: true, kind: true, payload: true },
    });
    const polOk = await bornOk(
      policyRows.map((p) => ({ entityType: "NarrativePolicy", entityId: p.id })),
    );
    for (const p of policyRows.filter((p) => polOk.has(p.id))) {
      const problem = validatePolicyPayloadOnRead(
        p.kind as "DRAMA_GAP" | "COOLDOWN" | "SCALE",
        p.payload,
      );
      if (problem) {
        push(
          findings,
          perRule,
          assertFindingEvidence({
            rule: "MALFORMED_POLICY",
            severity: "WARNING",
            status: "UNRESOLVED",
            evidence: [
              {
                kind: "policy",
                id: p.id,
                revisionId: sourceRevisionId,
                detail: `${p.kind} policy row fails read-side validation and reads as unconfigured: ${problem}`,
              },
            ],
            affectedEntities: [],
            remediation: null,
            sourceRevisionId,
            evaluatedAt: at,
          }),
        );
      }
    }

    const unresolved = findings.filter((f) => f.status === "UNRESOLVED");
    return { findings, unresolved, sourceRevisionId };
  }

  return {
    evaluateHealth: evaluate,
    async unresolvedIdentities({ actorUserId, workspaceId, novelId }) {
      const { findings } = await evaluate({ actorUserId, workspaceId, novelId });
      return findings.filter((f) => f.rule === "UNRESOLVED_IDENTITY");
    },
  };
}

export type StoryHealthServices = ReturnType<typeof createStoryHealthServices>;
