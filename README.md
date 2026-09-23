# NovelForge AI

> **AI Writing + Narrative Intelligence + Story Simulation + Long-Form Memory + Story Versioning Platform**

**NovelForge AI** adalah platform authoring webnovel berbasis AI yang dirancang untuk membantu penulis merencanakan, menulis, mengembangkan, dan menjaga konsistensi cerita dalam skala sangat panjang—termasuk webnovel dengan **2.000–2.500+ chapter**.

NovelForge tidak dirancang sebagai sekadar *AI text generator*. Platform ini dibangun agar AI dapat bekerja bersama sistem yang memahami **canon, karakter, relationship, timeline, worldbuilding, plot thread, sebab-akibat, perkembangan dunia, ritme cerita, hingga ending**.

> **LLM menulis dan menalar. NovelForge mengingat, memvalidasi, mensimulasikan, mengatur, dan melindungi cerita.**

---

## Project Status

> 🚧 **NovelForge V2 is currently under active development.**

Arsitektur utama telah dirancang dan implementasi dilakukan secara bertahap menggunakan workflow orchestration berbasis coding agents.

Project ini masih dalam tahap pengembangan dan belum ditujukan untuk penggunaan production umum.

---

## Quickstart (Development)

Prasyarat: **Node.js >= 22**, **pnpm 12** (`corepack enable`), dan **Docker** (Docker Desktop/WSL2 di Windows, Docker Engine + Compose plugin di Ubuntu).

```bash
# 1. Install dependencies (semua workspace)
pnpm install --frozen-lockfile

# 2. Salin konfigurasi environment
cp .env.example .env   # sesuaikan bila perlu; default aman untuk dev lokal

# 3. Jalankan infrastruktur (PostgreSQL+pgvector, Redis)
docker compose up -d
# Catatan: jika port 5432 di host sudah terpakai, set POSTGRES_PORT di .env

# 4. Quality gates
pnpm lint
pnpm typecheck
pnpm test

# 5. Jalankan aplikasi
pnpm --filter @novelforge/web dev      # Nuxt web shell
pnpm --filter @novelforge/api start    # Fastify API (/health, /ready)
pnpm --filter @novelforge/worker start # BullMQ heartbeat worker
```

### Verifikasi clean-clone

Skrip verifikasi end-to-end (fresh clone → install → lint → typecheck → test → build semua apps → `docker compose config`):

```powershell
# Windows (PowerShell 7+)
scripts\verify-clone.ps1
```

```bash
# Ubuntu/Linux
scripts/verify-clone.sh
```

Status verifikasi terakhir: **Windows PASSED (2026-09-23)**; **Ubuntu 24.04 PASSED (2026-09-23, via container)** — lihat `docs/implementation/test-matrix.md`.

---

# Why NovelForge?

Model AI dapat menghasilkan prose yang bagus, tetapi webnovel panjang mempunyai masalah yang jauh lebih kompleks.

Setelah ratusan atau ribuan chapter, AI harus mampu memahami hal-hal seperti:

* Apa yang sudah menjadi canon?
* Apa yang diketahui masing-masing karakter?
* Bagaimana hubungan antar karakter berubah?
* Apa saja misteri yang belum terjawab?
* Setup apa yang belum mendapatkan payoff?
* Apakah timeline masih konsisten?
* Apakah teknologi yang muncul masuk akal untuk dunia tersebut?
* Apakah karakter mengingat sesuatu yang seharusnya belum mereka ketahui?
* Apakah konflik mulai terasa berulang?
* Apakah outline masih sesuai dengan perkembangan cerita?
* Apakah cerita sudah siap memasuki endgame?
* Bagaimana melakukan rollback jika perubahan worldbuilding ternyata merusak cerita?

NovelForge dibangun untuk menangani masalah-masalah tersebut secara terstruktur.

---

# Core Philosophy

NovelForge menggunakan beberapa prinsip fundamental.

### Canon is the source of truth

LLM bukan database cerita.

Canon, story state, timeline, relationship, dan informasi penting lainnya disimpan sebagai structured data.

### AI proposes, NovelForge validates

AI dapat mengusulkan:

