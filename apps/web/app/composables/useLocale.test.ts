import { describe, expect, it, beforeEach } from "vitest";
import { useLocale } from "./useLocale";

describe("useLocale", () => {
  beforeEach(() => {
    const { setLocale } = useLocale();
    setLocale("en");
  });

  it("resolves English strings", () => {
    const { t } = useLocale();
    expect(t("generation.title")).toBe("Generation");
  });

  it("resolves Indonesian strings", () => {
    const { setLocale, t } = useLocale();
    setLocale("id");
    expect(t("generation.title")).toBe("Generasi");
  });

  it("falls back to English for missing id keys", () => {
    const { setLocale, t } = useLocale();
    setLocale("id");
    // Intentionally missing in id: falls back to en.
    expect(t("review.showFullHash")).toBe("Show full hash");
  });

  it("interpolates params", () => {
    const { t } = useLocale();
    expect(t("review.draftWon", { n: 2, total: 3 })).toBe("Draft 2 of 3");
  });

  it("returns the key for a fully missing key", () => {
    const { t } = useLocale();
    expect(t("does.not.exist")).toBe("does.not.exist");
  });
});
