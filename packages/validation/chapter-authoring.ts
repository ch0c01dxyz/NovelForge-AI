/** Optional author-approved requirements pinned when a chapter run is enqueued. */
export interface ChapterAuthoringPolicy {
  minimumWordCount?: number;
  storyProfile?: string;
}

function minimum(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 100_000) {
    throw new Error("minimumWordCount must be an integer between 1 and 100000");
  }
  return value;
}

export function resolveChapterAuthoring(dna: unknown, requestedMinimum?: unknown): ChapterAuthoringPolicy {
  const configured = dna && typeof dna === "object" && !Array.isArray(dna)
    ? (dna as Record<string, unknown>).chapterAuthoring : undefined;
  if (configured !== undefined && (!configured || typeof configured !== "object" || Array.isArray(configured))) {
    throw new Error("chapterAuthoring must be an object");
  }
  const profile = (configured ?? {}) as Record<string, unknown>;
  const configuredMinimum = minimum(profile.minimumWordCount);
  const requested = minimum(requestedMinimum);
  const words = Math.max(configuredMinimum ?? 0, requested ?? 0);
  if (profile.storyProfile !== undefined && (typeof profile.storyProfile !== "string" || profile.storyProfile.length > 12_000)) {
    throw new Error("chapterAuthoring.storyProfile must be a string of at most 12000 characters");
  }
  return {
    ...(words ? { minimumWordCount: words } : {}),
    ...(typeof profile.storyProfile === "string" ? { storyProfile: profile.storyProfile } : {}),
  };
}

export function chapterDraftLengthError(prose: string, requestedMinimum: unknown): string | null {
  const words = minimum(requestedMinimum);
  if (words === undefined) return null;
  // Match manuscript persistence: replace tags with spaces, then split whitespace.
  const text = prose.replace(/<[^>]*>/g, " ").trim();
  const actual = text ? text.split(/\s+/).length : 0;
  return actual < words ? `AI_CHAPTER_TOO_SHORT: expected at least ${words} words; received ${actual}` : null;
}

export function chapterReviewError(review: unknown, final: boolean): string | null {
  if (!review || typeof review !== "object" || !("findings" in review) || !("needsCorrection" in review)) return null;
  if (!Array.isArray(review.findings) || typeof review.needsCorrection !== "boolean") return null;
  const serious = review.findings.some(finding => finding && typeof finding === "object"
    && (finding.severity === "major" || finding.severity === "blocking"));
  if (serious && !review.needsCorrection) return "AI_CHAPTER_REVIEW_INCONSISTENT: major or blocking findings require correction";
  if (final && (serious || review.needsCorrection)) return "AI_CHAPTER_REVIEW_UNRESOLVED: the final review still requires correction";
  return null;
}
