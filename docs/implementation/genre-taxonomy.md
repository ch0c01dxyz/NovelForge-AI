# Genre Taxonomy — NF-WF-014 Q3

**Status:** researched 2026-10-06, proposed for Klein's approval. The frozen code
constant (`Novel.genres`, max 5 per novel — Klein's 2026-10-06 amendment,
up from 3) should be built from the **Genre**
layer below. All descriptions are written to help an author shape the *kisah*
(the tale) — what the label promises a reader, what story elements it implies,
and what it pairs well or poorly with.

**Research method:** 8 worker subagents researched ~80 labels cluster-by-cluster
against real webnovel/light-novel platforms (Webnovel, NovelUpdates +
NovelUpdates Forum, Royal Road + forums, ScribbleHub + forums, Wattpad,
MyAnimeList community, KakaoPage-adjacent sources). Every classification below
rests on platform practice, not dictionary definitions.

## Final canonical genre list (the frozen code constant)

`Novel.genres` (max 5 per novel — Klein's 2026-10-06 amendment, up
from 3) is built from exactly these 18 canonical
codes. Per Klein's 2026-10-06 decisions (see §"Decisions by Klein"), no trope
was promoted — the trope layer is analyzed item-by-item in
[`trope-research.md`](trope-research.md) with the verdict **none promoted**.

`fantasy`, `high_fantasy`, `urban_fantasy`, `progression_fantasy`, `xianxia`,
`wuxia`, `litrpg`, `science_fiction`, `romance`, `family`, `action`,
`adventure`, `mystery`, `thriller`, `horror`, `historical`, `apocalypse`,
`slice_of_life`

Canonical EN names / ID labels: Fantasy/Fantasi, High Fantasy/Fantasi Tinggi,
Urban Fantasy/Fantasi Urban, Progression Fantasy/Fantasi Progresi,
Xianxia/Xianxia, Wuxia/Wuxia, LitRPG/LitRPG, Science Fiction/Fiksi Ilmiah,
Romance/Romansa, Family/Keluarga, Action/Aksi, Adventure/Petualangan,
Mystery/Misteri, Thriller/Thriller, Horror/Horor, Historical/Sejarah,
Apocalypse/Apokalips, Slice of Life/Slice of Life.

---

## 0. Summary

### What was merged

| Raw item(s) | Disposition | Justification |
|---|---|---|
| Epic Fantasy → **High Fantasy** | merged | No platform maintains Epic Fantasy as a separate tag; it is a scale adjective on High Fantasy ("all epic fantasy is high fantasy, not vice versa"). |
| Modern Fantasy → **Urban Fantasy** | merged | Documented alias on Western platforms (TV Tropes); only distinct in Korean editorial taxonomy (masquerade criterion). |
| Dark + Dark Fantasy → **Dark (tone)** | merged into tone dimension | "Dark" is the tone; "Dark Fantasy" is tone+genre. Royal Road collapses both into the *Grimdark* tag; NU uses "Dark" as the tone list-tag. |
| Cultivation → **Xianxia** (genre) + Cultivation (trope) | split | Cultivation is the power *mechanic*; Xianxia is the genre it inhabits. NU has no separate Cultivation genre. |
| Game Elements → **LitRPG** | merged (alias) | Same reader promise (explicit RPG mechanics as a main theme); RR's tag definition ≈ NU's "Game Elements" tag. |
| games → **Video Game** | merged | Pure singular/plural variant. |
| System Cheat → *(dropped)* | dropped | Redundant intersection of System ∩ Cheat; no platform defines it independently. Represent by tagging both. |
| Sweetlove → **Sweet** (tone) | merged | Exact duplicate; "Sweetlove" is the Chinese 甜宠 translation artifact. |
| Poligami → **Harem** (trope) | merged | Polygamy = "True Harem" (committed multi-partner vs teased harem); one label with the distinction in its description. |
| Invicible → **Overpowered** (trope) | merged | Extreme setting on the same power-fantasy scale; no reader distinguishes them as search categories. |
| Fighting → **Action** | dropped as label | Not a platform tag anywhere; 100% overlap with Action. |
| Devil → *(dropped/split)* | dropped | No platform taxonomy usage; split into **Demons** (race trope) vs **Anti-Hero/Evil Protagonist** (archetype). |
| Kindness, General | dropped | Noise — no platform taxonomy usage (synopsis prose / search placeholder). |
| R21 → **R18** | merged | No platform has an R21 tier; R18 is the ceiling everywhere. |
| Realistic | dropped | Not a genre/tag on any platform; an author synopsis claim, not a taxonomy item. |
| Sequel, Prequel, Remake, Spinoff → **series relations** | reclassified | Industry standard (NovelUpdates "Related Series") is typed novel-to-novel relations, never genres. |
| Seinen → **demographic** (separate facet) | reclassified | Japanese publishing demographic, orthogonal to genre; used loosely on SH as a mature-tone proxy. |
| Eastern, Western → **region metadata** | reclassified | Store-shelf/origin axes (Webnovel "Eastern Books"), not genres. |
| Northern, Southern → **setting-style facets** (`northern_setting_style` / `southern_setting_style`) | reclassified (Klein, 2026-10-06) | "Gaya latar novel utara / selatan" — regional setting styles with full entries in §6; open question 2 resolved. |
| Medieval Fantasy → **Medieval Setting** (trope) | reclassified | Tech-level/aesthetic promise (swords-and-castles), not a genre; the pre-modern pole opposite Urban Fantasy. |
| Magic → **Magic System** (trope) | reclassified | RR's own taxonomy demotes it to tag ("magic as one of its plot elements"). |
| Isekai → **trope** (setting premise) | reclassified | Community consensus (MAL, NU, RR): a setting element pairable with any genre, not a genre axis. |
| Urban → **Urban Setting** (trope) | reclassified | Webnovel 都市 = "set in the modern city" — a setting flavor crossed with real genres. |
| Tragedy, Drama, Comedy, Sweet → **tones** | reclassified | They describe emotional register, not story type (NU/SH list some as genres, but structurally they are tones). |
| Ecchi → **trope** (spice descriptor) | reclassified | "Not exactly a genre, it's a tag" (MAL); borderline-porn descriptor, not a story type. |
| Superpowers, Strategy, Subversion, CEO, Beauty, Possessive, Academy, Arena | tropes | Setting/power/relationship/meta mechanics per platform practice. |
| Weak to Strong, Overpowered, Genius, Cheat, System, Level-up, Evolution, Rebirth, Reincarnation, Transmigration, Regression, Revenge, Farming, Blacksmith, Anti-Hero | tropes | All are NU/SH *tags*, never genres; they stack on top of genres. |

### Recommended structure

Every serious platform (NU, Webnovel, Royal Road, ScribbleHub) keeps a
**two-layer model**: a small closed controlled genre list (broad, stable,
rankings-grade) plus an open trope/element tag layer (fine-grained discovery).
Series relations sit in a third orthogonal layer everywhere. Wattpad's flat
folksonomy is the anti-pattern — do not collapse everything into one list.

Recommended for NovelForge:

1. **Genre** — controlled, closed, max 5 per novel (Klein's 2026-10-06
   amendment, up from 3; the frozen code constant from the NF-WF-014
   contract). 18 categories below.
2. **Tone** — optional multi-select, small closed set (5). Emotional register.
3. **Trope tags** — controlled vocabulary, author-assignable, multi (33
   recommended below; implementable as a follow-up layer).
4. **Content rating** — single-select (4): General / Teen / Mature / R18.
5. **Series relation** — typed novel-to-novel links (6 types; future field).
6. **Region / Demographic** — metadata facets (open questions below).

This structure is also what makes the taxonomy *shape the kisah*: genre sets
the world, tone sets the emotional register, tropes set the story engine
(second chances, power systems, relationship dynamics) — the three axes an
author actually decides when shaping a tale.

---

## 1. Genres (canonical — the frozen code constant)

Format: `code` — **Canonical EN** / *ID label*. Descriptions: EN, then ID.

### `fantasy` — **Fantasy** / *Fantasi*
EN: Magic and the supernatural are primary plot elements, not set dressing. Promise: a world where impossible forces shape events, characters, and conflicts. Implies: a magic system (hard or soft), non-mundane stakes, and wonder as a core emotion. Pairs well with: Adventure, Mystery, Romance; poorly with: hard Realistic expectations.
ID: Sihir dan hal supranatural adalah elemen utama plot, bukan sekadar hiasan. Janji: dunia di mana kekuatan mustahil membentuk peristiwa, karakter, dan konflik. Mengimplikasikan: sistem sihir (keras atau lunak), taruhan non-duniawi, dan rasa takjub sebagai emosi inti. Cocok dengan: Adventure, Mystery, Romance; kurang cocok dengan: ekspektasi realistis yang keras.

