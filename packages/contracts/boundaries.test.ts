/**
 * Boundary map must stay in sync with SYSTEM-ARCHITECTURE.md:
 * the "Recommended monorepo" package list and the "Event model" names.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DOMAIN_EVENT_NAMES,
  DOMAIN_PACKAGES,
  MODULE_BOUNDARIES,
  PROVIDER_ADJACENT_PACKAGE,
  mayImport,
} from "./index";

// Normalize CRLF: the docs may be checked out with either line ending.
const doc = readFileSync(
  fileURLToPath(
    new URL("../../docs/02-architecture/SYSTEM-ARCHITECTURE.md", import.meta.url),
  ),
  "utf8",
).replace(/\r\n/g, "\n");

/** Parse `apps/`+`packages/` members from the "Recommended monorepo" block. */
function documentedPackages(): string[] {
  const block = /## Recommended monorepo\s+```\s*text\n([\s\S]*?)```/.exec(doc)?.[1];
  expect(block, "Recommended monorepo block found in SYSTEM-ARCHITECTURE.md").toBeDefined();
  const names: string[] = [];
  for (const line of block!.split("\n")) {
    const m = /^\s+([\w-]+)\/\s*$/.exec(line);
    if (m) names.push(m[1]!);
  }
  return names;
}

describe("MODULE_BOUNDARIES vs SYSTEM-ARCHITECTURE.md", () => {
  it("covers exactly the documented packages", () => {
    expect(Object.keys(MODULE_BOUNDARIES).sort()).toEqual(
      documentedPackages().sort(),
    );
  });

  it("lists every documented domain package as kind domain", () => {
    const domainInMap = Object.entries(MODULE_BOUNDARIES)
      .filter(([, b]) => b.kind === "domain")
      .map(([name]) => name)
      .sort();
    expect(domainInMap).toEqual([...DOMAIN_PACKAGES].sort());
  });

  it("keeps contracts and shared dependency-free leaves", () => {
    expect(MODULE_BOUNDARIES.contracts?.allowed).toEqual([]);
    expect(MODULE_BOUNDARIES.shared?.allowed).toEqual([]);
  });

  it("makes ai-core the only provider-adjacent package", () => {
    expect(MODULE_BOUNDARIES[PROVIDER_ADJACENT_PACKAGE]?.kind).toBe("ai");
    const aiPackages = Object.values(MODULE_BOUNDARIES).filter(
      (b) => b.kind === "ai",
    );
    expect(aiPackages).toHaveLength(1);
  });

  it("forbids domain packages from importing HTTP/UI/provider code", () => {
    const forbidden = ["ai-core", "api", "web", "worker"];
    for (const name of DOMAIN_PACKAGES) {
      for (const target of forbidden) {
        expect(mayImport(name, target), `${name} -> ${target}`).toBe(false);
      }
    }
  });
});

describe("DOMAIN_EVENT_NAMES vs SYSTEM-ARCHITECTURE.md", () => {
  it("matches the documented event model names", () => {
    const section = /## Event model\n([\s\S]*?)(?=\n## |\n```|$)/.exec(doc)?.[1];
    expect(section, "Event model section found").toBeDefined();
    const documented = [...section!.matchAll(/`([A-Z][A-Za-z]+)`/g)].map(
      (m) => m[1],
    );
    expect([...DOMAIN_EVENT_NAMES].sort()).toEqual(documented.sort());
  });
});
