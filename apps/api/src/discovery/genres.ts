/**
 * NF-WF-014: the frozen genre taxonomy constant.
 *
 * Q3 RESOLVED 2026-10-06 by Klein: the canonical 18-genre list is pinned
 * in docs/implementation/genre-taxonomy.md (research + merges + EN/ID
 * descriptions); the 33 trope items are analyzed in
 * docs/implementation/trope-research.md with the verdict none promoted.
 * This constant is the code form of that list — max 5 keys per novel
 * (Klein's 2026-10-06 amendment, up from 3). Changing the list is a
 * product decision; the mechanism (column + capability-guarded route)
 * is separate.
 *
 * EN/ID labels: the canonical display strings, mirrored in the web
 * i18n `genre:` section. Server responses carry keys only; the UI
 * renders labels.
 */
export interface GenreEntry {
  key: string;
  en: string;
  id: string;
}

export const GENRE_TAXONOMY: readonly GenreEntry[] = [
  { key: "fantasy", en: "Fantasy", id: "Fantasi" },
  { key: "high_fantasy", en: "High Fantasy", id: "Fantasi Tinggi" },
  { key: "urban_fantasy", en: "Urban Fantasy", id: "Fantasi Urban" },
  {
    key: "progression_fantasy",
    en: "Progression Fantasy",
    id: "Fantasi Progresi",
  },
  { key: "xianxia", en: "Xianxia", id: "Xianxia" },
  { key: "wuxia", en: "Wuxia", id: "Wuxia" },
  { key: "litrpg", en: "LitRPG", id: "LitRPG" },
  { key: "science_fiction", en: "Science Fiction", id: "Fiksi Ilmiah" },
  { key: "romance", en: "Romance", id: "Romansa" },
  { key: "family", en: "Family", id: "Keluarga" },
  { key: "action", en: "Action", id: "Aksi" },
  { key: "adventure", en: "Adventure", id: "Petualangan" },
  { key: "mystery", en: "Mystery", id: "Misteri" },
  { key: "thriller", en: "Thriller", id: "Thriller" },
  { key: "horror", en: "Horror", id: "Horor" },
  { key: "historical", en: "Historical", id: "Sejarah" },
  { key: "apocalypse", en: "Apocalypse", id: "Apokalips" },
  { key: "slice_of_life", en: "Slice of Life", id: "Slice of Life" },
] as const;

/** The 18 canonical keys — the only values Novel.genres may hold. */
export const GENRE_KEYS: ReadonlySet<string> = new Set(
  GENRE_TAXONOMY.map((g) => g.key),
);

/** Max genres per novel (contract Invariant 4; Klein's 2026-10-06
 * amendment: 5, up from 3). */
export const MAX_GENRES_PER_NOVEL = 5;

/** True when every key in the list is a known taxonomy key. */
export function areKnownGenreKeys(genres: readonly string[]): boolean {
  return genres.every((g) => GENRE_KEYS.has(g));
}
