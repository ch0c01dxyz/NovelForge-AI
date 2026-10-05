# Trope Research — NF-WF-014 Q3 Follow-up

**Status:** researched 2026-10-06, per Klein's decisions on the genre taxonomy
(`docs/implementation/genre-taxonomy.md`).

**Purpose:** Klein asked that each of the 33 trope items be analyzed one by one
to judge whether it also fits as a **genre** in the frozen code constant
(`Novel.genres`, max 3 per novel). If a trope is genre-compatible, it is
**promoted** to the genre layer with a full entry in the taxonomy doc. If not,
it stays in this file with the reasoning.

**Method:** the verdict for each item uses the platform research from the
taxonomy doc (§8 sources: Webnovel, NovelUpdates, Royal Road, ScribbleHub,
Wattpad, MAL) — what real platforms classify as *genres* (broad, stable,
rankings-grade story types that carry a novel's identity) vs *tags/tropes*
(fine-grained story mechanics that stack on top of genres). A candidate is
promoted only if it passes the genre test: it must be a broad story type, not
a mechanic, premise, archetype, descriptor, or setting flavor.

**Count note:** the taxonomy doc's trope layer contains 32 distinct entries
("33" in the summary is a miscount — System Cheat was dropped as a duplicate
of System ∩ Cheat, Invincible was absorbed into Overpowered, Fighting was
dropped into Action). All 32 are analyzed below.

**Transmigration definition:** per Klein's canonical definition (2026-10-06):
Transmigration = *pindah tubuh DAN pindah zaman* (body AND era transfer). A soul
is ripped from its own body and placed into ANOTHER body in ANOTHER era —
e.g. someone murdered in the present wakes up 500 years in the past in a young
man's body. This overrides the platform consensus noted in the original
taxonomy (that "reincarnation into the past" is not transmigration).

---

## Item-by-item verdicts

### Power & progression

**1. `weak_to_strong` — Weak to Strong / *Lemah ke Kuat***
EN: The protagonist starts at the very bottom and climbs to the peak through
effort, cheats, or systems — the classic ascent arc.
Verdict: **NO — keep as trope.** It is a *progression curve*, a shape that
applies to any genre (Xianxia, Fantasy, LitRPG, Wuxia all use it). A genre must
describe what kind of story it is; this describes how power changes. No
platform lists it as a genre.

**2. `overpowered` — Overpowered / *Terlalu Kuat***
EN: The protagonist is disproportionately strong from early on; the fun is HOW
they win, not IF. Absorbs Invincible as its extreme setting.
Verdict: **NO — keep as trope.** It is a *power-level setting* relative to the
world's balance, orthogonal to story type (an OP hero works in Fantasy, Sci-Fi,
Romance-comedy alike). Tags everywhere; genres nowhere.

**3. `genius` — Genius / *Jenius***
EN: The protagonist wins through intellect, talent, or scheming rather than
raw power.
Verdict: **NO — keep as trope.** A *character attribute*, not a story type.
"Genius" tells you about the hero, not about the world, conflict, or stakes.

**4. `cheat` — Cheat / *Cheat***
EN: The protagonist holds an unfair, story-breaking advantage — a "golden
finger": unique skill, item, talent, or future knowledge.
Verdict: **NO — keep as trope.** A *power-source mechanic*; it modifies how the
hero grows but says nothing about the story's world or genre. Never a
platform genre.

**5. `system` — System / *Sistem***
EN: The protagonist is bound to a mysterious program-like entity that issues
quests, grants abilities, and upgrades over time.
Verdict: **NO — keep as trope.** A *narrative device* (the gamified-life
interface), not a story type — System stories span Apocalypse, Urban Fantasy,
Xianxia, and Romance. LitRPG is the genre home for the quantified variant.

**6. `level_up` — Level-up / *Naik Level***
EN: Power growth is numeric and visible — EXP, levels, stats, skills, status
screens.
Verdict: **NO — keep as trope.** A *progression rendering style* (numbers going
up). The genre that carries it is LitRPG; the mechanic alone does not define a
story type.

