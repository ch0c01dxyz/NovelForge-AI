# System Architecture

## Suggested stack

Prefer a modern TypeScript stack unless repository constraints dictate otherwise:
- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Tiptap
- TanStack Query
- Zod
- PostgreSQL
- Prisma or the repository's established ORM
- pgvector
- Redis
- S3-compatible object storage
- secure authentication/session solution
- OpenAI-compatible client abstraction for 9Router

Do not introduce the entire stack blindly. Inspect the repository first and preserve existing working choices.

## Domain boundaries

### Novel domain
Novel metadata, chapters, scenes, characters, world-building, plot, timeline and publishing.

### AI domain
Agents, skills, prompt assembly, model profiles, workflows, generation and evaluation.

### Knowledge domain
Canon, references, documents, chunks, embeddings, facts, retrieval and continuity.

### Gateway domain
9Router instances, models, routing, health, retries and usage.

## AI pipeline

Auth
→ authorization
→ task resolution
→ agent selection
→ skill resolution
→ knowledge retrieval
→ reference retrieval
→ novel context
→ prompt assembly
→ model profile
→ gateway selection
→ 9Router request
→ streaming/response
→ output validation
→ optional review
→ persistence

## Core abstractions

```ts
interface AIGateway {
  id: string;
  generate(request: GatewayGenerationRequest): Promise<GatewayGenerationResponse>;
  stream?(request: GatewayGenerationRequest): AsyncIterable<GatewayStreamEvent>;
  healthCheck(): Promise<GatewayHealth>;
  listModels(): Promise<GatewayModel[]>;
}

interface AIOrchestrator {
  generate(request: AIGenerationRequest): Promise<AIGenerationResult>;
}
```

Equivalent interfaces are acceptable if the repository's architecture uses a different style.

## Provider independence
The application should not know whether a request ultimately reached:
- a 9Router instance,
- another OpenAI-compatible gateway,
- a direct provider,
- a future local model service.

The gateway abstraction owns transport concerns.
The orchestrator owns task/context concerns.