### `high_fantasy` — **High Fantasy** / *Fantasi Tinggi*
EN: An entirely invented secondary world where magic, mythical races, and gods are woven into the world's fabric. Promise: escapist immersion in a fully imagined realm with large-scale stakes. Implies: worldbuilding depth (geography, cultures, history), ensemble casts, realm-threatening conflict. Absorbs *Epic Fantasy* (a scale adjective, not a separate genre). Pairs well with: Adventure, Progression Fantasy, Tragedy; poorly with: Urban Setting expectations.
ID: Dunia sekunder yang sepenuhnya rekaan, tempat sihir, ras mitologis, dan dewa terjalin dalam tatanan dunia. Janji: pelarian imersif ke dunia rekaan yang utuh dengan taruhan berskala besar. Mengimplikasikan: kedalaman worldbuilding (geografi, budaya, sejarah), banyak karakter, konflik yang mengancam seluruh alam. Menyerap *Epic Fantasy* (kata sifat skala, bukan genre tersendiri). Cocok dengan: Adventure, Progression Fantasy, Tragedy; kurang cocok dengan: ekspektasi latar urban.

### `urban_fantasy` — **Urban Fantasy** / *Fantasi Urban*
EN: Fantasy conventions dropped into the modern world — mages, vampires, or cultivators operating in real cities, often behind a masquerade. Promise: the thrill of the impossible hiding inside the familiar. Implies: a hidden-world structure, modern institutions colliding with magic, detective or secret-society arcs. Absorbs *Modern Fantasy* (documented alias). Pairs well with: Mystery, Romance, Action; poorly with: Medieval Setting.
ID: Konvensi fantasi yang dijatuhkan ke dunia modern — penyihir, vampir, atau kultivator yang beroperasi di kota nyata, sering di balik tabir kerahasiaan. Janji: sensasi hal mustahil yang bersembunyi di dalam keseharian. Mengimplikasikan: struktur dunia tersembunyi, institusi modern yang bertabrakan dengan sihir, arc detektif atau perkumpulan rahasia. Menyerap *Modern Fantasy* (alias yang terdokumentasi). Cocok dengan: Mystery, Romance, Action; kurang cocok dengan: latar Medieval.

### `progression_fantasy` — **Progression Fantasy** / *Fantasi Progresi*
EN: The protagonist measurably grows in power or skill, and getting stronger is a central drive of the story. Promise: the satisfaction of visible growth — the Book 3 hero would crush their Book 1 self. Implies: training arcs, clear milestones, rivals and benchmarks, an underdog-to-peak structure. Orthogonal to setting (works in High, Urban, or Sci-Fi worlds). Pairs well with: Action, Xianxia, LitRPG, Academy; poorly with: stories where power is static or irrelevant (pure Romance, Slice of Life).
ID: Protagonis tumbuh secara terukur dalam kekuatan atau keterampilan, dan menjadi lebih kuat adalah penggerak utama cerita. Janji: kepuasan pertumbuhan yang terlihat — sang pahlawan di buku 3 akan menghancurkan dirinya di buku 1. Mengimplikasikan: arc latihan, tonggak yang jelas, rival dan pembanding, struktur dari lemah ke puncak. Ortogonal terhadap latar (bisa di dunia High, Urban, atau Sci-Fi). Cocok dengan: Action, Xianxia, LitRPG, Academy; kurang cocok dengan: cerita di mana kekuatan statis atau tidak relevan (Romance murni, Slice of Life).

### `xianxia` — **Xianxia** / *Xianxia*
EN: "Immortal heroes": Chinese high fantasy about cultivators pursuing immortality amid immortals, demons, and Daoist cosmology. Promise: epic cosmic stakes across multiple realms and centuries of power growth. Implies: cultivation realms and tribulations, sects, the Dao, long-lived schemes. Absorbs *Cultivation* as its home genre (Cultivation survives separately as a mechanic trope). Pairs well with: Progression Fantasy, Action, Adventure, Revenge; poorly with: modern realism.
ID: "Pahlawan abadi": fantasi tinggi Tiongkok tentang kultivator yang mengejar keabadian di tengah dewa, iblis, dan kosmologi Daois. Janji: taruhan kosmik epik lintas banyak alam dan pertumbuhan kekuatan selama berabad-abad. Mengimplikasikan: ranah kultivasi dan kesengsaraan surgawi, sekte-sekte, Dao, skema berumur panjang. Menyerap *Cultivation* sebagai genre rumahnya (Cultivation tetap ada sebagai trope mekanik). Cocok dengan: Progression Fantasy, Action, Adventure, Revenge; kurang cocok dengan: realisme modern.

### `wuxia` — **Wuxia** / *Wuxia*
EN: "Martial heroes": mortal martial artists with extraordinary-but-not-immortal skill, moving through the jianghu underworld of chivalry, revenge, and sect politics. Promise: honor-driven adventure among wandering swordsmen, where the power ceiling is one lifetime. Implies: martial sects, codes of xia, personal vendettas, grounded combat. Pairs well with: Adventure, Revenge, Romance; poorly with: cosmic stakes, LitRPG systems.
ID: "Pendekar": seniman bela diri fana dengan kemampuan luar biasa namun tidak abadi, bergerak di dunia persilatan jianghu yang penuh kesatriaan, dendam, dan politik sekte. Janji: petualangan berbalut kehormatan di antara pendekar pengembara, dengan batas kekuatan satu masa hidup. Mengimplikasikan: sekte bela diri, kode xia, dendam pribadi, pertarungan yang membumi. Cocok dengan: Adventure, Revenge, Romance; kurang cocok dengan: taruhan kosmik, sistem LitRPG.

### `litrpg` — **LitRPG** / *LitRPG*
EN: Explicit RPG mechanics — levels, stat boxes, EXP, skills, quests — are a main theme, and the characters know the world is gamified. Promise: quantified progression with visible numbers going up. Implies: system notifications, builds and classes, dungeons or towers, min-maxing decisions. Absorbs *Game Elements* (the NovelUpdates tag-name alias). Pairs well with: Progression Fantasy, Action, Apocalypse, Academy; poorly with: stories that need mystery about how power works.
ID: Mekanika RPG yang eksplisit — level, kotak stat, EXP, skill, quest — adalah tema utama, dan karakternya sadar dunia mereka tergamifikasi. Janji: progresi terkuantifikasi dengan angka yang terus naik. Mengimplikasikan: notifikasi sistem, build dan class, dungeon atau menara, keputusan min-maxing. Menyerap *Game Elements* (alias nama tag NovelUpdates). Cocok dengan: Progression Fantasy, Action, Apocalypse, Academy; kurang cocok dengan: cerita yang butuh misteri tentang cara kerja kekuatan.

### `science_fiction` — **Science Fiction** / *Fiksi Ilmiah*
EN: Futures built on extrapolated science and technology — space, AI, time travel, advanced tech. Promise: speculation about where technology takes humanity, explored through story. Implies: technological worldbuilding, scientific (even if fictional) explanations, future societies. Pairs well with: Mystery, Thriller, Horror, Adventure; poorly with: unexplained magic (that's Fantasy's job).
ID: Masa depan yang dibangun di atas ekstrapolasi sains dan teknologi — luar angkasa, AI, perjalanan waktu, teknologi maju. Janji: spekulasi tentang ke mana teknologi membawa umat manusia, dijelajahi lewat cerita. Mengimplikasikan: worldbuilding teknologis, penjelasan ilmiah (walau fiktif), masyarakat masa depan. Cocok dengan: Mystery, Thriller, Horror, Adventure; kurang cocok dengan: sihir tanpa penjelasan (itu ranah Fantasy).

### `romance` — **Romance** / *Romansa*
EN: The protagonist's romantic relationship(s) are a primary focus, and their development gets sustained attention. Promise: emotional investment in whether and how love works out. Implies: relationship arcs, emotional beats, chemistry and conflict between partners. Pairs well with: Drama, Comedy, Fantasy, Slice of Life; poorly with: stories where relationships are set dressing.
ID: Hubungan romantis protagonis adalah fokus utama, dan perkembangannya mendapat perhatian berkelanjutan. Janji: keterikatan emosional pada apakah dan bagaimana cinta berhasil. Mengimplikasikan: arc hubungan, beat emosional, chemistry dan konflik antar pasangan. Cocok dengan: Drama, Comedy, Fantasy, Slice of Life; kurang cocok dengan: cerita di mana hubungan hanya hiasan.

