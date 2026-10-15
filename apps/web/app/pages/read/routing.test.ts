/**
 * GAP-122 routing regression guard.
 *
 * The original defect: `pages/read/[slug].vue` existed alongside
 * `pages/read/[slug]/[number].vue`, so Nuxt file-route nesting made the
 * overview the PARENT route of the chapter page. The parent rendered no
 * `<NuxtPage />`, the child could never display (NUXT_E4016), and the bare
 * `<NotificationBell />` / `<CommentThread />` template names did not
 * resolve (Nuxt registers `components/reader/*` with the `Reader` prefix).
 *
 * The repair makes `index.vue` and `[number].vue` sibling files —
 * independent routes at the same URLs — and resolves both components with
 * explicit runtime imports. This test pins exactly that structure: recreate
 * the parent file or drop a runtime import and it fails.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Package and workspace runs use apps/web and repo-root cwd respectively.
// jsdom rewrites import.meta.url, so resolve the explicit package location.
const WEB_ROOT = existsSync(join(process.cwd(), "apps", "web", "package.json"))
  ? join(process.cwd(), "apps", "web")
  : process.cwd();
const READ_DIR = join(WEB_ROOT, "app", "pages", "read");

function relative(path: string): string {
  return `apps/web/app/pages/read/${path}`;
}

function readIfExists(path: string): string | null {
  const full = join(READ_DIR, path);
  return existsSync(full) ? readFileSync(full, "utf8") : null;
}

describe("reader route structure (GAP-122)", () => {
  it("keeps the novel overview and chapter pages as sibling routes, not parent/child", () => {
    // The parent file must NOT come back: its presence re-nests
    // /read/:slug/:number under /read/:slug and reintroduces NUXT_E4016.
    expect(readIfExists("[slug].vue")).toBeNull();
    expect(readIfExists(join("[slug]", "index.vue"))).not.toBeNull();
    expect(readIfExists(join("[slug]", "[number].vue"))).not.toBeNull();
  });

  it("resolves NotificationBell with an explicit runtime import in both pages", () => {
    for (const page of [join("[slug]", "index.vue"), join("[slug]", "[number].vue")]) {
      const source = readIfExists(page);
      expect(source, relative(page)).not.toBeNull();
      expect(
        source,
        `${relative(page)} must runtime-import NotificationBell`,
      ).toMatch(/import NotificationBell from ["']\.\.\/\.\.\/\.\.\/components\/reader\/NotificationBell\.vue["']/);
    }
  });

  it("resolves CommentThread with an explicit runtime import in the chapter page", () => {
    const source = readIfExists(join("[slug]", "[number].vue"));
    expect(source).toMatch(
      /import CommentThread from ["']\.\.\/\.\.\/\.\.\/components\/reader\/CommentThread\.vue["']/,
    );
  });
});
