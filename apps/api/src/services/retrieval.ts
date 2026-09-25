/**
 * Knowledge / retrieval services (Phase 5).
 *
 * Responsibilities, in the order the roadmap names them: references with
 * append-only versions, parsing/chunking into citable units, embeddings as a
 * rebuildable projection, and hybrid retrieval that is tenant-safe and
 * evidence-bearing.
 *
 * Three invariants shape every method here (CLAUDE.md §2, §7, §9, §10):
 *
 *   1. Nothing here is canon. A reference is external material; a chunk is a
 *      projection of it. Ingestion never writes to a story table, and no
 *      retrieval result is story truth.
 *   2. Every result is traceable. A hit carries the chunk, the reference
 *      version it was cut from, and each retriever's rank, so a caller can
 *      cite it and an auditor can reconstruct why it was returned.
 *   3. Tenant and spoiler boundaries are enforced in the QUERY, not after
 *      it. Filtering a ranked list in application code means the wrong rows
 *      were already read; the workspace and chapter predicates go into the
 *      SQL.
 */
import { createHash } from "node:crypto";
import type { NovelForgeDb } from "@novelforge/database";
import type { ModelProfile } from "@novelforge/ai-core";
import { requireCapability } from "@novelforge/auth/authorization";
import {
  chunkText,
  verifyChunks,
  fuse,
  canView,
  parseViewMode,
  DEFAULT_RRF_K,
  type Chunk as ChunkUnit,
  type FusedResult,
  type Retriever,
  type ViewMode,
} from "@novelforge/retrieval";
import { BadGatewayError, ConflictError, NotFoundError } from "./platform.ts";
import { appendVersionWithRetry, prismaCode } from "./definitions.ts";
import type { AuditService } from "./audit.ts";

/**
 * Embedding width. Must equal the `vector(N)` column in the schema; a
 * mismatch is rejected at insert by PostgreSQL rather than silently stored.
 *
 * 1536 is the OpenAI-compatible default. Changing it is a migration, not a
 * config value: the column type is fixed because pgvector cannot index a
 * dimensionless column.
 */
export const EMBEDDING_DIMENSION = 1536;

/** Chunks per embedding request. One call for N chunks, not N calls. */
export const EMBED_BATCH_SIZE = 64;

/** Candidate pool per retriever before fusion. */
export const DEFAULT_CANDIDATE_LIMIT = 50;

/**
 * Ceiling on the chunks one version may project.
 *
 * `ingest` inserts every chunk in a SINGLE statement with 4 bound parameters
 * each, and PostgreSQL's wire protocol caps a statement at 65535 parameters
 * (u16). Past ~16000 chunks the insert dies with a driver error the routes
 * turn into a bare 500 — so an author who pasted a long reference got a
 * failure that named nothing. Refusing the version with a typed 409 says
 * which limit was hit and by how much. 12000 leaves headroom under the cap
 * while sitting far above any real reference; a version approaching it is a
 * sign the material should be split, not a sign the limit should be raised.
 */
export const MAX_CHUNKS_PER_VERSION = 12_000;

export interface ReferenceView {
  id: string;
  workspaceId: string;
  novelId: string | null;
  key: string;
  title: string;
  kind: string;
  source: string | null;
  status: string;
  version: number | null;
  versionId: string | null;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReferenceDetail extends ReferenceView {
  content: string | null;
  charCount: number | null;
}

export interface RetrievalHit {
  chunkId: string;
  referenceId: string;
  referenceVersionId: string;
  referenceTitle: string;
  /** Character span within the reference version's content. */
  start: number;
  end: number;
  text: string;
  /** Fused score, and each retriever's rank for this chunk. */
  score: number;
  foundBy: Retriever[];
  /** Per-retriever rank/score/detail, so the result explains itself. */
  contributions: Array<{ retriever: Retriever; rank: number; score?: number; detail?: string }>;
}

export interface SearchResult {
  hits: RetrievalHit[];
  /**
   * How many fused candidates the application-level recheck dropped.
   *
   * The SQL predicate is the primary spoiler control and already filtered,
   * so in normal operation this is 0 — a non-zero value means the SQL
   * predicate and `canView` have drifted and a leg is admitting rows it
   * should not. It is reported (and persisted) as that signal.
   */
  withheldCount: number;
  /** Which legs ran; a degraded search is distinguishable from a full one. */
  retrievers: Retriever[];
  mode: ViewMode;
  readerChapter: number | null;
  auditId: string;
}

/**
 * The embedding port. `AiServices.embed` satisfies it.
 *
 * Declared structurally so this service can be tested without a gateway,
 * exactly as the Phase 4 executor declares `StepGenerator`.
 */
export interface Embedder {
  embed(input: {
    actorUserId: string;
    workspaceId: string;
    texts: string[];
  }): Promise<{ vectors: number[][]; model: string; generationId: string | null }>;
}

export interface RetrievalServices {
  createReference(input: {
    actorUserId: string;
    workspaceId: string;
    novelId?: string;
    key: string;
    title: string;
    kind?: string;
    source?: string;
    content: string;
  }): Promise<{ id: string; versionId: string; version: number }>;