**7. `evolution` — Evolution / *Evolusi***
EN: Power growth through biological transformation — devouring, adapting,
mutating into new forms and species.
Verdict: **NO — keep as trope.** A *transformation mechanic*, usually with a
monster lead. Too narrow and mechanic-specific to anchor discovery as a genre;
works inside Horror, Apocalypse, or Action.

**8. `cultivation_mechanic` — Cultivation / *Kultivasi***
EN: Power comes from disciplined training — meditation, techniques, pills,
tribulations — climbing hierarchical realms.
Verdict: **NO — keep as trope.** A *power mechanic* whose genre home is
Xianxia (it can also live in Wuxia or Urban Fantasy). The genre/trope split
here is deliberate: Xianxia names the world; Cultivation names how power
works in it.

**9. `magic_system` — Magic System / *Sistem Sihir***
EN: Magic follows explicit rules the reader can learn — costs, limits, schools,
interactions.
Verdict: **NO — keep as trope.** A *worldbuilding mechanic* (hard vs soft
magic). Royal Road's own taxonomy demotes it to tag status. It flavors a
Fantasy story; it is not the story.

**10. `superpowers` — Superpowers / *Kekuatan Super***
EN: Characters wield extraordinary innate abilities — awakenings, mutations,
powers as a fact of the world.
Verdict: **NO — keep as trope.** An NU *tag*, never a genre. It is a
character-capability premise that crosses Action, Urban Fantasy, and Sci-Fi;
it does not itself define a story type.

### Second chance

**11. `rebirth` — Rebirth / *Terlahir Kembali***
EN: The protagonist dies and is reborn as their younger self in the SAME life,
keeping memories (Klein-compatible Chinese second-chance trope).
Verdict: **NO — keep as trope.** A *time-structure mechanic* (do-over of the
same life). Rebirth spans Xianxia, Romance, and Revenge tales — the mechanic
is the engine, the genre is the world.

**12. `reincarnation` — Reincarnation / *Reinkarnasi***
EN: The protagonist dies and begins a NEW life as a different person — often a
baby in a new world — with memories intact or returning.
Verdict: **NO — keep as trope.** A *premise mechanic* (new life, old soul).
It launches stories in any genre; it is not itself the story type.

**13. `transmigration` — Transmigration / *Transmigrasi* (Klein canonical)**
EN: The protagonist's soul is ripped from their own body and placed into
ANOTHER body in ANOTHER era — body AND time transfer together. The classic
case: a modern man murdered today wakes up five hundred years in the past
inside a young man's body, carrying future memories into someone else's life
and obligations.
Verdict: **NO — keep as trope.** A *dislocation premise* (whose body, whose
age, whose obligations). Under Klein's own definition it is a precise story
*engine* — maximum dislocation as the inciting incident — but it still rides
inside Historical, Romance, Fantasy, or Mystery rather than defining a story
type of its own. No platform genres it; keeping it a trope preserves its
precision.
ID: Jiwa protagonis dicabut dari tubuhnya sendiri dan ditempatkan ke tubuh
LAIN di zaman LAIN — pindah tubuh dan pindah zaman bersamaan. Kasus klasik:
seorang pria modern yang terbunuh hari ini terbangun lima ratus tahun di masa
lalu di dalam tubuh seorang pemuda, membawa ingatan masa depannya ke dalam
hidup dan kewajiban orang lain. Ini adalah mesin cerita yang presisi, bukan
genre — ia hidup di dalam Historical, Romance, Fantasy, atau Mystery.

**14. `regression` — Regression / *Regresi***
EN: Time itself rewinds: the protagonist returns to an earlier point of the
SAME adult life with future knowledge — the Korean tower/hunter signature.
Verdict: **NO — keep as trope.** A *time-structure mechanic* (knowledge-as-
cheat replay). It powers Apocalypse, Action, and Revenge stories but is not a
story type itself.