### `family` — **Family** / *Keluarga*
EN: Family life and household bonds are the focus — marriage, parenting, generational sagas, rich-family politics, or found family. Promise: warmth, duty, and conflict inside the people you're bound to. Implies: domestic stakes, intergenerational tension, inheritance and legacy. Pairs well with: Drama, Slice of Life, Romance; poorly with: lone-wolf power fantasy.
ID: Kehidupan keluarga dan ikatan rumah tangga adalah fokus — pernikahan, pengasuhan anak, saga lintas generasi, politik keluarga kaya, atau found family. Janji: kehangatan, kewajiban, dan konflik di antara orang-orang yang terikat padamu. Mengimplikasikan: taruhan domestik, ketegangan antargenerasi, warisan dan legacy. Cocok dengan: Drama, Slice of Life, Romance; kurang cocok dengan: power fantasy serigala penyendiri.

### `action` — **Action** / *Aksi*
EN: Fast-paced physical conflict drives the story — fights, chases, battles, a race against the clock. Promise: adrenaline and momentum; something is always at stake right now. Implies: combat set pieces, clear antagonists, escalating confrontations. Pairs well with: Adventure, Progression Fantasy, Thriller; poorly with: slow introspective pacing.
ID: Konflik fisik bertempo cepat menggerakkan cerita — pertempuran, kejar-kejaran, perang, berpacu dengan waktu. Janji: adrenalin dan momentum; selalu ada yang dipertaruhkan saat ini juga. Mengimplikasikan: adegan pertarungan, antagonis yang jelas, konfrontasi yang terus meningkat. Cocok dengan: Adventure, Progression Fantasy, Thriller; kurang cocok dengan: pacing lambat yang introspektif.

### `adventure` — **Adventure** / *Petualangan*
EN: A journey through unfamiliar places — exploration, questing, the Hero's Journey. Promise: discovery; the world itself is the reward. Implies: travel, new locations and cultures, episodic discoveries. Distinct from Action (combat pacing vs journey). Pairs well with: Fantasy, Mystery, Action; poorly with: single-location chamber pieces.
ID: Perjalanan melintasi tempat-tempat asing — eksplorasi, quest, Hero's Journey. Janji: penemuan; dunia itu sendiri adalah hadiahnya. Mengimplikasikan: perjalanan, lokasi dan budaya baru, penemuan episodik. Berbeda dari Action (pacing tempur vs perjalanan). Cocok dengan: Fantasy, Mystery, Action; kurang cocok dengan: cerita satu lokasi yang sempit.

### `mystery` — **Mystery** / *Misteri*
EN: A central puzzle the reader is invited to solve alongside the protagonist — clues, red herrings, deduction. Promise: the pleasure of figuring it out before the reveal. Implies: fair-play clues, suspects, a detective structure (formal or informal). Pairs well with: Thriller, Urban Fantasy, Historical; poorly with: stories where answers don't matter.
ID: Teka-teki sentral yang mengundang pembaca memecahkannya bersama protagonis — petunjuk, pengalih perhatian, deduksi. Janji: kenikmatan menebak sebelum terungkap. Mengimplikasikan: petunjuk yang adil, tersangka, struktur detektif (formal atau informal). Cocok dengan: Thriller, Urban Fantasy, Historical; kurang cocok dengan: cerita di mana jawaban tidak penting.

### `thriller` — **Thriller** / *Thriller*
EN: Sustained suspense and danger — the hero is under threat and the stakes keep rising. Promise: edge-of-your-seat tension, fear and dread as fuel. Implies: ticking clocks, vulnerable protagonists, twists. Distinct from Mystery (suspense/danger vs puzzle-solving). Pairs well with: Mystery, Action, Horror; poorly with: cozy low-stakes stories.
ID: Ketegangan dan bahaya yang berkelanjutan — sang pahlawan terancam dan taruhannya terus naik. Janji: ketegangan yang membuat gelisah, ketakutan sebagai bahan bakar. Mengimplikasikan: hitungan mundur, protagonis yang rentan, plot twist. Berbeda dari Mystery (ketegangan/bahaya vs pemecahan teka-teki). Cocok dengan: Mystery, Action, Horror; kurang cocok dengan: cerita cozy bertaruhan rendah.

### `horror` — **Horror** / *Horor*
EN: The story aims to frighten — ghosts, body horror, dread, survival against the uncanny. Promise: visceral fear as the core emotion. Implies: atmosphere of dread, vulnerability, disturbing imagery. Pairs well with: Mystery, Thriller, Dark tone; poorly with: Comedy (unless deliberate horror-comedy).
ID: Cerita bertujuan menakuti — hantu, body horror, kengerian, bertahan hidup melawan yang tak lazim. Janji: ketakutan visceral sebagai emosi inti. Mengimplikasikan: atmosfer mencekam, kerentanan, citra yang mengganggu. Cocok dengan: Mystery, Thriller, tone Dark; kurang cocok dengan: Comedy (kecuali horor-komedi yang disengaja).

### `historical` — **Historical** / *Sejarah*
EN: Set in a well-defined past period, trading on real history's politics, wars, and culture. Promise: the texture of another era, with stakes rooted in real events. Implies: period research, political intrigue, cultural detail. Pairs well with: Drama, Romance, Mystery, Strategy; poorly with: anachronistic modern systems (unless deliberate).
ID: Berlatar periode masa lalu yang terdefinisi jelas, memanfaatkan politik, perang, dan budaya sejarah nyata. Janji: tekstur era lain, dengan taruhan berakar pada peristiwa nyata. Mengimplikasikan: riset periode, intrik politik, detail budaya. Cocok dengan: Drama, Romance, Mystery, Strategy; kurang cocok dengan: sistem modern yang anakronistis (kecuali disengaja).

### `apocalypse` — **Apocalypse** / *Apokalips*
EN: A collapsed or collapsing world — zombies, monsters, disasters, system-apocalypse — where survival is the core stake. Promise: civilization stripped away; what people become when nothing is left. Implies: survival logistics, base-building, moral collapse, scarce resources. Placed as genre (WebNovel shelves it as one) rather than a mere setting. Pairs well with: LitRPG, Action, Horror, Strategy; poorly with: cozy Slice of Life.
ID: Dunia yang runtuh atau sedang runtuh — zombi, monster, bencana, kiamat sistem — di mana bertahan hidup adalah taruhan inti. Janji: peradaban yang terkelupas; menjadi apa manusia saat tak ada lagi yang tersisa. Mengimplikasikan: logistik bertahan hidup, membangun markas, keruntuhan moral, sumber daya langka. Ditempatkan sebagai genre (WebNovel menjadikannya rak tersendiri), bukan sekadar latar. Cocok dengan: LitRPG, Action, Horror, Strategy; kurang cocok dengan: Slice of Life yang cozy.

### `slice_of_life` — **Slice of Life** / *Slice of Life*
EN: No grand plot — the story follows characters through ordinary day-to-day life. Promise: warmth, recognition, and small meaningful moments. Implies: episodic vignettes, character-driven scenes, low stakes done well. Pairs well with: Comedy, Romance, Family, Sweet tone; poorly with: epic stakes and power progression.
ID: Tanpa plot besar — cerita mengikuti karakter menjalani kehidupan sehari-hari yang biasa. Janji: kehangatan, pengenalan, dan momen-momen kecil yang bermakna. Mengimplikasikan: vignette episodik, adegan berbasis karakter, taruhan rendah yang digarap baik. Cocok dengan: Comedy, Romance, Family, tone Sweet; kurang cocok dengan: taruhan epik dan progresi kekuatan.

---

## 2. Tones (optional, multi-select)

Tone is the emotional register — orthogonal to genre. `Dark Fantasy` in the old
list is simply `fantasy` + Dark tone.

### `comedy` — **Comedy** / *Komedi*
EN: The story plays situations for laughs — absurdity, wit, and comedic timing as the point. Promise: you'll laugh. Implies: joke-driven scenes, comic-relief characters, permission to be silly. Pairs well with: Slice of Life, Romance, Ecchi; poorly with: Tragedy (unless black comedy).
ID: Cerita memainkan situasi untuk tawa — absurditas, kecerdasan kata, dan timing komedi sebagai intinya. Janji: kau akan tertawa. Mengimplikasikan: adegan berbasis lelucon, karakter pelepas komedi, izin untuk konyol. Cocok dengan: Slice of Life, Romance, Ecchi; kurang cocok dengan: Tragedy (kecuali komedi hitam).

### `drama` — **Drama** / *Drama*
EN: Big emotions through grand conflict — betrayal, sacrifice, high personal stakes. Promise: you'll FEEL things strongly. Implies: emotional set pieces, relationship ruptures and repairs, catharsis. Pairs well with: Romance, Family, Tragedy; poorly with: detached irony.
ID: Emosi besar lewat konflik akbar — pengkhianatan, pengorbanan, taruhan personal yang tinggi. Janji: kau akan MERASA dengan kuat. Mengimplikasikan: adegan emosional besar, keretakan dan perbaikan hubungan, katarsis. Cocok dengan: Romance, Family, Tragedy; kurang cocok dengan: ironi yang datar.

