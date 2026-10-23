export interface ReaderPreferences {
  font: "literary" | "sans" | "mono";
  size: number;
  line: number;
  spacing: number;
  theme: "dark" | "light";
}
export const DEFAULT_READER_PREFERENCES: ReaderPreferences = { font: "literary", size: 19, line: 1.85, spacing: 0, theme: "dark" };
export const READER_FONT_STACKS = {
  literary: 'var(--font-nf-literary, Georgia, serif)',
  sans: 'system-ui, sans-serif',
  mono: 'ui-monospace, monospace',
};
export function parseReaderPreferences(value: unknown): ReaderPreferences {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const bounded = (key: "size" | "line" | "spacing", min: number, max: number) =>
    typeof v[key] === "number" && Number.isFinite(v[key]) && v[key] >= min && v[key] <= max ? v[key] : DEFAULT_READER_PREFERENCES[key];
  return {
    font: v.font === "sans" || v.font === "mono" ? v.font : "literary",
    size: bounded("size", 16, 30), line: bounded("line", 1.4, 2.4), spacing: bounded("spacing", 0, 0.16),
    theme: v.theme === "light" ? "light" : "dark",
  };
}
