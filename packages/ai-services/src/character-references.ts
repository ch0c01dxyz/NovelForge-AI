import type { NovelForgeDb } from "@novelforge/database";

type Reader = Pick<NovelForgeDb, "$queryRaw">;
export const CHARACTER_REFERENCE_LIMIT = 64;
export const normalizeCharacterName = (name: string) => name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/^(?:(?:pak|bapak|ibu|bu|mr|mrs|ms|dr|prof)\.?\s+)+/i, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function characterNameAliases(name: string, key?: string): string[] {
  // Parenthetical locations/statuses are not personal aliases (e.g. "dusun lain").
  const alternateNames = [...name.matchAll(/\(([^)]+)\)/g)].map(m => m[1]!).filter(value => /^\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)+$/u.test(value.trim()));
  const parts = [name.replace(/\([^)]*\)/g, " "), ...alternateNames];
  const aliases = parts.flatMap(part => {
    const full = normalizeCharacterName(part), first = full.split(" ")[0] ?? "";
    return first.length >= 4 && full.includes(" ") ? [full, first] : [full];
  });
  if (key) aliases.push(normalizeCharacterName(key.replace(/^char-/, "")));
  return [...new Set(aliases.filter(Boolean))];
}
interface CharacterReference { id: string; name: string; key: string; storyEntityId: string | null; summary: string | null }
const marks = "[\u0300-\u036f]";
async function candidates(db: Reader, scope: { workspaceId: string; novelId: string }, tokens: string[], all: boolean) {
  // Match the same normalized words/keys as the final alias check; never fetch the novel's catalog.
  if (all) return db.$queryRaw<CharacterReference[]>`SELECT id, name, key, story_entity_id AS "storyEntityId", summary FROM characters
    WHERE workspace_id = ${scope.workspaceId}::uuid AND novel_id = ${scope.novelId}::uuid AND
    (regexp_split_to_array(regexp_replace(lower(normalize(name, NFKD)), ${marks}, '', 'g'), '[^[:alnum:]]+') @> ${tokens}::text[]
     OR regexp_split_to_array(lower(key), '[^[:alnum:]]+') @> ${tokens}::text[])
    ORDER BY name, id LIMIT ${CHARACTER_REFERENCE_LIMIT + 1}`;
  return db.$queryRaw<CharacterReference[]>`SELECT id, name, key, story_entity_id AS "storyEntityId", summary FROM characters
    WHERE workspace_id = ${scope.workspaceId}::uuid AND novel_id = ${scope.novelId}::uuid AND
    (regexp_split_to_array(regexp_replace(lower(normalize(name, NFKD)), ${marks}, '', 'g'), '[^[:alnum:]]+') && ${tokens}::text[]
     OR regexp_split_to_array(lower(key), '[^[:alnum:]]+') && ${tokens}::text[])
    ORDER BY name, id LIMIT ${CHARACTER_REFERENCE_LIMIT + 1}`;
}

/** Read-only reference matching; an alias never grants permission to merge/link identities. */
export async function resolveCharacterReference(db: Reader, scope: { workspaceId: string; novelId: string }, name: string) {
  const normalized = normalizeCharacterName(name);
  const tokens = normalized.split(" ").filter(Boolean).slice(0, 12);
  if (!tokens.length) return { kind: "NEW" as const, matches: [] };
  const rows = await candidates(db, scope, tokens, true);
  if (rows.length > CHARACTER_REFERENCE_LIMIT) return { kind: "AMBIGUOUS" as const, matches: [] };
  const exact = rows.filter(c => normalizeCharacterName(c.name) === normalized);
  const matches = exact.length ? exact : rows.filter(c => characterNameAliases(c.name, c.key).includes(normalized));
  return { kind: matches.length === 1 ? "MATCHED" as const : matches.length ? "AMBIGUOUS" as const : "NEW" as const, matches };
}

export async function charactersMentionedInText(db: Reader, scope: { workspaceId: string; novelId: string }, text: string) {
  const tokens = [...new Set(normalizeCharacterName(text).split(" ").filter(Boolean))];
  if (tokens.length > 4096) throw new Error("CHARACTER_REFERENCE_LIMIT");
  if (!tokens.length) return { characters: [], ambiguousNames: [] };
  const rows = await candidates(db, scope, tokens, false);
  if (rows.length > CHARACTER_REFERENCE_LIMIT) throw new Error("CHARACTER_REFERENCE_LIMIT");
  const normalizedText = ` ${normalizeCharacterName(text)} `;
  const mentioned = rows.filter(c => characterNameAliases(c.name, c.key).some(alias => normalizedText.includes(` ${alias} `)));
  if (mentioned.length > 12) throw new Error("CHARACTER_REFERENCE_LIMIT");
  const aliases = new Map<string, Set<string>>();
  for (const c of mentioned) for (const alias of characterNameAliases(c.name, c.key)) if (normalizedText.includes(` ${alias} `)) {
    const ids = aliases.get(alias) ?? new Set<string>(); ids.add(c.id); aliases.set(alias, ids);
  }
  return { characters: mentioned, ambiguousNames: [...aliases].filter(([, ids]) => ids.size > 1).map(([alias]) => alias) };
}