### `tragedy` — **Tragedy** / *Tragedi*
EN: Suffering is the point — death flags, doomed love, bleak outcomes honestly earned. Promise: beautiful pain; bring tissues or brace yourself. Implies: inevitable loss, noble failures, emotional devastation as theme. Distinct from Dark: Tragedy is about suffering and outcome; Dark is about bleak register. Pairs well with: Drama, Historical, Dark; poorly with: Sweet, Comedy.
ID: Penderitaan adalah intinya — bendera kematian, cinta yang celaka, akhir suram yang pantas. Janji: kepedihan yang indah; siapkan tisu atau kuatkan hati. Mengimplikasikan: kehilangan yang tak terelakkan, kegagalan yang mulia, kehancuran emosional sebagai tema. Berbeda dari Dark: Tragedy soal penderitaan dan akhir; Dark soal nada yang suram. Cocok dengan: Drama, Historical, Dark; kurang cocok dengan: Sweet, Comedy.

### `dark` — **Dark** / *Kelam*
EN: A bleak register — graphic violence, moral ambiguity, cruel worlds, disturbing content. Promise: no punches pulled. Implies: content warnings, ruthless characters, uncomfortable themes. Note: Dark is a TONE, not a genre — it modifies any genre. Pairs well with: Horror, Tragedy, Anti-Hero; poorly with: Sweet, Comedy.
ID: Nada yang suram — kekerasan grafis, ambiguitas moral, dunia yang kejam, konten mengganggu. Janji: tanpa sensor. Mengimplikasikan: peringatan konten, karakter kejam, tema yang tak nyaman. Catatan: Dark adalah TONE, bukan genre — ia memodifikasi genre apa pun. Cocok dengan: Horror, Tragedy, Anti-Hero; kurang cocok dengan: Sweet, Comedy.

### `sweet` — **Sweet** / *Manis*
EN: Warm, low-angst affection — mutual care, small gestures, heartwarming payoff. Promise: comfort; the literary equivalent of a warm drink. Implies: slow-burn kindness, resolved misunderstandings, gentle pacing. Absorbs *Sweetlove* (translation artifact). Pairs well with: Romance, Slice of Life, Family; poorly with: Revenge, Dark, Tragedy.
ID: Kasih sayang yang hangat dan rendah konflik — kepedulian timbal balik, gestur kecil, payoff yang menghangatkan. Janji: kenyamanan; padanan sastra dari minuman hangat. Mengimplikasikan: kebaikan slow-burn, kesalahpahaman yang terselesaikan, pacing lembut. Menyerap *Sweetlove* (artefak terjemahan). Cocok dengan: Romance, Slice of Life, Family; kurang cocok dengan: Revenge, Dark, Tragedy.

---

## 3. Content ratings (single-select)

### `general` — **General** / *Semua Umur*
EN: Suitable for all ages. No explicit sexual content, no graphic gore, no deeply disturbing themes. The default.
ID: Cocok untuk semua umur. Tanpa konten seksual eksplisit, tanpa gore grafis, tanpa tema yang sangat mengganggu. Nilai bawaan.

### `teen` — **Teen** / *Remaja*
EN: Ages 13+. Mild violence, romance without explicit detail, darker themes handled lightly.
ID: Usia 13+. Kekerasan ringan, romansa tanpa detail eksplisit, tema gelap yang ditangani ringan.

### `mature` — **Mature** / *Dewasa*
EN: Ages 16+. Strong violence, mature themes, disturbing content — but not explicit sexual content. Use content warnings.
ID: Usia 16+. Kekerasan kuat, tema dewasa, konten mengganggu — tetapi bukan konten seksual eksplisit. Gunakan peringatan konten.

### `r18` — **R18** / *Khusus Dewasa (R18)*
EN: Adults only. Explicit sexual content. The platform ceiling — no R21 tier exists on any major webnovel platform (R21 is merged here).
ID: Khusus dewasa. Konten seksual eksplisit. Batas tertinggi platform — tidak ada tingkat R21 di platform webnovel besar mana pun (R21 digabung ke sini).

---

## 4. Trope tags (recommended controlled vocabulary — future layer)

Tropes are story *mechanics*: they stack on top of genres and are the primary
fine-grained discovery axis on every real platform (NU tags, RR tags, WebNovel
hashtags). None of these are genres. Recommended as a follow-up layer after
Genre + Tone + Rating ship; the vocabulary below is frozen-ready.

**Genre-fit analysis:** per Klein (2026-10-06), each of the 32 trope items was
analyzed one by one for genre compatibility in
[`trope-research.md`](trope-research.md) — **verdict: none promoted**. The
verdicts confirm the research-backed genre/trope split: every item is a
mechanic, premise, setting, archetype, descriptor, or drive that stacks on
top of genres on every surveyed platform.

### Power & progression

**`weak_to_strong` — Weak to Strong / *Lemah ke Kuat***
EN: The protagonist starts at the very bottom — trash talent, lowest class — and climbs to the peak through effort, cheats, or systems. Promise: the most satisfying arc in webnovels: earned ascent. Implies: humiliation early, visible milestones, rivals who looked down on the MC. Pairs well with: Progression Fantasy, Xianxia, Revenge; poorly with: Overpowered (opposites — pick one).
ID: Protagonis mulai dari titik terendah — bakat sampah, kelas terendah — dan mendaki ke puncak lewat usaha, cheat, atau sistem. Janji: arc paling memuaskan di webnovel: pendakian yang diperjuangkan. Mengimplikasikan: penghinaan di awal, tonggak yang terlihat, rival yang meremehkan MC. Cocok dengan: Progression Fantasy, Xianxia, Revenge; kurang cocok dengan: Overpowered (berlawanan — pilih satu).

**`overpowered` — Overpowered / *Terlalu Kuat***
EN: The protagonist is disproportionately strong for their level from early on — strong enough to break the setting's balance. Promise: power fantasy; the fun is HOW they win, not IF. Implies: creative problem-solving, enemies who force the MC to hold back, comedy of overwhelming force. Absorbs *Invincible* as its extreme setting. Pairs well with: Comedy, Action, Harem; poorly with: Weak to Strong, tension-dependent Horror.
ID: Protagonis jauh lebih kuat dari levelnya sejak awal — cukup kuat untuk merusak keseimbangan dunia. Janji: power fantasy; keseruannya adalah BAGAIMANA ia menang, bukan APAKAH ia menang. Mengimplikasikan: pemecahan masalah yang kreatif, musuh yang memaksa MC menahan diri, komedi kekuatan luar biasa. Menyerap *Invincible* sebagai setelan ekstremnya. Cocok dengan: Comedy, Action, Harem; kurang cocok dengan: Weak to Strong, Horror yang butuh ketegangan.

**`genius` — Genius / *Jenius***
EN: The protagonist wins through intellect, talent, or scheming rather than raw power — strategist, crafter, alchemist, top scholar. Promise: cleverness as spectacle. Implies: plans within plans, knowledge-as-power scenes, rivals outwitted not outmuscled. Pairs well with: Strategy, Mystery, Academy; poorly with: brute-force-only Action.
ID: Protagonis menang lewat kecerdasan, bakat, atau siasat, bukan kekuatan mentah — ahli strategi, perajin, alkemis, murid terpandai. Janji: kecerdikan sebagai tontonan. Mengimplikasikan: rencana berlapis, adegan pengetahuan-sebagai-kekuatan, rival yang diakali bukan dilawan otot. Cocok dengan: Strategy, Mystery, Academy; kurang cocok dengan: Action yang hanya mengandalkan otot.

**`cheat` — Cheat / *Cheat***
EN: The protagonist holds an unfair, story-breaking advantage — a "golden finger": a unique skill, item, talent, or future knowledge. Promise: watching an underdog break the rules of their world. Implies: the cheat's limits become the real plot (what CAN'T it do?), jealous rivals, escalation. Pairs well with: System (the classic combo), Weak to Strong, Comedy; poorly with: hard Realistic tone.
ID: Protagonis memegang keunggulan yang tidak adil dan merusak tatanan cerita — "golden finger": skill unik, item, bakat, atau pengetahuan masa depan. Janji: menyaksikan underdog melanggar aturan dunianya. Mengimplikasikan: batas cheat menjadi plot sesungguhnya (apa yang TIDAK bisa dilakukannya?), rival yang iri, eskalasi. Cocok dengan: System (kombo klasik), Weak to Strong, Comedy; kurang cocok dengan: tone realistis yang keras.