### Drive

**15. `revenge` — Revenge / *Dendam***
EN: The protagonist's driving goal is settling a score — betrayal, murder,
ruin answered in kind.
Verdict: **NO — keep as trope.** A *motivation*, not a story type. Revenge is
the fuel; the vehicle is Action, Tragedy, or Wuxia. Tags everywhere; genres
nowhere.

### Profession

**16. `farming` — Farming / *Bertani***
EN: The core activity is agriculture — planting, harvesting, raising beasts —
with progression measured in farm output.
Verdict: **NO — keep as trope.** A *profession/activity mechanic* and mood
engine (cozy slow-life). Too specific an activity to serve as a
rankings-grade genre; it flavors Slice of Life or Apocalypse stories.

**17. `blacksmith` — Blacksmith / *Pandai Besi***
EN: The protagonist's power identity is forging — weapons, artifacts, gear —
a "production class" hero.
Verdict: **NO — keep as trope.** A *profession identity*. Even narrower than
Farming; it works inside Fantasy and LitRPG but cannot carry discovery alone.

### Relationships

**18. `harem` — Harem / *Harem***
EN: Multiple simultaneous love interests orbit one protagonist (absorbs
Polygamy as the committed "True Harem" variant).
Verdict: **NO — keep as trope.** A *relationship structure*. It modifies
Romance or Fantasy stories; it is not itself the kind of story. NU lists it
as a tag, never a genre.

**19. `possessive` — Possessive / *Posesif***
EN: A love interest who is intensely jealous, territorial, and "claiming" —
obsession framed as deep love.
Verdict: **NO — keep as trope.** A *relationship descriptor* (a character
trait of the love interest). Far below genre granularity.

**20. `ceo` — CEO / *CEO***
EN: Modern urban romance around a rich, powerful company president and a
Cinderella-like heroine.
Verdict: **NO — keep as trope.** A *premise package* (rich-boss urban romance)
within Romance. It is a sub-pattern of Romance, not a sibling of it.

**21. `beauty` — Beauty / *Kecantikan***
EN: Physical attractiveness as a story feature — a stunning lead whose looks
drive the premise.
Verdict: **NO — keep as trope.** A *character descriptor*. It says nothing
about world, conflict, or story type.