  addReferenceVersion(input: {
    actorUserId: string;
    referenceId: string;
    content: string;
    note?: string;
  }): Promise<{ versionId: string; version: number; chunks: number }>;

  publishReference(input: {
    actorUserId: string;
    referenceId: string;
  }): Promise<void>;

  listReferences(input: { actorUserId: string; workspaceId: string }): Promise<ReferenceView[]>;
  getReference(input: {
    actorUserId: string;
    referenceId: string;
  }): Promise<ReferenceDetail>;

  /**
   * Re-ingest a reference version: chunk, embed, replace projections.
   * Idempotent — re-running on unchanged content is a no-op.
   */
  ingest(input: {
    actorUserId: string;
    referenceVersionId: string;
    /** Set chapter visibility on every chunk produced. */
    availableFromChapter?: number | null;
  }): Promise<{ chunks: number; embedded: number; skipped: boolean }>;

  search(input: {
    actorUserId: string;
    workspaceId: string;
    query: string;
    novelId?: string;
    mode?: unknown;
    readerChapter?: number;
    limit?: number;
    /** Attribution: which generation or workflow step issued this. */
    generationId?: string;
    /**
     * Set by the caller once the step row exists, so the audit row can be
     * linked back to the step that issued the search. The executor writes the
     * step row AFTER the search returns (it needs the results to fill it), so
     * this is a second, best-effort update rather than a create-time field.
     */
    stepRunId?: string;
  }): Promise<SearchResult>;