* canon baru;
* perubahan karakter;
* perkembangan relationship;
* event;
* perubahan world state;
* outline adjustment.

Namun perubahan penting tidak boleh diam-diam menjadi canon tanpa melewati policy dan validation.

### Synopsis is direction, not a permanent script

Synopsis terutama digunakan untuk membentuk arah awal cerita.

Setelah cerita berkembang, keputusan chapter lebih banyak mengikuti:

```text
Author Instruction
        ↓
Current Approved Outline
        ↓
Current Arc / Saga
        ↓
Canon
        ↓
Character / Relationship / World State
        ↓
Timeline
        ↓
Recent Story Memory
        ↓
Relevant Historical Memory
        ↓
Synopsis
```

### Long stories require structured memory

NovelForge tidak mengirim seluruh 2.500 chapter ke model.

Context dibangun secara dinamis berdasarkan kebutuhan generation saat itu.

### Story changes must be recoverable

Perubahan besar pada cerita menggunakan:

```text
Impact Analysis
        ↓
Checkpoint
        ↓
Story Transaction
        ↓
Validation
        ↓
Commit
```

Rollback tidak menghapus history.

---

# Major Systems

NovelForge terdiri dari beberapa intelligence system yang saling bekerja sama.

## Story Intelligence

Mengelola:

* Canon
* Story State
* Timeline
* Story Events
* Story Threads
* Promise / Payoff
* Foreshadowing
* Narrative Debt
* Causal Graph
* Planning Horizon
* Continuity
* Story Health

Tujuannya adalah memahami:

> Apa yang benar, apa yang sedang terjadi, bagaimana kita sampai ke keadaan sekarang, dan apa yang masih belum selesai?

---

## Character Intelligence

Menyimpan perkembangan karakter secara historis.

Contohnya:

```text
Character
├── Identity
├── Goals
├── Motivation
├── Knowledge
├── Beliefs
├── Abilities
├── Reputation
├── Location
├── Possessions
├── Relationships
├── Character Arc
└── Historical State
```

NovelForge juga memiliki **Character Knowledge Boundary** agar karakter tidak mengetahui informasi yang belum pernah mereka dapatkan.

---

## Relationship Intelligence

Relationship tidak dibatasi pada satu `mainLoveInterest`.

NovelForge menggunakan relationship graph untuk mendukung:

* Friendship
* Rivalry
* Romance
* Political Marriage
* Multiple Love Interests
* Harem
* Reverse Harem
* Polygamy
* Polyamory
* Family
* Custom Relationship Structures

Relationship memiliki history dan progression.

```text
HOSTILE
   ↓
RIVAL
   ↓
RELUCTANT RESPECT
   ↓
COOPERATION
   ↓
TRUST
   ↓
ALLY
```

Marriage juga bukan akhir dari relationship arc.

---

## Narrative DNA

Setiap novel memiliki konfigurasi mengenai bagaimana cerita tersebut seharusnya terasa.

Contoh:

```text
Progression:
SLOW → MEDIUM

Protagonist Competence:
VERY HIGH

Drama Density:
LOW

Typical Drama Gap:
~30–50 chapters

Occasional Extended Calm:
~70–140 chapters

Political Complexity:
HIGH

Technology Realism:
HIGH

Romance:
HAREM / POLYGAMY

Ending:
TRIUMPHANT + NOSTALGIC
```

Narrative DNA adalah **soft narrative policy**, bukan script.

---

## Narrative Rhythm

Mengontrol ritme cerita tanpa menjadikannya formula kaku.

Termasuk:

* Drama density
* Drama cooldown
* Calm periods
* Emotional temperature
* Conflict density
* Temporary antagonists
* Enemy-to-ally progression
* Payoff frequency
* Pattern detection
* Conflict scale

Konfigurasi drama tidak berarti NovelForge membuat drama tepat pada interval tertentu. Story state dan causality tetap menentukan apakah drama tersebut masuk akal.

---

## Story Simulation

Untuk novel yang membutuhkan perkembangan dunia secara kompleks.

Modul dapat mencakup:

* Civilization
* Settlements
* Economy
* Technology
* Politics
* Factions
* Reputation
* Information Diffusion
* Historical Divergence
* Conflict / War State

Contohnya:

```text
Better Agriculture
        ↓
Food Surplus
        ↓
Population Growth
        ↓
Migration
        ↓
Specialized Workers
        ↓
Industry
        ↓
Commerce
        ↓
Tax Revenue
        ↓
Infrastructure
```

Tetapi perkembangan juga dapat menimbulkan konsekuensi:

```text
New Industry
        ↓
Old Guild Loses Influence
        ↓
Political Opposition
        ↓
Conflict
```

---

## Technology Intelligence

NovelForge membedakan antara:

```text
Knowing a technology
```

dan:

```text
Being able to build that technology
```

Technology dapat mempunyai dependency:

```text
Knowledge
   ↓
Materials
   ↓
Tools
   ↓
Manufacturing Precision
   ↓
Skills
   ↓
Energy
   ↓
Supply Chain
   ↓
Prototype
   ↓
Iteration
   ↓
Production
   ↓
Adoption
```

---

## Historical Intelligence

Untuk karakter yang kembali ke masa lalu atau mengetahui sejarah masa depan.

NovelForge membedakan:

```text
Original History
```

dengan:

```text
Current History
```

Semakin banyak protagonist mengubah sejarah:

```text
RELIABLE FUTURE KNOWLEDGE
        ↓
PARTIALLY DIVERGED
        ↓
HIGHLY DIVERGED
        ↓
UNRELIABLE
```

---

## Planning Horizon

NovelForge tidak membuat detailed outline untuk 2.500 chapter sekaligus.

```text
Novel Vision
     ↓
Saga
     ↓
Major Arc
     ↓
Mini Arc
     ↓
Chapter Group
     ↓
Chapter
     ↓
Scene
```

Semakin dekat chapter dengan posisi cerita sekarang, semakin detail planning-nya.

---

## Endgame Intelligence

Ending bukan sekadar:

```text
chapter == 2500
```

NovelForge menggunakan:

* Ending Vision
* Ending Conditions
* Resolution Ledger
* Narrative Debt Burn-down
* Character Resolution
* Relationship Resolution
* World Resolution
* Callback Engine
* Legacy
* Epilogue
* After Story

Sebuah cerita selesai ketika perjalanan naratifnya memang siap selesai, bukan hanya karena target chapter tercapai.

---

# Story Versioning & Checkpoints

NovelForge memiliki versioning system khusus cerita.

```text
Story Versioning
│
├── Revisions
├── Change Sets
├── Snapshots
├── Checkpoints
├── Branches
├── Semantic Diff
├── Impact Analysis
├── Restore Preview
├── Selective Restore
└── Recovery Center
```

### Non-destructive rollback

Jika:

```text
Current Revision:
R58

Checkpoint:
R42
```

melakukan restore tidak menghapus R43–R58.

NovelForge membuat revision baru berdasarkan R42 sehingga history tetap tersedia.

---

## Story Branches

Author dapat melakukan eksperimen tanpa mengubah main canon.

```text
MAIN
 │
 ├──────────── MAIN
 │
 └──────────── EXPERIMENT
                 │
                 └── Alternative Story
```

Branch dapat digunakan untuk *What-If*, alternative ending, perubahan worldbuilding, atau eksperimen besar lainnya.

---

# Story Brain

NovelForge dirancang memiliki Story Brain yang dapat menjawab pertanyaan seperti:

> Siapa yang mengetahui identitas asli protagonist?

> Mengapa karakter A membenci karakter B?

> Setup apa yang belum mendapatkan payoff?

> Apakah ada plot hole?

> Apa akibatnya jika event ini dihapus?

> Karakter mana yang sudah lama tidak mendapat perkembangan?

> Kapan relationship tertentu terakhir berkembang?

> Apa penyebab perang ini?

Jawaban seharusnya menggunakan **story evidence**, bukan hanya tebakan model.

---

# AI Architecture

AI request tidak langsung dikirim dari editor ke model.