**`system` — System / *Sistem***
EN: The protagonist is bound to a mysterious program-like entity that issues quests, grants abilities, and upgrades over time. Promise: a gamified life with clear objectives and rewards. Implies: quest structures, system personality (or cold logic), mission-driven arcs. Note: a System story need not be LitRPG — no stat boxes required. Pairs well with: Cheat, Apocalypse, Urban Fantasy; poorly with: pure Historical realism.
ID: Protagonis terikat pada entitas misterius seperti program yang memberi quest, menganugerahkan kemampuan, dan meningkat seiring waktu. Janji: kehidupan yang tergamifikasi dengan tujuan dan hadiah yang jelas. Mengimplikasikan: struktur quest, kepribadian sistem (atau logika dingin), arc berbasis misi. Catatan: cerita System tidak harus LitRPG — tidak butuh kotak stat. Cocok dengan: Cheat, Apocalypse, Urban Fantasy; kurang cocok dengan: realisme Historical murni.

**`level_up` — Level-up / *Naik Level***
EN: Power growth is numeric and visible — EXP, levels, stats, skills, status screens. Promise: the dopamine of numbers going up. Implies: grinding arcs, build choices, rank ladders. Pairs well with: LitRPG, Progression Fantasy, Academy; poorly with: soft-magic High Fantasy.
ID: Pertumbuhan kekuatan bersifat numerik dan terlihat — EXP, level, stat, skill, layar status. Janji: dopamin angka yang terus naik. Mengimplikasikan: arc grinding, pilihan build, tangga peringkat. Cocok dengan: LitRPG, Progression Fantasy, Academy; kurang cocok dengan: High Fantasy bersihir lunak.

**`evolution` — Evolution / *Evolusi***
EN: Power growth through biological transformation — devouring, adapting, mutating into new forms and species. Promise: survival-driven metamorphosis; every meal can change what you are. Implies: non-human or monster leads, adaptation puzzles, form tiers. Distinct from Level-up (adaptive vs numeric). Pairs well with: Horror, Apocalypse, Action; poorly with: civilized Academy settings.
ID: Pertumbuhan kekuatan lewat transformasi biologis — melahap, beradaptasi, bermutasi menjadi wujud dan spesies baru. Janji: metamorfosis yang didorong survival; setiap santapan bisa mengubah dirimu. Mengimplikasikan: protagonis non-manusia/monster, teka-teki adaptasi, tingkatan wujud. Berbeda dari Level-up (adaptif vs numerik). Cocok dengan: Horror, Apocalypse, Action; kurang cocok dengan: latar Academy yang beradab.

**`cultivation_mechanic` — Cultivation / *Kultivasi***
EN: Power comes from disciplined training — meditation, techniques, pills, tribulations — climbing hierarchical realms. Promise: the classic weak-to-strong ladder with named breakthroughs. As a mechanic it can live inside Xianxia (its home), Wuxia, or even Urban Fantasy. Pairs well with: Xianxia, Progression Fantasy, Revenge; poorly with: Sci-Fi.
ID: Kekuatan datang dari latihan disiplin — meditasi, teknik, pil, kesengsaraan surgawi — mendaki ranah hierarkis. Janji: tangga lemah-ke-kuat klasik dengan terobosan bernama. Sebagai mekanik ia bisa hidup di Xianxia (rumahnya), Wuxia, bahkan Urban Fantasy. Cocok dengan: Xianxia, Progression Fantasy, Revenge; kurang cocok dengan: Sci-Fi.

**`magic_system` — Magic System / *Sistem Sihir***
EN: Magic follows explicit rules the reader can learn — costs, limits, schools, interactions. Promise: cleverness within constraints; the system itself is a puzzle. Implies: rule-establishing scenes, creative exploitation, hard-magic payoffs. Pairs well with: Fantasy, Academy, Mystery; poorly with: soft-magic wonder (pick one).
ID: Sihir mengikuti aturan eksplisit yang bisa dipelajari pembaca — biaya, batas, aliran, interaksi. Janji: kecerdikan dalam batasan; sistem itu sendiri adalah teka-teki. Mengimplikasikan: adegan penetapan aturan, eksploitasi kreatif, payoff sihir keras. Cocok dengan: Fantasy, Academy, Mystery; kurang cocok dengan: keajaiban sihir lunak (pilih satu).

**`superpowers` — Superpowers / *Kekuatan Super***
EN: Characters wield extraordinary innate abilities — awakenings, mutations, powers as a fact of the world. Promise: what people DO with impossible gifts. Implies: power classifications, society reshaped by abilities, hero/villain dynamics. Pairs well with: Action, Urban Fantasy, Sci-Fi; poorly with: low-magic Historical.
ID: Karakter memiliki kemampuan luar biasa yang melekat — kebangkitan, mutasi, kekuatan sebagai fakta dunia. Janji: apa yang dilakukan orang dengan anugerah mustahil. Mengimplikasikan: klasifikasi kekuatan, masyarakat yang dibentuk ulang oleh kemampuan, dinamika pahlawan/penjahat. Cocok dengan: Action, Urban Fantasy, Sci-Fi; kurang cocok dengan: Historical bersihir rendah.

### Second chance

**`rebirth` — Rebirth / *Terlahir Kembali***
EN: The protagonist dies and is reborn as their younger self in the SAME life, keeping memories — the classic Chinese second-chance trope. Promise: redoing everything with future knowledge; the ultimate "if I knew then what I know now". Implies: a past betrayal or failure to fix, dramatic irony, accelerated early arcs. Pairs well with: Revenge, Xianxia, Romance; poorly with: stories that need a fresh world.
ID: Protagonis mati dan lahir kembali sebagai dirinya yang lebih muda di kehidupan yang SAMA, dengan ingatan utuh — trope kesempatan kedua klasik Tiongkok. Janji: mengulang segalanya dengan pengetahuan masa depan. Mengimplikasikan: pengkhianatan atau kegagalan masa lalu yang harus diperbaiki, ironi dramatis, arc awal yang dipercepat. Cocok dengan: Revenge, Xianxia, Romance; kurang cocok dengan: cerita yang butuh dunia baru.

**`reincarnation` — Reincarnation / *Reinkarnasi***
EN: The protagonist dies and begins a NEW life as a different person — often a baby in a new world — with memories intact or returning. Promise: a clean slate with an old soul's wisdom. Implies: new identity, new family/world, growing up twice. Pairs well with: Fantasy, Isekai-adjacent premises, Adventure; poorly with: fix-the-past plots (that's Rebirth).
ID: Protagonis mati dan memulai hidup BARU sebagai orang berbeda — sering sebagai bayi di dunia baru — dengan ingatan utuh atau kembali bertahap. Janji: lembaran bersih dengan kebijaksanaan jiwa tua. Mengimplikasikan: identitas baru, keluarga/dunia baru, tumbuh dua kali. Cocok dengan: Fantasy, premis ala-Isekai, Adventure; kurang cocok dengan: plot memperbaiki masa lalu (itu ranah Rebirth).