**22. `ecchi` — Ecchi / *Ecchi***
EN: Sexual fanservice without explicit sex — suggestive situations, teasing,
titillation.
Verdict: **NO — keep as trope (genre axis).** A *spice descriptor* ("not
exactly a genre, it's a tag" — MAL). Whether it belongs as a rating level is
the taxonomy's open question 7; as a genre it fails regardless — it describes
content heat, not story type.

### Premise & setting

**23. `isekai` — Isekai / *Isekai***
EN: The protagonist is transported to, reincarnated in, or trapped inside
another world and must adapt to its rules.
Verdict: **NO — keep as trope.** A *setting premise*. Community consensus
(MAL, NU, RR): pairable with any genre (Fantasy, LitRPG, Romance), never a
genre axis. Promoting it would double-count every story it touches.

**24. `academy` — Academy / *Akademi***
EN: Much of the story unfolds at a school or training institution for powered
youths.
Verdict: **NO — keep as trope.** A *setting*. It hosts Progression Fantasy,
Romance, and Action stories; the setting is not the story type.

**25. `arena` — Arena / *Arena***
EN: Organized combat contests — tournaments, gladiatorial bouts, death games —
as the story's engine.
Verdict: **NO — keep as trope.** A *setting/event structure*. It powers
Action and LitRPG arcs but does not define a story type.

**26. `video_game` — Video Game / *Video Game***
EN: The story is set inside or around an actual video game — VRMMO, esports,
game world.
Verdict: **NO — keep as trope.** A *setting*. LitRPG is the genre that owns
the gamified-fiction space; Video Game names where the story happens.

**27. `urban_setting` — Urban Setting / *Latar Urban***
EN: The story lives in the modern city — its streets, businesses, nightlife,
institutions.
Verdict: **NO — keep as trope.** A *setting flavor*. Urban Fantasy is the
genre; Urban Setting is the flavor it shares with Romance, Mystery, and CEO
stories.

**28. `medieval_setting` — Medieval Setting / *Latar Medieval***
EN: Swords, castles, knights, feudal politics — the pre-modern aesthetic.
Verdict: **NO — keep as trope.** A *setting flavor*, the pre-modern pole
opposite Urban Setting. High Fantasy is the genre home.

### Character

**29. `anti_hero` — Anti-Hero / *Anti-Hero***
EN: The protagonist lacks traditional heroic traits — cynical, amoral,
ruthless — yet remains the sympathetic focus.
Verdict: **NO — keep as trope.** A *protagonist archetype*. It describes who
carries the story, not what kind of story it is.

**30. `demons` — Demons / *Iblis***
EN: Demons/devils as a story element — a race, a faction, or the protagonist's
nature.
Verdict: **NO — keep as trope.** A *race/faction element*. It enriches Dark
Fantasy, Horror, and Action but does not itself name a story type.

### Meta

**31. `strategy` — Strategy / *Strategi***
EN: Winning through scheming — military tactics, court intrigue, business
warfare, battle of wits.
Verdict: **NO — keep as trope.** A *victory method*. It describes how
conflicts resolve, orthogonal to genre (Historical, Thriller, and LitRPG all
use it).

**32. `subversion` — Subversion / *Subversi***
EN: The story deliberately inverts the tropes it invokes.
Verdict: **NO — keep as trope.** A *narrative technique*. It is meta-commentary
on tropes, not a story type — it cannot even exist without a genre beneath it.

---

## Summary

| Item | Genre-fit | Reason in one line |
|---|---|---|
| weak_to_strong | NO | progression curve, not a story type |
| overpowered | NO | power-level setting, orthogonal to genre |
| genius | NO | character attribute |
| cheat | NO | power-source mechanic |
| system | NO | narrative device, spans genres |
| level_up | NO | progression rendering style (LitRPG owns the genre) |
| evolution | NO | transformation mechanic |
| cultivation_mechanic | NO | mechanic; Xianxia is the genre home |
| magic_system | NO | worldbuilding mechanic (RR demotes to tag) |
| superpowers | NO | character-capability premise |
| rebirth | NO | time-structure mechanic |
| reincarnation | NO | premise mechanic |
| transmigration | NO | dislocation premise/engine (Klein canonical) |
| regression | NO | time-structure mechanic |
| revenge | NO | motivation, not story type |
| farming | NO | profession/activity mechanic |
| blacksmith | NO | profession identity |
| harem | NO | relationship structure |
| possessive | NO | relationship descriptor |
| ceo | NO | premise package inside Romance |
| beauty | NO | character descriptor |
| ecchi | NO | spice descriptor (rating Q is separate) |
| isekai | NO | setting premise, pairable with any genre |
| academy | NO | setting |
| arena | NO | setting/event structure |
| video_game | NO | setting (LitRPG owns the gamified genre) |
| urban_setting | NO | setting flavor (Urban Fantasy is the genre) |
| medieval_setting | NO | setting flavor (High Fantasy is the genre home) |
| anti_hero | NO | protagonist archetype |
| demons | NO | race/faction element |
| strategy | NO | victory method |
| subversion | NO | narrative technique, needs a genre beneath it |

**Promotions to genre: none (0 of 32).** The verdicts confirm the taxonomy's
research-backed genre/trope split rather than weakening it: every item is a
mechanic, premise, setting, archetype, descriptor, or drive that *stacks on
top of* genres on every surveyed platform. Promoting any of them would
recreate Wattpad's flat folksonomy — the anti-pattern the taxonomy was
designed against. The frozen genre constant stays at the 18 recommended
genres; the trope layer ships as a follow-up vocabulary per the taxonomy
doc's §0 recommendation.