```text
User
  ↓
Story Intent
  ↓
AI Orchestrator
  ↓
Story Intelligence
  ↓
Context Compiler
  ↓
Workflow
  ↓
Agent
  ↓
Skills
  ↓
Model Manager
  ↓
Gateway Manager
  ↓
OmniRoute
  ↓
LLM
```

Setelah generation:

```text
Generation
    ↓
Validation
    ↓
Continuity Review
    ↓
Lore Review
    ↓
Knowledge Boundary
    ↓
Character Review
    ↓
Relationship Review
    ↓
Outline Alignment
    ↓
Candidate Fact Extraction
    ↓
Canon Proposal
    ↓
Approved Canon
```

---

# OmniRoute

NovelForge menggunakan **OmniRoute** sebagai primary LLM gateway.

Integrasi berada di belakang abstraction:

```text
AI Orchestrator
        ↓
Model Manager
        ↓
Gateway Manager
        ↓
AIGateway
        ↓
OmniRouteGateway
        ↓
OmniRoute
```

Model dipilih melalui **Model Profile** seperti:

```text
CREATIVE_WRITER
DEEP_PLANNER
CONTINUITY_REVIEWER
STRUCTURED_EXTRACTOR
FAST_CLASSIFIER
LONG_CONTEXT_REVIEWER
EMBEDDING
```

---

# Agent Architecture

Agent bukan model.

```text
Agent
=
Role
+ Instructions
+ Skills
+ Context Policy
+ Model Profile
+ Output Schema
+ Validators
```

Contoh agent:

* Story Architect
* Saga Planner
* Arc Planner
* Scene Planner
* Chapter Writer
* Continuity Guardian
* Lore Guardian
* Character Analyst
* Relationship Analyst
* Narrative Rhythm Analyst
* Simulation Analyst
* Canon Extractor
* Endgame Planner
* Story Debugger

---

# Multi-LLM Orchestration

NovelForge dikembangkan dengan workflow yang dirancang agar dapat dikerjakan oleh coding agents seperti Claude, GLM, DeepSeek, Kimi, dan model lain yang kompatibel dengan workflow project.

Setiap task mempunyai kontrak eksplisit:

```text
Task ID
Goal
Required Reading
Dependencies
Allowed Paths
Forbidden Paths
Inputs
Requirements
Invariants
Acceptance Criteria
Tests
Documentation Updates
Out of Scope
```

Project dibangun secara incremental menggunakan task graph, bukan dengan meminta satu agent membangun seluruh sistem sekaligus.

---

# Technology Stack

## Frontend

```text
Nuxt
Vue
TypeScript
Tailwind CSS
```

## Backend

```text
Node.js
TypeScript
Fastify
```

## Data

```text
PostgreSQL
pgvector
```

## Queue & Cache

```text
Redis
BullMQ
```

## AI

```text
AI Orchestrator
Model Manager
Gateway Manager
OmniRoute
```

## Storage

```text
S3-compatible Object Storage
```

## Deployment

```text
Docker
Docker Compose
```

Primary environments:

```text
Windows 11
└── Docker Desktop / WSL2

Ubuntu
└── Docker Engine
```

---

# Architecture

NovelForge dimulai sebagai:

> **Modular Monolith + Background Workers**

```text
apps/
├── web/
├── api/
└── worker/

packages/
├── contracts/
├── database/
├── config/
├── auth/
├── story-core/
├── story-intelligence/
├── character-intelligence/
├── relationship-intelligence/
├── story-simulation/
├── narrative-rhythm/
├── endgame-intelligence/
├── story-versioning/
├── ai-core/
├── retrieval/
├── validation/
└── shared/
```

---

# Database Philosophy

PostgreSQL menjadi canonical source of truth.

```text
PostgreSQL
     ↓
Canonical State
     ↓
Derived Data
├── Embeddings
├── Summaries
├── AI Memory
├── Search Index
└── Cache
```

Derived data dapat dibangun ulang.

Vector database **bukan canon**.

---

# Long-Form Context Management

Untuk novel ribuan chapter:

```text
L0 — Current Generation
L1 — Current Chapter
L2 — Recent Chapters
L3 — Current Arc
L4 — Saga
L5 — Global Novel Memory
L6 — Historical Archive
```