  /** Retrieval history for a workspace, newest first. */
  listRetrievals(input: {
    actorUserId: string;
    workspaceId: string;
    limit?: number;
  }): Promise<Array<{
    id: string;
    query: string;
    mode: string;
    readerChapter: number | null;
    returnedCount: number;
    withheldCount: number;
    retrievers: string[];
    latencyMs: number | null;
    createdAt: Date;
  }>>;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** A row from the raw hybrid-search query. */
interface SearchRow {
  chunk_id: string;
  reference_id: string;
  reference_version_id: string;
  reference_title: string;
  text: string;
  start: number;
  end: number;
  rank: number;
  score: number | null;
  /**
   * Retriever-specific provenance, matching `fuse`'s `Hit.detail`. Always
   * NULL today: neither leg has a value worth the cost — a lexical
   * `ts_headline` would re-parse every candidate chunk per search for a
   * snippet no caller reads. The column stays in the select so the shape
   * matches `Hit` without a conditional spread, and so a future leg that
   * does produce provenance has somewhere to put it.
   */
  detail: string | null;
}

export function createRetrievalServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
  ai: Embedder;
  /** The profile used to resolve an embedding model. */
  embeddingProfile?: ModelProfile;
  dbg?: { error?: (message: string, meta: unknown) => void };
}): RetrievalServices {
  const { db, audit, ai, dbg } = deps;

  async function gateWorkspace(
    workspaceId: string,
    userId: string,
    cap: Parameters<typeof requireCapability>[1],
  ): Promise<void> {
    const membership = await db.membership.findFirst({
      where: { workspaceId, userId },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("workspace");
    requireCapability(membership.role, cap);
  }

  function hash(content: string): string {
    return createHash("sha256").update(content, "utf8").digest("hex");
  }

  /**
   * The model id the EMBEDDING profile currently resolves to, read from the
   * admin mapping rather than by calling a provider. Returns null when the
   * profile is unmapped — in which case a skip is never taken, so an
   * unmapped profile keeps its previous behaviour of re-ingesting.
   */
  async function embeddingModelFor(): Promise<string | null> {
    const mapping = await db.modelProfileMapping.findFirst({
      where: { profile: "EMBEDDING", enabled: true },
      orderBy: [{ priority: "asc" }],
      select: { model: { select: { modelId: true } } },
    });
    return mapping?.model.modelId ?? null;
  }

  function checkKey(key: string): void {
    if (!KEY_PATTERN.test(key)) {
      throw new ConflictError(
        "key must be 1-64 chars of lowercase letters, digits and dashes",
      );
    }
  }

  /**
   * Load a reference and authorize a write against it. Scope comes from the
   * stored row, never from caller input.
   */
  async function referenceForWrite(
    referenceId: string,
    actorUserId: string,
  ): Promise<{ id: string; workspaceId: string; status: string }> {
    const ref = await db.reference.findUnique({
      where: { id: referenceId },
      select: { id: true, workspaceId: true, status: true },
    });
    if (!ref) throw new NotFoundError("reference");
    await gateWorkspace(ref.workspaceId, actorUserId, "reference:manage");
    return ref;
  }

  async function referenceForRead(
    referenceId: string,
    actorUserId: string,
  ): Promise<{ id: string; workspaceId: string }> {
    const ref = await db.reference.findUnique({
      where: { id: referenceId },
      select: { id: true, workspaceId: true },
    });
    if (!ref) throw new NotFoundError("reference");
    await gateWorkspace(ref.workspaceId, actorUserId, "reference:read");
    return ref;
  }

  /**
   * Embed a batch of texts and write one Embedding row per vector.
   *
   * Fails closed on an arity or width mismatch: a provider that returns the
   * wrong number of vectors, or vectors of the wrong length, would otherwise
   * silently mis-align embeddings with chunks — every later search would
   * return the wrong text for a citation.
   */
  async function embedChunks(
    actorUserId: string,
    workspaceId: string,
    chunkIds: string[],
    texts: string[],
  ): Promise<number> {
    let embedded = 0;
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batchTexts = texts.slice(i, i + EMBED_BATCH_SIZE);
      const batchIds = chunkIds.slice(i, i + EMBED_BATCH_SIZE);
      const result = await ai.embed({ actorUserId, workspaceId, texts: batchTexts });

      if (result.vectors.length !== batchTexts.length) {
        throw new ConflictError(
          `embedding provider returned ${result.vectors.length} vectors for ` +
            `${batchTexts.length} inputs`,
        );
      }
      for (let j = 0; j < result.vectors.length; j += 1) {
        const vector = result.vectors[j]!;
        if (vector.length !== EMBEDDING_DIMENSION) {
          throw new ConflictError(
            `embedding provider returned a ${vector.length}-dimensional vector; ` +
              `this deployment stores ${EMBEDDING_DIMENSION}`,
          );
        }
        // The vector is stringified into a SQL literal below, so what the
        // provider returned must be numbers before that happens. pgvector
        // rejects NaN, Infinity and any non-numeric element, so this fails
        // closed either way — but without the check the failure is a raw
        // driver error surfacing as a 500, with no indication that the
        // provider, not the database, was at fault.
        if (!vector.every((n) => typeof n === "number" && Number.isFinite(n))) {
          throw new ConflictError(
            `embedding provider returned a non-finite value at index ${j}`,
          );
        }
      }

      // One INSERT per batch. The vector literal is built from numbers this
      // process generated, never from user text, and the ids travel as
      // bound parameters.
      const values: string[] = [];
      const params: unknown[] = [result.model];
      batchIds.forEach((chunkId, j) => {
        const base = params.length;
        params.push(chunkId, `[${result.vectors[j]!.join(",")}]`);
        values.push(`($${base + 1}, $1, $${base + 2}::vector, ${EMBEDDING_DIMENSION})`);
      });
      await db.$executeRawUnsafe(
        `INSERT INTO embeddings (chunk_id, model, vector, dimensions)
         VALUES ${values.join(", ")}
         ON CONFLICT (chunk_id) DO UPDATE
           SET model = EXCLUDED.model,
               vector = EXCLUDED.vector,
               dimensions = EXCLUDED.dimensions`,
        ...params,
      );
      embedded += batchIds.length;
    }
    return embedded;
  }

  return {
    async createReference(input) {
      checkKey(input.key);
      await gateWorkspace(input.workspaceId, input.actorUserId, "reference:manage");

      if (input.novelId) {
        const novel = await db.novel.findFirst({
          where: { id: input.novelId, workspaceId: input.workspaceId },
          select: { id: true },
        });
        if (!novel) throw new NotFoundError("novel");
      }

      const content = input.content ?? "";
      // A duplicate key is a client mistake, not a server fault. The unique
      // index is the real check — a read-then-write pre-check would still
      // lose the race — so the P2002 it raises is translated to the 409
      // every other create in this codebase returns.
      const created = await db
        .$transaction(async (tx) => {
          const ref = await tx.reference.create({
            data: {
              workspaceId: input.workspaceId,
              novelId: input.novelId ?? null,
              key: input.key,
              title: input.title,
              kind: (input.kind ?? "NOTE") as never,
              source: input.source ?? null,
              createdById: input.actorUserId,
            },
            select: { id: true },
          });
          const version = await tx.referenceVersion.create({
            data: {
              referenceId: ref.id,
              number: 1,
              content,
              contentHash: hash(content),
              charCount: content.length,
              createdById: input.actorUserId,
            },
            select: { id: true },
          });
          await tx.reference.update({
            where: { id: ref.id },
            data: { currentVersionId: version.id },
          });
          return { id: ref.id, versionId: version.id, version: 1 };
        })
        .catch((err: unknown): never => {
          if (prismaCode(err) === "P2002") {
            throw new ConflictError(`reference key "${input.key}" already exists in this workspace`);
          }
          throw err;
        });

      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        action: "reference.created",
        entityType: "Reference",
        entityId: created.id,
        payload: { key: input.key, kind: input.kind ?? "NOTE", version: 1 },
      });
      return created;
    },

    async addReferenceVersion(input) {
      const ref = await referenceForWrite(input.referenceId, input.actorUserId);
      const content = input.content ?? "";

      const created = await appendVersionWithRetry(
        () =>
          db.$transaction(async (tx) => {
            const last = await tx.referenceVersion.findFirst({
              where: { referenceId: ref.id },
              orderBy: { number: "desc" },
              select: { number: true },
            });
            const number = (last?.number ?? 0) + 1;
            const version = await tx.referenceVersion.create({
              data: {
                referenceId: ref.id,
                number,
                content,
                contentHash: hash(content),
                charCount: content.length,
                note: input.note ?? null,
                createdById: input.actorUserId,
              },
              select: { id: true },
            });
            await tx.reference.update({
              where: { id: ref.id },
              data: {
                currentVersionId: version.id,
                // A new revision supersedes the ingested projection, so an
                // ACTIVE reference must return to DRAFT. Both search legs join
                // `r.current_version_id = rv.id`, so the moment this pointer
                // moves, the previous version's chunks stop matching and the
                // new version has none — the reference vanished from every
                // search while still reading ACTIVE, with no error and no way
                // for the author to tell why. Dropping to DRAFT makes that
                // state honest, and it is what makes the second publish below
                // able to run at all. ARCHIVED is deliberately left alone: it
                // is out of scope by choice, not by staleness.
                ...(ref.status === "ACTIVE" ? { status: "DRAFT" as const } : {}),
              },
            });
            return { versionId: version.id, version: number };
          }),
        "reference",
        ref.id,
      );

      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: ref.workspaceId,
        action: "reference.version-added",
        entityType: "ReferenceVersion",
        entityId: created.versionId,
        payload: { referenceId: ref.id, version: created.version, chars: content.length },
      });
      return { ...created, chunks: 0 };
    },

    async publishReference(input) {
      const ref = await referenceForWrite(input.referenceId, input.actorUserId);
      const withVersion = await db.reference.findUniqueOrThrow({
        where: { id: ref.id },
        select: { currentVersionId: true, status: true },
      });
      if (!withVersion.currentVersionId) {
        throw new ConflictError("reference has no content to publish");
      }
      // Publishing without chunks would put a reference in the retrieval
      // scope that can never be found — a silent no-op the author would
      // read as "retrieval is broken".
      const chunks = await db.chunk.count({
        where: { referenceVersionId: withVersion.currentVersionId },
      });
      if (chunks === 0) {
        throw new ConflictError("reference has no ingested chunks; ingest it first");
      }
      if (withVersion.status === "ACTIVE") return;

      await db.reference.update({ where: { id: ref.id }, data: { status: "ACTIVE" } });
      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: ref.workspaceId,
        action: "reference.published",
        entityType: "Reference",
        entityId: ref.id,
        payload: { chunks },
      });
    },

    async listReferences(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "reference:read");
      const rows = await db.reference.findMany({
        where: { workspaceId: input.workspaceId },
        include: {
          currentVersion: {
            select: { id: true, number: true, _count: { select: { chunks: true } } },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
      });
      return rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspaceId,
        novelId: r.novelId,
        key: r.key,
        title: r.title,
        kind: r.kind,
        source: r.source,
        status: r.status,
        version: r.currentVersion?.number ?? null,
        versionId: r.currentVersion?.id ?? null,
        chunkCount: r.currentVersion?._count.chunks ?? 0,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    },

    async getReference(input) {
      const ref = await referenceForRead(input.referenceId, input.actorUserId);
      const row = await db.reference.findUniqueOrThrow({
        where: { id: ref.id },
        include: {
          currentVersion: {
            select: { id: true, number: true, content: true, charCount: true, _count: { select: { chunks: true } } },
          },
        },
      });
      return {
        id: row.id,
        workspaceId: row.workspaceId,
        novelId: row.novelId,
        key: row.key,
        title: row.title,
        kind: row.kind,
        source: row.source,
        status: row.status,
        version: row.currentVersion?.number ?? null,
        versionId: row.currentVersion?.id ?? null,
        chunkCount: row.currentVersion?._count.chunks ?? 0,
        content: row.currentVersion?.content ?? null,
        charCount: row.currentVersion?.charCount ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },

    async ingest(input) {
      const version = await db.referenceVersion.findUnique({
        where: { id: input.referenceVersionId },
        include: { reference: { select: { id: true, workspaceId: true, novelId: true } } },
      });
      if (!version) throw new NotFoundError("reference version");
      const workspaceId = version.reference.workspaceId;
      await gateWorkspace(workspaceId, input.actorUserId, "reference:manage");

      // Idempotence: content that has not changed does not need re-chunking
      // or re-embedding. The test is the PROJECTION's own state — are there
      // chunks, and does every one of them have a vector? — so a partially
      // ingested version is repaired rather than skipped.
      //
      // `contentHash` is NOT consulted, deliberately: chunks are keyed to an
      // immutable version, so a version's text can never change under them,
      // and a hash comparison would need a stored per-ingest hash to compare
      // against. The projection state is the honest signal.
      const existing = await db.chunk.count({
        where: { referenceVersionId: version.id },
      });
      const alreadyEmbedded = await db.$queryRawUnsafe<
        Array<{ n: bigint; models: bigint; model: string | null }>
      >(
        `SELECT count(*)::bigint AS n,
                count(DISTINCT e.model)::bigint AS models,
                min(e.model) AS model
           FROM embeddings e
           JOIN chunks c ON c.id = e.chunk_id
          WHERE c.reference_version_id = $1::uuid`,
        version.id,
      );
      const embeddedCount = Number(alreadyEmbedded[0]?.n ?? 0);
      const storedModels = Number(alreadyEmbedded[0]?.models ?? 0);
      const storedModel = alreadyEmbedded[0]?.model ?? null;

      // The skip also has to prove the stored vectors came from the model
      // retrieval will now search against. `search` filters the vector leg on
      // `e.model = <the model this query was embedded with>`, so when an
      // admin remaps the EMBEDDING profile the existing vectors stop
      // matching and the vector leg goes silent — and a skip here refused
      // the one operation that could repair it, leaving the reference
      // vector-unsearchable with no path back. Comparing the recorded model
      // against the profile's current mapping is enough: routing may choose a
      // different gateway, but a gateway serves a model under the same name.
      const profileModel = await embeddingModelFor();

      const modelsMatch =
        profileModel !== null && storedModels === 1 && storedModel === profileModel;

      // Re-ingesting with a DIFFERENT boundary is a real request, not a
      // no-op: the chunks must be rewritten. The old condition returned
      // `skipped: true` for exactly that case, so a caller setting
      // `availableFromChapter` on an already-ingested version was told the
      // work was done while every chunk kept its old boundary.
      const existingBoundaries = await db.chunk.findMany({
        where: { referenceVersionId: version.id },
        select: { availableFromChapter: true },
      });
      const boundary =
        input.availableFromChapter !== undefined
          ? input.availableFromChapter
          : // An omitted boundary on a REPAIR ingest must not be read as
            // "clear the boundary". The skip guard above only short-circuits
            // when the projection is complete, so reaching here with an
            // omitted option means the chunks are being rewritten — and
            // writing NULL would silently un-classify every chunk of a
            // version whose boundary the author set earlier, widening what
            // readers can see. Carry the existing value forward instead.
            (existingBoundaries[0]?.availableFromChapter ?? null);
      const boundaryMatches = existingBoundaries.every((c) => c.availableFromChapter === boundary);

      if (existing > 0 && embeddedCount === existing && boundaryMatches && modelsMatch) {
        return { chunks: existing, embedded: embeddedCount, skipped: true };
      }

      const chunked = chunkText(version.content);
      if (!chunked.ok) {
        throw new ConflictError("reference content could not be chunked");
      }
      const units: ChunkUnit[] = chunked.value;

      if (units.length > MAX_CHUNKS_PER_VERSION) {
        throw new ConflictError(
          `reference is too large to ingest in one version: ${units.length} chunks ` +
            `exceeds the ${MAX_CHUNKS_PER_VERSION}-chunk limit; split it into several references`,
        );
      }

      // Verify before persisting: an unsound span would make every citation
      // into this version point at text that is not what was embedded.
      const unsound = verifyChunks(version.content, units);
      if (unsound.length > 0) {
        throw new ConflictError(
          `chunker produced unsound spans: ${unsound.map((f) => f.code).join(", ")}`,
        );
      }

      // Replacing projections is the only safe re-ingest: keeping old chunks
      // would leave citations pointing at text from a previous revision.
      //
      // Delete and insert share ONE transaction. Without it a failure between
      // them — a connection drop, a constraint violation, a process kill —
      // left the version with zero chunks, so a published reference silently
      // vanished from every search result until someone re-ingested it. With
      // it, a failed insert rolls the delete back and the previous chunks
      // survive: still searchable, just not yet reflecting the new options.
      //
      // The embeddings upsert stays OUTSIDE. It is idempotent, and a version
      // with chunks but no vectors is self-healing — the skip condition below
      // sees embedded < existing and re-runs rather than skipping.
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `DELETE FROM chunks WHERE reference_version_id = $1::uuid`,
          version.id,
        );

        // Insert text and tsvector in the SAME statement, so the two cannot
        // disagree. `to_tsvector('english', ...)` matches the query side in
        // search(); a different configuration here would make lexical search
        // silently miss matches.
        if (units.length === 0) return;
        const params: unknown[] = [version.id, workspaceId, boundary];
        const values = units.map((u) => {
          // `id` is deliberately absent from the column list: it is
          // gen_random_uuid(). Passing the chunk index there instead was a
          // real defect — PostgreSQL rejected it as an integer into a uuid,
          // so ingestion 500ed on every reference.
          const base = params.length + 1;
          params.push(u.index, u.text, u.start, u.end);
          return (
            `($1::uuid, $2::uuid, $${base}, $${base + 1}, $${base + 2}, $${base + 3}, ` +
            `$3::int, to_tsvector('english', $${base + 1}))`
          );
        });
        await tx.$executeRawUnsafe(
          `INSERT INTO chunks
             (reference_version_id, workspace_id, "index", text, "start", "end",
              available_from_chapter, content_ts)
           VALUES ${values.join(", ")}`,
          ...params,
        );
      });

      const chunkRows = await db.chunk.findMany({
        where: { referenceVersionId: version.id },
        orderBy: { index: "asc" },
        select: { id: true, text: true },
      });

      let embedded = 0;
      if (chunkRows.length > 0) {
        embedded = await embedChunks(
          input.actorUserId,
          workspaceId,
          chunkRows.map((c) => c.id),
          chunkRows.map((c) => c.text),
        );
      }

      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId,
        action: "reference.ingested",
        entityType: "ReferenceVersion",
        entityId: version.id,
        payload: { chunks: chunkRows.length, embedded },
      });

      return { chunks: chunkRows.length, embedded, skipped: false };
    },

    async search(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "reference:read");

      const query = (input.query ?? "").trim();
      if (query.length === 0) throw new ConflictError("query must not be empty");
      if (query.length > 2000) throw new ConflictError("query is too long");

      const mode: ViewMode = parseViewMode(input.mode);
      const readerChapter = mode === "READER" ? (input.readerChapter ?? 0) : null;
      const limit = Math.min(Math.max(input.limit ?? 10, 1), 100);
      const candidates = Math.max(limit * 5, DEFAULT_CANDIDATE_LIMIT);

      if (input.novelId) {
        const novel = await db.novel.findFirst({
          where: { id: input.novelId, workspaceId: input.workspaceId },
          select: { id: true },
        });
        if (!novel) throw new NotFoundError("novel");
      }

      const started = Date.now();
      // Each leg pushes itself only AFTER its query returns, so a leg that
      // threw is absent here — a broken index is not reported as a leg that
      // ran. `failedLegs` is the other half: it lets an all-legs-down search
      // fail loudly instead of returning an empty result that reads as
      // "the knowledge base has nothing on this".
      const retrievers: Retriever[] = [];
      const failedLegs: string[] = [];
      // Captured inside the vector-leg try so the audit row can name the
      // generation that produced the query vector. Declared here because the
      // audit write is far below the leg.
      let embeddingGenerationId: string | undefined;

      // ---- lexical leg: PostgreSQL full-text over the GIN index ----
      //
      // Every predicate is in the SQL: workspace isolation, publication
      // state, and the spoiler boundary. Filtering after ranking would mean
      // reading rows this caller may not see at all.
      const spoilerClause = (readerParam: number): string =>
        mode === "READER"
          ? `AND c.available_from_chapter IS NOT NULL AND c.available_from_chapter <= $${readerParam}::int`
          : "";
      const lexicalParams: unknown[] = [input.workspaceId, query];
      if (mode === "READER") lexicalParams.push(readerChapter ?? 0);
      const novelFilter = input.novelId ? `AND r.novel_id = $${lexicalParams.length + 1}::uuid` : "";
      if (input.novelId) lexicalParams.push(input.novelId);
      const lexicalSpoilerSql = spoilerClause(3);
      const lexicalLimit = `LIMIT ${candidates}`;

      let lexical: SearchRow[] = [];
      try {
        lexical = await db.$queryRawUnsafe<SearchRow[]>(
          `SELECT c.id AS chunk_id,
                  r.id AS reference_id,
                  c.reference_version_id,
                  r.title AS reference_title,
                  c.text, c."start", c."end",
                  row_number() OVER (ORDER BY ts_rank_cd(c.content_ts, q) DESC, c.id) AS rank,
                  ts_rank_cd(c.content_ts, q) AS score,
                  NULL::text AS detail
             FROM chunks c
             JOIN reference_versions rv ON rv.id = c.reference_version_id
             JOIN "references" r ON r.id = rv.reference_id AND r.current_version_id = rv.id
             CROSS JOIN plainto_tsquery('english', $2) q
            WHERE c.workspace_id = $1::uuid
              AND r.status = 'ACTIVE'
              ${lexicalSpoilerSql}
              ${novelFilter}
              AND c.content_ts @@ q
            ORDER BY score DESC, c.id
            ${lexicalLimit}`,
          ...lexicalParams,
        );
        retrievers.push("LEXICAL");
      } catch (err) {
        // A lexical failure must not take the whole search down: the vector
        // leg can still answer. `retrievers` records which legs actually
        // returned, so a degraded search is visible rather than silent.
        dbg?.error?.("lexical retrieval failed", { err });
        failedLegs.push("LEXICAL");
      }

      // ---- vector leg: exact cosine over the embedding projection ----
      let vector: SearchRow[] = [];
      try {
        const embedded = await ai.embed({
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          texts: [query],
        });
        const qv = embedded.vectors[0];
        embeddingGenerationId = embedded.generationId ?? undefined;
        if (!qv || qv.length !== EMBEDDING_DIMENSION) {
          throw new ConflictError("embedding provider returned an unusable query vector");
        }
        // Same guard `embedChunks` applies to stored vectors, for the same
        // reason: the value is stringified into a SQL literal, so it must be
        // finite numbers before that happens. Without it the failure is a raw
        // pgvector cast error caught by the leg's own handler, which then
        // reports "vector leg unavailable" for what is really a bad provider
        // response — pointing the operator at the database instead.
        if (!qv.every((n) => typeof n === "number" && Number.isFinite(n))) {
          throw new ConflictError("embedding provider returned a non-finite query vector");
        }
        const vectorParams: unknown[] = [input.workspaceId, `[${qv.join(",")}]`, embedded.model];
        if (mode === "READER") vectorParams.push(readerChapter ?? 0);
        // The reader chapter sits at $4 here, not $3 — $3 is the embedding
        // model. Sharing one hardcoded `$3` between the legs would bind the
        // model name to an int cast, and the query would fail at runtime
        // only for READER searches.
        const vectorSpoilerSql = spoilerClause(4);
        const vNovel = input.novelId ? `AND r.novel_id = $${vectorParams.length + 1}::uuid` : "";
        if (input.novelId) vectorParams.push(input.novelId);

        vector = await db.$queryRawUnsafe<SearchRow[]>(
          `SELECT c.id AS chunk_id,
                  r.id AS reference_id,
                  c.reference_version_id,
                  r.title AS reference_title,
                  c.text, c."start", c."end",
                  row_number() OVER (ORDER BY e.vector <=> $2::vector, c.id) AS rank,
                  (e.vector <=> $2::vector) AS score,
                  NULL::text AS detail
             FROM embeddings e
             JOIN chunks c ON c.id = e.chunk_id
             JOIN reference_versions rv ON rv.id = c.reference_version_id
             JOIN "references" r ON r.id = rv.reference_id AND r.current_version_id = rv.id
            WHERE c.workspace_id = $1::uuid
              AND r.status = 'ACTIVE'
              AND e.dimensions = ${EMBEDDING_DIMENSION}
              AND e.model = $3
              ${vectorSpoilerSql}
              ${vNovel}
            ORDER BY score ASC, c.id
            LIMIT ${candidates}`,
          ...vectorParams,
        );
        retrievers.push("VECTOR");
      } catch (err) {
        dbg?.error?.("vector retrieval failed", { err });
        failedLegs.push("VECTOR");
      }

      // Every leg down is an OUTAGE, not an empty knowledge base. Returning
      // zero hits with `retrievers: []` would be indistinguishable from a
      // working search that matched nothing, and the caller would draw the
      // wrong conclusion about the index (CLAUDE.md §26 — a retrieval
      // failure is handled explicitly, not reported as no results).
      if (retrievers.length === 0 && failedLegs.length > 0) {
        throw new BadGatewayError("retrieval failed: no retriever answered");
      }

      // ---- fuse ----
      const toHits = (rows: SearchRow[]) =>
        rows.map((r) => ({
          id: r.chunk_id,
          rank: Number(r.rank),
          ...(r.score !== null ? { score: Number(r.score) } : {}),
          ...(r.detail !== null ? { detail: r.detail } : {}),
        }));

      const fused = fuse({
        lists: {
          ...(lexical.length > 0 ? { LEXICAL: toHits(lexical) } : {}),
          ...(vector.length > 0 ? { VECTOR: toHits(vector) } : {}),
        },
        k: DEFAULT_RRF_K,
      });
      if (!fused.ok) throw new ConflictError("retrieval fusion failed");

      // ---- assemble, with the spoiler check re-applied ----
      //
      // The SQL predicate already filtered, and it is the PRIMARY control:
      // for every combination of mode, reader position and boundary, a row
      // the SQL admitted is one `canView` also permits — verified by
      // enumerating the combinations, not assumed. Filtering after ranking
      // would mean reading rows this caller may not see at all.
      //
      // The recheck below is therefore a tripwire, not a second control. It
      // is kept because the two filters could drift: a future leg that omits
      // the predicate would otherwise leak, and this catches it. Its cost is
      // one map lookup per hit.
      //
      // Consequence, stated plainly: `withheldCount` counts what THIS layer
      // withheld, so with both filters in agreement it is always 0. It is
      // reported rather than removed because a non-zero value is the signal
      // that the tripwire fired and one of the legs is wrong — that is the
      // number an operator needs when a reader reports missing content.
      const byId = new Map<string, SearchRow>();
      for (const r of [...lexical, ...vector]) byId.set(r.chunk_id, r);

      const boundaryOf = async (chunkIds: string[]) => {
        const rows = await db.chunk.findMany({
          where: { id: { in: chunkIds } },
          select: { id: true, availableFromChapter: true },
        });
        return new Map(rows.map((r) => [r.id, r.availableFromChapter]));
      };

      const top: FusedResult[] = fused.value.slice(0, limit * 2);
      const boundaries = await boundaryOf(top.map((f) => f.id));

      const visible: RetrievalHit[] = [];
      let withheld = 0;
      for (const f of top) {
        // A fused hit with no raw row cannot happen today — every fused id
        // came from a leg's rows — but it is not impossible after an edit,
        // and silently dropping it would under-report the result set. Count
        // it with the withheld so the number is never quietly wrong.
        const row = byId.get(f.id);
        if (!row) {
          withheld += 1;
          continue;
        }
        const boundary = { availableFromChapter: boundaries.get(f.id) ?? null };
        if (!canView(boundary, { mode, ...(readerChapter !== null ? { readerChapter } : {}) })) {
          withheld += 1;
          continue;
        }
        if (visible.length >= limit) continue;
        visible.push({
          chunkId: row.chunk_id,
          referenceId: row.reference_id,
          referenceVersionId: row.reference_version_id,
          referenceTitle: row.reference_title,
          start: Number(row.start),
          end: Number(row.end),
          text: row.text,
          score: f.score,
          foundBy: f.foundBy,
          contributions: f.contributions,
        });
      }

      const latencyMs = Date.now() - started;

      // The audit row is what makes this evidence-bearing: the query, the
      // mode that governed the filter, what was returned and what the
      // boundary withheld.
      const auditRow = await db.retrievalAudit.create({
        data: {
          workspaceId: input.workspaceId,
          novelId: input.novelId ?? null,
          query,
          mode: mode as never,
          readerChapter,
          returnedCount: visible.length,
          withheldCount: withheld,
          // The Generation row is the record of the embedding call this
          // search made. Persisting its id is what makes the audit row
          // traceable to the AI call that produced the query vector, which
          // is what the schema promises; without it the column was
          // unreachable by construction.
          ...(embeddingGenerationId ? { generationId: embeddingGenerationId } : {}),
          results: visible.map((h) => ({
            chunkId: h.chunkId,
            referenceId: h.referenceId,
            referenceVersionId: h.referenceVersionId,
            start: h.start,
            end: h.end,
            score: h.score,
            foundBy: h.foundBy,
          })) as never,
          retrievers,
          latencyMs,
          ...(input.generationId ? { generationId: input.generationId } : {}),
          ...(input.stepRunId ? { stepRunId: input.stepRunId } : {}),
        },
        select: { id: true },
      });

      return {
        hits: visible,
        withheldCount: withheld,
        retrievers,
        mode,
        readerChapter,
        auditId: auditRow.id,
      };
    },

    async listRetrievals(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "reference:read");
      const rows = await db.retrievalAudit.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { createdAt: "desc" },
        take: Math.min(input.limit ?? 50, 200),
        select: {
          id: true,
          query: true,
          mode: true,
          readerChapter: true,
          returnedCount: true,
          withheldCount: true,
          retrievers: true,
          latencyMs: true,
          createdAt: true,
        },
      });
      return rows.map((r) => ({ ...r, mode: r.mode as string }));
    },
  };
}
