import { describe, expect, it } from "vitest";
import { parseReaderPreferences, DEFAULT_READER_PREFERENCES } from "./readerPreferences";

describe("reader device preferences", () => {
  it("accepts supported typography and theme without changing text", () => {
    expect(parseReaderPreferences({ font: "sans", size: 24, line: 2, spacing: 0.05, theme: "light" }))
      .toEqual({ font: "sans", size: 24, line: 2, spacing: 0.05, theme: "light" });
  });
  it("rejects unknown fonts, themes, non-finite and out-of-range values", () => {
    expect(parseReaderPreferences({ font: "url(external)", size: 500, line: NaN, spacing: -1, theme: "custom" }))
      .toEqual(DEFAULT_READER_PREFERENCES);
    expect(parseReaderPreferences(null)).toEqual(DEFAULT_READER_PREFERENCES);
    expect(parseReaderPreferences([])).toEqual(DEFAULT_READER_PREFERENCES);
  });
});