Context Compiler mengambil hanya informasi yang relevan.

---

# Repository Documentation

```text
START-HERE.md

CLAUDE.md
AGENTS.md

docs/
├── 00-product/
├── 01-principles/
├── 02-architecture/
├── 03-domain/
├── 04-data/
├── 05-api/
├── 06-ai/
├── 07-workflows/
├── 08-frontend/
├── 09-security/
├── 10-testing/
├── 11-deployment/
├── 12-roadmap/
├── 13-decisions/
├── 14-progress/
└── 15-operations/
```

Coding agent harus membaca `START-HERE.md` terlebih dahulu.

---

# Development Roadmap

```text
Phase 0  — Repository & Architecture Foundation
Phase 1  — Platform Core
Phase 2  — Writing Core
Phase 3  — AI Infrastructure + OmniRoute
Phase 4  — Agent / Skill / Workflow Platform
Phase 5  — Knowledge & Retrieval
Phase 6  — Story Intelligence
Phase 7  — Planning System
Phase 8  — Character & Relationship Intelligence
Phase 9  — Narrative DNA & Narrative Rhythm
Phase 10 — Story Simulation
Phase 11 — Story Versioning & Recovery
Phase 12 — Endgame Intelligence
Phase 13 — Publishing & Production Hardening
Phase 14 — Advanced Narrative Intelligence
```

Detailed implementation requirements berada di direktori `docs/`.

---

# Development Principles

Setiap feature dianggap selesai hanya jika bagian yang relevan telah memiliki:

* implementation;
* database migration;
* validation;
* authorization;
* error handling;
* tests;
* documentation;
* observability;
* loading/empty/error UI states;
* versioning implications;
* acceptance criteria.

> **A file existing does not mean a feature is complete.**

---

# Current Status

NovelForge V2 saat ini berada dalam tahap aktif pengembangan.

```text
Architecture
↓
Foundation
↓
Platform Core
↓
Writing Core
↓
AI Infrastructure
↓
Narrative Intelligence
```

Arsitektur sengaja dibangun terlebih dahulu agar kemampuan AI yang kompleks tidak tumbuh di atas fondasi data yang tidak konsisten.

---

# Development & Contributions

NovelForge saat ini merupakan **personal development project** yang dikembangkan dan dikelola oleh **ch0c01dxyz**.

External pull requests dan kontribusi kode dari pihak lain **belum dibuka untuk saat ini**.

Repository ini tetap menggunakan issue tracking, commit history, Architecture Decision Records, task contracts, dan dokumentasi development untuk menjaga proses pengembangan tetap terstruktur, terutama karena implementasi NovelForge menggunakan multi-LLM coding orchestration.

Development workflow utama:

```text
Architecture / Specification
        ↓
Task Contract
        ↓
Coding Agent
        ↓
Implementation
        ↓
Tests
        ↓
Independent Review
        ↓
Documentation Update
        ↓
Commit
```

Perubahan arsitektur besar harus terdokumentasi melalui ADR dan tidak boleh dilakukan diam-diam oleh coding agent.

---

# License

Copyright © NovelForge contributors.

Licensed under the **Apache License, Version 2.0**.

Anda dapat menggunakan, memodifikasi, dan mendistribusikan software ini sesuai dengan ketentuan Apache License 2.0.

Lihat file `LICENSE` pada repository untuk teks lisensi lengkap.

---

# Vision

NovelForge dibangun berdasarkan satu gagasan sederhana:

> **AI seharusnya tidak hanya mampu menulis chapter berikutnya. AI harus mampu memahami perjalanan yang membawa cerita sampai ke chapter tersebut.**

Untuk novel yang berlangsung ribuan chapter, kualitas bukan hanya persoalan prose.

Kualitas juga berasal dari:

```text
Memory
+
Continuity
+
Character Growth
+
Relationships
+
Causality
+
World Evolution
+
Planning
+
Payoff
+
Recovery
+
Ending
```

Itulah masalah yang ingin diselesaikan oleh **NovelForge AI**.

---

**NovelForge AI**

*Build worlds. Remember everything. Let stories evolve.*
