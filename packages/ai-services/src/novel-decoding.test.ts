import { describe, expect, it } from "vitest";
import { decodeChunks, decodeEvidence, parseDecodeObservations, parseDecodeBatch, DECODE_CHUNK_CHARS } from "./novel-decoding.ts";

const sources = [
  { chapterVersionId: "version-1", chapterNumber: 1, text: "Aria feared the valley. Her brother Bram waited there." },
  { chapterVersionId: "version-2", chapterNumber: 2, text: "Aria entered the valley and helped Bram." },
];
const observed = { area: "CHARACTER", title: "Aria", summary: "A named traveler.", subject: null, target: null, chapterNumber: 1, citations: [{ chapterVersionId: "version-1", chapterNumber: 1, quote: "Aria feared the valley." }], details: {} };
const parse = (candidates: unknown[], unknowns: unknown[] = []) => parseDecodeObservations(JSON.stringify({ candidates, unknowns }), sources, ["CHARACTER", "CHARACTER_ARC", "NARRATIVE", "WORLD"]);
describe("bounded source-pinned novel decoding", () => {
  it("excludes invalid rows explicitly while retaining only independently validated observations", () => {
    const bad = { ...observed, area: "ITEM", title: "", summary: "", citations: [] };
    const result = parseDecodeBatch(JSON.stringify({ candidates: [observed, bad], unknowns: [] }), sources, ["CHARACTER"]);
    expect(result.candidates).toEqual([observed]);
    expect(result.unknowns).toEqual(["Source validation excluded 1 unsupported suggestions; none were applied."]);
    expect(() => parseDecodeBatch(JSON.stringify({ candidates: [bad], unknowns: [] }), sources, ["CHARACTER"])).toThrow();
    expect(() => parseDecodeBatch(JSON.stringify({ candidates: [observed], unknowns: "invalid" }), sources, ["CHARACTER"])).toThrow();
  });
  it("resolves server-provided evidence IDs verbatim and rejects invented IDs", () => {
    const evidence = decodeEvidence(sources);
    const result = parse([{ ...observed, citations: [{ sourceId: evidence[0]!.sourceId }] }]);
    expect(result.candidates[0]!.citations[0]).toEqual({ chapterVersionId: "version-1", chapterNumber: 1, quote: sources[0]!.text });
    expect(() => parse([{ ...observed, citations: [{ sourceId: "invented" }] }])).toThrow();
    const anchored = parse([{ ...observed, chapterNumber: 999, citations: [{ sourceId: evidence[0]!.sourceId }, { sourceId: evidence[1]!.sourceId }] }]);
    expect(anchored.candidates[0]!.chapterNumber).toBe(2);
    expect(decodeEvidence([{ ...sources[0]!, text: "a".repeat(399) + "🌿" + "b".repeat(600) }]).map(e => e.quote).join("")).toBe("a".repeat(399) + "🌿" + "b".repeat(600));
  });
  it("retains every source character and avoids splitting surrogate pairs", () => {
    const input = "a".repeat(DECODE_CHUNK_CHARS - 1) + "🌿" + "b".repeat(25000);
    const chunks = decodeChunks(input);
    expect(chunks.join("")).toBe(input); expect(chunks.every(c => c.length <= DECODE_CHUNK_CHARS)).toBe(true);
    expect(chunks.some(c => /[\uD800-\uDBFF]$/.test(c))).toBe(false);
  });
  it("retains grounded observations and explicit unknowns", () => {
    expect(parse([observed], ["Family history is not stated."])).toEqual({ candidates: [observed], unknowns: ["Family history is not stated."] });
  });
  it("rejects invented quotations, wrong source IDs and uncited positions", () => {
    for (const citations of [[{ ...observed.citations[0], quote: "Aria ruled the world." }], [{ ...observed.citations[0], chapterVersionId: "other" }]]) expect(() => parse([{ ...observed, citations }])).toThrow("DECODE_CITATION_INVALID");
    expect(() => parse([{ ...observed, chapterNumber: 2 }])).toThrow("DECODE_CITATION_INVALID");
  });
  it("refuses an invented character identity and unselected area", () => {
    expect(() => parse([{ ...observed, title: "Different person" }])).toThrow();
    expect(() => parse([{ ...observed, area: "ENDGAME" }])).toThrow();
  });
  it("does not fabricate an arc from one chapter or allow reversed/future milestones", () => {
    const arc = { ...observed, area: "CHARACTER_ARC", subject: "Aria", chapterNumber: 2, citations: [...observed.citations, { chapterVersionId: "version-2", chapterNumber: 2, quote: sources[1]!.text }], details: { milestones: [{ chapterNumber: 1, summary: "Fears the valley." }, { chapterNumber: 2, summary: "Enters to help Bram." }] } };
    expect(parse([arc]).candidates).toHaveLength(1);
    expect(() => parse([{ ...arc, details: { milestones: [arc.details.milestones[0]] } }])).toThrow();
    expect(() => parse([{ ...arc, details: { milestones: [...arc.details.milestones].reverse() } }])).toThrow();
    expect(() => parse([{ ...arc, chapterNumber: 1 }])).toThrow();
  });
  it("allows a setup promise without fabricating a thread kind, and refuses unknown modes", () => {
    expect(parse([{ ...observed, area: "NARRATIVE", details: { recordKind: "PROMISE" } }]).candidates).toHaveLength(1);
    expect(() => parse([{ ...observed, area: "NARRATIVE", details: { recordKind: "OTHER" } }])).toThrow();
    expect(() => parse([{ ...observed, area: "NARRATIVE", details: { recordKind: "THREAD" } }])).toThrow();
  });
  it("requires explicit world type and bounded valid contracts", () => {
    expect(() => parse([{ ...observed, area: "WORLD" }])).toThrow();
    expect(() => parse(Array(21).fill(observed))).toThrow();
    expect(() => parse([{ ...observed, summary: "x".repeat(1201) }])).toThrow();
    expect(() => parse([], Array(11).fill("Unknown"))).toThrow();
    expect(() => parse([], ["x".repeat(1001)])).toThrow();
    expect(() => parseDecodeObservations("Not JSON", sources, ["CHARACTER"])).toThrow();
  });
});