**`transmigration` — Transmigration / *Transmigrasi* (definisi kanonis Klein, 2026-10-06)**
EN: The protagonist's soul is ripped from their own body and placed into ANOTHER body in ANOTHER era — body AND time transfer together. The classic case: a modern man murdered today wakes up five hundred years in the past inside a young man's body, carrying his future memories into someone else's life and obligations. Promise: maximum dislocation — a stranger's body, a foreign age, your memories as your only asset. Implies: identity dissonance (living someone else's life), future knowledge as a cheat, culture shock across centuries, the mystery of whose body you are wearing. Distinct from Rebirth (same body, same life, younger self) and Regression (same adult life rewound). Pairs well with: Historical, Romance, Mystery; poorly with: same-life do-overs.
ID: Jiwa protagonis dicabut dari tubuhnya sendiri dan ditempatkan ke tubuh LAIN di zaman LAIN — pindah tubuh dan pindah zaman bersamaan. Kasus klasik: seorang pria modern yang terbunuh hari ini terbangun lima ratus tahun di masa lalu di dalam tubuh seorang pemuda, membawa ingatan masa depannya ke dalam hidup dan kewajiban orang lain. Janji: dislokasi maksimum — tubuh orang asing, zaman asing, ingatanmu sebagai satu-satunya aset. Mengimplikasikan: disonansi identitas (menjalani hidup orang lain), pengetahuan masa depan sebagai cheat, gegar budaya lintas abad, misteri tubuh siapa yang kau kenakan. Berbeda dari Rebirth (tubuh sama, hidup sama, diri yang lebih muda) dan Regression (kehidupan dewasa yang sama diputar mundur). Cocok dengan: Historical, Romance, Mystery; kurang cocok dengan: pengulangan hidup yang sama.

**`regression` — Regression / *Regresi***
EN: Time itself rewinds: the protagonist returns to an earlier point of the SAME adult life with future knowledge — the Korean tower/hunter signature trope. Promise: replaying your life with a walkthrough. Implies: knowledge-as-cheat, fixing specific failures, the question of whether fate can really change. Pairs well with: Apocalypse, Action, Revenge, Academy; poorly with: new-world exploration.
ID: Waktu itu sendiri berputar mundur: protagonis kembali ke titik lebih awal dalam kehidupan dewasanya yang SAMA dengan pengetahuan masa depan — trope khas menara/hunter Korea. Janji: mengulang hidup dengan panduan walkthrough. Mengimplikasikan: pengetahuan-sebagai-cheat, memperbaiki kegagalan spesifik, pertanyaan apakah takdir benar-benar bisa berubah. Cocok dengan: Apocalypse, Action, Revenge, Academy; kurang cocok dengan: eksplorasi dunia baru.

### Drive

**`revenge` — Revenge / *Dendam***
EN: The protagonist's driving goal is settling a score — betrayal, murder, ruin answered in kind. Promise: cathartic payback, dish by dish. Implies: a concrete wrongdoer, long planning, the moral cost of vengeance. Pairs well with: Rebirth, Regression, Action, Tragedy; poorly with: Sweet tone (unless subverted).
ID: Tujuan penggerak protagonis adalah menuntaskan dendam — pengkhianatan, pembunuhan, kehancuran dibalas setimpal. Janji: pembalasan yang katarsis, hidangan demi hidangan. Mengimplikasikan: pelaku yang konkret, perencanaan panjang, harga moral dari dendam. Cocok dengan: Rebirth, Regression, Action, Tragedy; kurang cocok dengan: tone Sweet (kecuali disubversi).

### Profession

**`farming` — Farming / *Bertani***
EN: The core activity is agriculture — planting, harvesting, raising beasts — with progression measured in farm output. Promise: cozy slow-life satisfaction; growth you can eat. Implies: land development, harvest cycles, the farm as sanctuary and economy. Pairs well with: Slice of Life, Comedy, Apocalypse (contrast); poorly with: breakneck Thriller pacing.
ID: Aktivitas inti adalah pertanian — menanam, memanen, memelihara hewan — dengan progresi diukur dari hasil panen. Janji: kepuasan slow-life yang cozy; pertumbuhan yang bisa dimakan. Mengimplikasikan: pengembangan lahan, siklus panen, pertanian sebagai tempat suci dan ekonomi. Cocok dengan: Slice of Life, Comedy, Apocalypse (kontras); kurang cocok dengan: pacing Thriller yang ngebut.

**`blacksmith` — Blacksmith / *Pandai Besi***
EN: The protagonist's power identity is forging — weapons, artifacts, gear — a "production class" hero. Promise: mastery of craft as the road to legend; every hero needs a smith. Implies: crafting arcs, legendary commissions, the politics of who gets the good gear. Pairs well with: Fantasy, LitRPG, Action; poorly with: stories allergic to logistics.
ID: Identitas kekuatan protagonis adalah menempa — senjata, artefak, perlengkapan — pahlawan "kelas produksi". Janji: penguasaan kerajinan sebagai jalan menuju legenda; setiap pahlawan butuh pandai besi. Mengimplikasikan: arc kerajinan, komisi legendaris, politik siapa mendapat perlengkapan terbaik. Cocok dengan: Fantasy, LitRPG, Action; kurang cocok dengan: cerita yang alergi logistik.

### Relationships

**`harem` — Harem / *Harem***
EN: Multiple simultaneous love interests orbit one protagonist. Promise: an ensemble of romances, jealousy comedy, and "who will they choose" tension. Implies: distinct love-interest archetypes, relationship juggling, fan-service dynamics. Absorbs *Polygamy* as the committed-marriage variant ("True Harem"). Pairs well with: Romance, Comedy, Fantasy; poorly with: Tragedy, realistic monogamy expectations.
ID: Banyak minat cinta simultan mengorbit satu protagonis. Janji: ansambel romansa, komedi cemburu, dan ketegangan "siapa yang dipilih". Mengimplikasikan: arketipe pasangan yang berbeda-beda, juggling hubungan, dinamika fan-service. Menyerap *Polygamy* sebagai varian pernikahan resmi ("True Harem"). Cocok dengan: Romance, Comedy, Fantasy; kurang cocok dengan: Tragedy, ekspektasi monogami realistis.

**`possessive` — Possessive / *Posesif***
EN: A love interest who is intensely jealous, territorial, and "claiming" — obsession framed as deep love. Promise: over-the-top devotion and power-imbalance drama. Implies: luxury pampering, jealousy arcs, dominant/doting dynamics. Pairs well with: CEO, Romance, Drama; poorly with: healthy-relationship Slice of Life.
ID: Pasangan yang sangat pencemburu, teritorial, dan "mengklaim" — obsesi yang dibingkai sebagai cinta mendalam. Janji: pengabdian berlebihan dan drama ketimpangan kuasa. Mengimplikasikan: pemanjaan mewah, arc kecemburuan, dinamika dominan/manja. Cocok dengan: CEO, Romance, Drama; kurang cocok dengan: Slice of Life berhubunga sehat.

**`ceo` — CEO / *CEO***
EN: Modern urban romance built around a rich, powerful company president and a Cinderella-like heroine — contracts, boardrooms, luxury, family politics. Promise: power-fantasy romance in a glass tower. Implies: workplace settings, business conspiracies, the overbearing-but-doting lead. Pairs well with: Romance, Possessive, Drama; poorly with: Fantasy settings.
ID: Romansa urban modern yang dibangun di sekitar presiden perusahaan yang kaya dan berkuasa serta heroine ala-Cinderella — kontrak, ruang rapat, kemewahan, politik keluarga. Janji: romansa power-fantasy di menara kaca. Mengimplikasikan: latar kantor, konspirasi bisnis, tokoh dominan-namun-manja. Cocok dengan: Romance, Possessive, Drama; kurang cocok dengan: latar Fantasy.

**`beauty` — Beauty / *Kecantikan***
EN: Physical attractiveness as a story feature — a stunning lead whose looks drive the premise (desired, envied, underestimated). Promise: beauty as plot force, not decoration. Implies: attention-as-conflict, jealousy, the beautiful underdog. Pairs well with: Romance, CEO, Drama; poorly with: stories where looks never matter.
ID: Daya tarik fisik sebagai fitur cerita — tokoh rupawan yang penampilannya menggerakkan premis (diinginkan, dicemburui, diremehkan). Janji: kecantikan sebagai kekuatan plot, bukan hiasan. Mengimplikasikan: perhatian-sebagai-konflik, kecemburuan, si cantik yang diremehkan. Cocok dengan: Romance, CEO, Drama; kurang cocok dengan: cerita di mana penampilan tak pernah penting.

**`ecchi` — Ecchi / *Ecchi***
EN: Sexual fanservice without explicit sex — suggestive situations, teasing, titillation played for comedy or spice. Promise: spicy but not explicit. Implies: comedic misunderstandings, risqué scenes that stop short, light tone. Pairs well with: Comedy, Romance, Harem; poorly with: R18 expectations (it's the tease, not the act) and grim Dark tone.
ID: Fan-service seksual tanpa seks eksplisit — situasi sugestif, godaan, sensasi yang dimainkan untuk komedi atau bumbu. Janji: pedas tapi tidak eksplisit. Mengimplikasikan: kesalahpahaman komedik, adegan berani yang berhenti di ambang, tone ringan. Cocok dengan: Comedy, Romance, Harem; kurang cocok dengan: ekspektasi R18 (ini godaannya, bukan tindakannya) dan tone Dark yang suram.

### Premise & setting

**`isekai` — Isekai / *Isekai***
EN: The protagonist is transported to, reincarnated in, or trapped inside another world and must adapt to its rules. Promise: the ultimate fish-out-of-water — our knowledge vs their world. Implies: new-world exploration, knowledge-as-cheat, culture clash. A setting premise, not a genre. Pairs well with: Fantasy, Adventure, LitRPG; poorly with: stories rooted in one familiar world.
ID: Protagonis dipindahkan ke, terlahir kembali di, atau terjebak dalam dunia lain dan harus beradaptasi dengan aturannya. Janji: ikan-di-luar-air pamungkas — pengetahuan kita vs dunia mereka. Mengimplikasikan: eksplorasi dunia baru, pengetahuan-sebagai-cheat, benturan budaya. Premis latar, bukan genre. Cocok dengan: Fantasy, Adventure, LitRPG; kurang cocok dengan: cerita yang berakar di satu dunia familiar.

**`academy` — Academy / *Akademi***
EN: Much of the story unfolds at a school or training institution for powered youths — classes, rivalries, tournaments. Promise: school-life social dynamics fused with power growth. Implies: class rankings, exams as battles, peer rivals, coming-of-age. Pairs well with: Progression Fantasy, Romance, Action; poorly with: lone-wanderer Xianxia.
ID: Sebagian besar cerita berlangsung di sekolah atau institusi pelatihan untuk anak muda berkekuatan — kelas, rivalitas, turnamen. Janji: dinamika sosial kehidupan sekolah yang menyatu dengan pertumbuhan kekuatan. Mengimplikasikan: peringkat kelas, ujian sebagai pertempuran, rival sebaya, coming-of-age. Cocok dengan: Progression Fantasy, Romance, Action; kurang cocok dengan: Xianxia pengembara penyendiri.

**`arena` — Arena / *Arena***
EN: Organized combat contests — tournaments, gladiatorial bouts, death games — as the story's engine. Promise: bracket drama; every fight matters and someone climbs. Implies: tournament arcs, crowd spectacle, rival brackets. Pairs well with: Action, Progression Fantasy, LitRPG; poorly with: quiet Slice of Life.
ID: Kontes tempur terorganisir — turnamen, duel gladiator, death game — sebagai mesin cerita. Janji: drama braket; setiap pertarungan penting dan seseorang naik peringkat. Mengimplikasikan: arc turnamen, tontonan kerumunan, braket rival. Cocok dengan: Action, Progression Fantasy, LitRPG; kurang cocok dengan: Slice of Life yang tenang.

**`video_game` — Video Game / *Video Game***
EN: The story is set inside or around an actual video game — VRMMO, esports, game world. Promise: the game IS the world (or the job). Implies: game-culture detail, guilds/teams, the boundary between game and reality. Pairs well with: LitRPG, Action, Comedy; poorly with: stories where game mechanics are metaphor only.
ID: Cerita berlatar di dalam atau sekitar video game sungguhan — VRMMO, esports, dunia game. Janji: game ITU dunianya (atau pekerjaannya). Mengimplikasikan: detail budaya game, guild/tim, batas antara game dan realita. Cocok dengan: LitRPG, Action, Comedy; kurang cocok dengan: cerita di mana mekanika game hanya metafora.

**`urban_setting` — Urban Setting / *Latar Urban***
EN: The story lives in the modern city — its streets, businesses, nightlife, and institutions. Promise: the familiar made strange (or powerful). Implies: contemporary detail, city-as-character, modern problems with unmodern solutions. Pairs well with: Urban Fantasy, Romance, Mystery; poorly with: Medieval Setting.
ID: Cerita hidup di kota modern — jalanan, bisnis, kehidupan malam, dan institusinya. Janji: yang familiar menjadi asing (atau perkasa). Mengimplikasikan: detail kontemporer, kota-sebagai-karakter, masalah modern dengan solusi tak modern. Cocok dengan: Urban Fantasy, Romance, Mystery; kurang cocok dengan: Latar Medieval.

**`medieval_setting` — Medieval Setting / *Latar Medieval***
EN: Swords, castles, knights, and feudal politics — the pre-modern aesthetic. Promise: the classic fantasy texture. Implies: feudal hierarchies, court intrigue, pre-gunpowder warfare. Pairs well with: High Fantasy, Historical, Adventure; poorly with: modern technology.
ID: Pedang, kastil, kesatria, dan politik feodal — estetika pra-modern. Janji: tekstur fantasi klasik. Mengimplikasikan: hierarki feodal, intrik istana, peperangan pra-senjata api. Cocok dengan: High Fantasy, Historical, Adventure; kurang cocok dengan: teknologi modern.

### Character

**`anti_hero` — Anti-Hero / *Anti-Hero***
EN: The protagonist lacks traditional heroic traits — cynical, amoral, ruthless — yet remains the sympathetic focus. Promise: competence without conscience (or with a buried one). Implies: pragmatic choices, moral friction, villains who look heroic by comparison. Neighbors: Evil/Ruthless/Villain Protagonist. Pairs well with: Dark tone, Strategy, Revenge; poorly with: Sweet tone.
ID: Protagonis tak memiliki sifat heroik tradisional — sinis, amoral, kejam — namun tetap menjadi fokus yang simpatik. Janji: kompetensi tanpa nurani (atau dengan nurani yang terkubur). Mengimplikasikan: pilihan pragmatis, friksi moral, penjahat yang tampak heroik sebagai perbandingan. Tetangga: Evil/Ruthless/Villain Protagonist. Cocok dengan: tone Dark, Strategy, Revenge; kurang cocok dengan: tone Sweet.

**`demons` — Demons / *Iblis***
EN: Demons/devils as a story element — a race, a faction, or the protagonist's nature. Promise: dealing with the monstrous, whether as enemy, ally, or self. Implies: infernal hierarchies, temptation arcs, monstrous protagonists. Pairs well with: Dark Fantasy (= Fantasy + Dark), Action, Horror; poorly with: cozy Slice of Life.
ID: Iblis sebagai elemen cerita — ras, faksi, atau hakikat protagonis. Janji: berurusan dengan yang mengerikan, sebagai musuh, sekutu, atau diri sendiri. Mengimplikasikan: hierarki infernal, arc godaan, protagonis mengerikan. Cocok dengan: Dark Fantasy (= Fantasy + Dark), Action, Horror; kurang cocok dengan: Slice of Life yang cozy.

### Meta

**`strategy` — Strategy / *Strategi***
EN: Winning through scheming — military tactics, court intrigue, business warfare, battle of wits. Promise: the pleasure of watching a plan come together. Implies: intelligent adversaries, information as weapon, long cons. Pairs well with: Historical, Genius, Thriller; poorly with: brute-force Action.
ID: Menang lewat siasat — taktik militer, intrik istana, perang bisnis, adu kecerdasan. Janji: kenikmatan menyaksikan rencana menjadi kenyataan. Mengimplikasikan: lawan yang cerdas, informasi sebagai senjata, rencana jangka panjang. Cocok dengan: Historical, Genius, Thriller; kurang cocok dengan: Action yang hanya mengandalkan otot.

**`subversion` — Subversion / *Subversi***
EN: The story deliberately inverts the tropes it invokes — the chosen one refuses, the villain has a point, the cheat backfires. Promise: surprise for the well-read reader. Implies: genre literacy, expectations set up to be broken, tonal control. Pairs well with: Comedy, any overused trope; poorly with: readers wanting the trope played straight.
ID: Cerita sengaja membalik trope yang dipakainya — sang terpilih menolak, penjahat punya alasan, cheat menjadi bumerang. Janji: kejutan bagi pembaca yang kenyang trope. Mengimplikasikan: literasi genre, ekspektasi yang dibangun untuk dipatahkan, kontrol tonal. Cocok dengan: Comedy, trope apa pun yang terlalu sering dipakai; kurang cocok dengan: pembaca yang ingin trope dimainkan lurus.

---

## 5. Series relations (future field — typed novel-to-novel links)

None of these are genres. Industry standard (NovelUpdates "Related Series") is a
typed link list with reciprocal display.

- **`sequel_of` — Sequel / *Sekuel***: EN: A direct continuation of another novel's story — later timeline, same universe, often same cast. Displayed reciprocally with PREQUEL_OF. / ID: Lanjutan langsung dari cerita novel lain — linimasa kemudian, semesta sama, sering pemeran sama. Ditampilkan timbal balik dengan PREQUEL_OF.
- **`prequel_of` — Prequel / *Prekuel***: EN: A story set before the events of another novel — the same relation viewed from the other direction. / ID: Cerita yang berlatar sebelum peristiwa novel lain — relasi yang sama dilihat dari arah berlawanan.
- **`remake_of` — Remake / *Remake***: EN: A re-telling of another novel — same story, new execution. Often better modeled as a new version of the same novel than a separate work. / ID: Penceritaan ulang novel lain — cerita sama, eksekusi baru. Sering lebih tepat dimodelkan sebagai versi baru dari novel yang sama, bukan karya terpisah.
- **`spinoff_of` — Spinoff / *Spinoff***: EN: A standalone story sharing another novel's universe or side characters — not a direct continuation. / ID: Cerita mandiri yang berbagi semesta atau karakter sampingan novel lain — bukan lanjutan langsung.
- **`side_story_of` — Side Story / *Cerita Sampingan***: EN: A short companion piece to another novel — a side arc, what-if, or interlude. / ID: Karya pendamping pendek untuk novel lain — arc sampingan, what-if, atau interlude.
- **`same_universe` — Same Universe / *Semesta Sama***: EN: Shares a universe with another novel without being its sequel, prequel, or spinoff. / ID: Berbagi semesta dengan novel lain tanpa menjadi sekuel, prekuel, atau spinoff-nya.

---

## 6. Region & setting-style metadata (facets, not taxonomy)

- **Region** — `eastern` / `western`: store-shelf origin/cultural-flavor axis
  (Webnovel "Eastern Books").
- **Setting style** — `northern_setting_style` / `southern_setting_style`:
  regional setting *styles* per Klein (2026-10-06) — "gaya latar novel utara /
  selatan". Not genres, but facets describing the land's flavor.

### `northern_setting_style` — **Northern Setting Style** / *Gaya Latar Utara*
EN: The harsh, cold, martial flavor of northern lands — snow and tundra, iron
and fur, nomadic warriors or stern mountain clans, endurance-as-virtue
cultures, grim survival stakes. Promise: stark beauty and relentless hardness
— warmth is earned, weakness freezes. Implies: winter landscapes,
tribal/clan politics, honor through endurance, sparse cities and vast
wilderness. Pairs well with: Action, Wuxia, Xianxia frontier arcs, Dark;
poorly with: cozy Sweet Slice of Life.
ID: Cita rasa utara yang keras, dingin, dan beladiri — salju dan tundra, besi
dan bulu hewan, prajurit nomaden atau klan gunung yang tegas, budaya yang
menjunjung ketahanan, taruhan survival yang suram. Janji: keindahan yang
tandus dan kekerasan yang tanpa henti — kehangatan harus diperjuangkan,
kelemahan membeku. Mengimplikasikan: lanskap musim dingin, politik
suku/klan, kehormatan lewat ketahanan, kota yang jarang dan belantara yang
luas. Cocok dengan: Action, Wuxia, arc perbatasan Xianxia, Dark; kurang
cocok dengan: Slice of Life manis yang cozy.

### `southern_setting_style` — **Southern Setting Style** / *Gaya Latar Selatan*
EN: The lush, humid, decadent flavor of southern lands — rice paddies and
river deltas, tropical courts, merchant cities and maritime trade, subtle
intrigue over brute force, sensuality and scheming in equal measure. Promise:
abundance with teeth — everything is beautiful and everything is poison.
Implies: court intrigue, trade empires, layered etiquette, heat and water as
setting texture. Pairs well with: Romance, Historical, Strategy, Drama;
poorly with: grim survival realism.
ID: Cita rasa selatan yang subur, lembap, dan dekaden — sawah dan delta
sungai, istana tropis, kota dagang dan perdagangan maritim, intrik halus
daripada kekerasan, sensualitas dan siasat dalam takaran sama. Janji:
kelimpahan yang bergigi — semuanya indah dan semuanya beracun.
Mengimplikasikan: intrik istana, imperium dagang, etiket berlapis, panas dan
air sebagai tekstur latar. Cocok dengan: Romance, Historical, Strategy,
Drama; kurang cocok dengan: realisme survival yang suram.

- **Demographic** — `seinen` (young adult men): Japanese publishing demographic, orthogonal to genre. Whether NovelForge needs a demographic facet at all (with shounen/shoujo/josei) is open question 3.

---

## Decisions by Klein (record — all dated 2026-10-06)

1. **Transmigration is Klein-canonical.** Overrode the platform consensus: Transmigration = *pindah tubuh dan pindah zaman* (body AND era transfer). A soul ripped from its own body into ANOTHER body in ANOTHER era (e.g. murdered in the present, waking 500 years in the past in a young man's body). Anchors the trope's EN+ID descriptions in §4 and `trope-research.md`.
2. **Northern / Southern are regional setting styles.** "Gaya latar novel utara / selatan" — added as `northern_setting_style` / `southern_setting_style` metadata facets in §6 (not genres), with EN+ID descriptions.
3. **The 33 trope items analyzed one by one.** New research file [`trope-research.md`](trope-research.md) judges each item's genre compatibility — verdict: **none promoted** (0 of 32), all stay as trope-layer vocabulary per the research-backed genre/trope split. The frozen genre constant remains the 18 genres below.

## 7. Open questions for Klein

1. **Transmigration gloss correction — RESOLVED 2026-10-06 (Klein's canonical definition).** Klein overrode the platform consensus: in NovelForge's taxonomy, **Transmigration = pindah tubuh DAN pindah zaman** (body AND era transfer) — a soul ripped from its own body into ANOTHER body in ANOTHER era (e.g. murdered in the present, waking 500 years in the past in a young man's body). The platform-consensus reading (soul into another body/world, with "back to the past" being Regression/Rebirth) was rejected in favor of Klein's definition, which now anchors the trope's EN+ID descriptions in §4 and `trope-research.md`.
2. **Northern / Southern — RESOLVED 2026-10-06 (Klein).** They are "gaya latar novel utara / selatan" — regional *setting styles*. Added as `northern_setting_style` / `southern_setting_style` metadata facets in §6 (not genres), with EN+ID descriptions of the implied atmosphere, landscape, and culture.
3. **Demographic facet.** Keep `seinen` (+ shounen/shoujo/josei) as a separate demographic field, or drop demographics entirely for now?
4. **Region flag.** Keep Eastern/Western as novel metadata, or drop the axis?
5. **Trope layer timing.** Recommendation: ship Genre + Tone + Content rating now (the frozen constant), build the 33-item trope vocabulary as a follow-up layer. Or implement both now?
6. **Apocalypse as genre.** Placed as genre because Webnovel shelves it as one; NU treats it as a tag. Confirm, or move to setting trope?
7. **Ecchi placement.** Placed as trope tag (spice descriptor, NU practice). Alternative: a content-rating level between Teen and Mature. Preference?
8. **Tones vs genres.** NU lists Comedy/Drama/Tragedy as genres; this taxonomy makes them a separate tone dimension (structurally cleaner, matches RR's tag practice). Confirm, or prefer NU-style genre listing?
9. **Sweet as tone.** "Sweet/Sweetlove" is a CN-romance marketing label (甜宠). Kept as tone for the romance audience. Confirm it's wanted, or drop?

---

## 8. Research sources

Platform sources consulted (via worker web research, 2026-10-06):

- Royal Road — official "About Genres and Tags" glossary (royalroad.com/forums/thread/29835); tag-definition and recommendation threads (threads 113484, 125347, 132799, 134231, 148172, 150160, 173514, 174196, 176111, 176275, 137225); "What is Progression?" and "Defining something as a LitRPG" discussions.
- NovelUpdates — genre/tag pages (novelupdates.com/stag/game-elements/, /stag/apocalypse/, /stag/evil-protagonist/, /listtag/polygamy/, /listtag/dark, /viewlist/35108, /viewlist/45647); Related Series sections (Survival Strategy, God's Left Hand, KonoSuba: Bakuen, Remake our Life!, High School DxD, Bokutachi no Remake Ver. β); NU Forum threads (xianxia-vs-wuxia 39018, harem 111198/64192, polygamy 137953, overpowered 73019, cheat-is-skill 23910, regression-vs-reincarnation 92431, farming 164829, revenge-as-trope 139322, cleaning-up-tags 3616, R18 rating 61329, prequel-sequel-or-not 60803, trope subversion 78173).
- Webnovel — community Q&A corpus (ask/): genre classification q333338063709245, eastern-vs-western q333004914236426, urban genre q333299576333379, urban cultivation q333321214735446, system novels q332879343084560, cultivation q345716028181548, evolution t348908701269072, rebirth q333398857038894, revenge q332933725985809, cheat t348199831845978, CEO romance q333006957278268, possessive q350530294017246, sweet novels q335838990566415, ecchi q347863694846998, R-rated search, slice-of-life t348199244604531, seven genres q347863458983098, intelligence novels q333038583362616.
- ScribbleHub — unofficial "Genre Explanations" thread (forum.scribblehub.com/threads/genre-explanations-unofficial.3634/); tag pages (cultivation, level-system, evolution, based-on-a-video-game, appearance-changes); tag list (scribblehub.com/list_tags.php); Adult-vs-Mature forum thread 5143; new-user tutorial 13141.
- MyAnimeList forums — "How come isekai is not part of the genre" (topicid=1720138), "Definition of Isekai" (1897644), ecchi discussion (1564962).
- Supplementary: TV Tropes (Urban Fantasy), 1d6chan, S.W. Raine (modern vs urban fantasy), Galaxy Press (high vs epic fantasy), Publishers Weekly "LitRPG Goes Mainstream", Wikipedia (LitRPG, Seinen manga), CBR/LiveAbout (demographics vs genres), Writer's Digest (mystery vs thriller), NamuWiki (KR urban/modern fantasy), TeaNovel (wuxia explainer).
