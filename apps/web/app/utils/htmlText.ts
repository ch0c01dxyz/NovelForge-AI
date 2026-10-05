/**
 * NF-WF-015: client-side HTML helpers for the writer workspace.
 *
 * `stripHtmlTags` mirrors the server strip rule exactly
 * (`stripHtmlTags` in apps/api/src/services/manuscript.ts): each tag is
 * replaced with a space so `</p><p>` does not fuse words. It feeds the
 * footer word count, the conflict Compare diff, and the review-area
 * diff base — everywhere chapter prose is consumed as text.
 */
export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

/** Word count on tag-stripped text (same rule as the server). */
export function countWords(html: string): number {
  const text = stripHtmlTags(html);
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/**
 * The Invariant 2 block tags. Content containing any of them is treated as
 * manuscript HTML; anything else is legacy plain text (chapters written by
 * the pre-015 textarea writer). Shared by the writer editor (load path)
 * and the public reader (F2 dual-format rendering).
 */
export const BLOCK_TAG_RE = /<(p|h2|blockquote|ul|ol|li|hr)\b/;

/** True when the stored content is manuscript HTML rather than plain text. */
export function looksLikeHtml(content: string): boolean {
  return BLOCK_TAG_RE.test(content);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convert legacy plain-text chapters (blank-line paragraph separators)
 * into manuscript HTML for the editor. Single newlines become `<br>`,
 * mirroring the reader's legacy paragraph split.
 */
export function plainTextToHtml(text: string): string {
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
