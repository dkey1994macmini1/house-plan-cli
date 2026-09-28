# HousePlan CLI

`house-plan` is a deterministic, local-first 2D house-plan geometry and validation CLI for LLM agents. It executes explicit layout decisions; it never generates, optimizes, snaps, or silently repairs a layout.

## Stack and layout

- Node.js 22+, TypeScript 5.9 in strict ESM mode.
- Effect v3, stable `@effect/cli`, `@effect/platform-node`.
- Vitest 3 with `@effect/vitest`; Biome handles formatting and baseline linting.
- `src/` holds production code; `tests/` holds behavior tests; `docs/` holds product decisions.
- Architecture is module-first: a new business capability starts in `src/modules/<module>/`; add only layers needed by active behavior. `src/shared/` is reserved for genuinely stable primitives shared by multiple modules. CLI and filesystem are adapters; runtime composition remains at the entry point.
- `.agents/skills/` contains versioned repo-local operating skills.

## Domain modelling and readability

- Do not build anemic domain models. A domain object owns the data **and the business behavior/invariants that operate on it**. For example, `WallSegment` owns length, orthogonality and opening-host behavior; `StairOccurrence` owns its pairing/void-containment behavior. JSON is a DTO at the CLI and persistence boundary, not the primary internal programming model.
- Keep domain objects small and cohesive: one business concept, one reason to change, explicit constructor/factory validation, and public behavior named in domain terms. Do not turn `Plan` into a god object or use classes as namespaces for unrelated helpers.
- Low-level, representation-agnostic coordinate maths may live in narrowly scoped geometry primitives. Domain rules must not be hidden in generic `utils`, free-standing procedural helper chains, or CLI handlers.
- Extract a fragment into a method as soon as understanding it requires studying its implementation. Name the method after **what** it achieves (`openingFitsHostWall`, `stairRunHasValidCounterpart`), never after mechanics (`checkData`, `process`, `handle`, `doThing`). A caller should read as a business narrative.
- Keep methods at one abstraction level. A method coordinates named domain behaviors or implements one focused calculation, never both. Prefer guard clauses and intermediate domain-named values over dense boolean expressions, nested conditionals, non-null assertions or clever one-liners.
- Method granularity is earned by clarity: do not split a one-line obvious expression merely to increase file count, but split every multi-step decision, rule, conversion or rendering intent into a named method with a testable meaning.
- Tests exercise public domain behavior, engine behavior and CLI process behavior. Do not expose mutable fields or test-only APIs just to test implementation details.

## Run and verify

- `pnpm build` — compile production source.
- `pnpm lint` — Biome check.
- `pnpm typecheck` — strict TypeScript check.
- `pnpm test` — Vitest single run.
- `pnpm check` — required local completion gate.

Done means the changed behavior has behavior-level tests, `pnpm check` passes, and public CLI changes update the matching repo-local skill and documentation.

## Constraints

- Public plan JSON uses centimetres in steps of 0.1 cm; geometry kernel uses integer millimetres internally.
- Default output is machine-readable JSON. stdout is results only; failures write one structured envelope to stderr.
- Mutations require `expectedRevision`, are transactional, and never silently correct authored geometry.
- Do not add 3D/BIM, legal-compliance claims, auto-layout, or general polygon geometry without a new specification decision.
- Do not edit `.scratch/`; it contains local planning artifacts and is intentionally ignored.

## Read when relevant

- `.agents/skills/effect-ts-dk/SKILL.md` — before writing, reviewing or debugging Effect. Resolve the installed version first; this project uses v3, so use its v3 mapping, `node_modules/effect/README.md`, and relevant installed `node_modules/effect/src/` source as the API authority.
- `.agents/skills/create-cli-dk/SKILL.md` — before changing commands, flags, envelopes, exit codes, stdin, help or write semantics.
- `.agents/skills/modular-monolith-architecture/SKILL.md` — before creating or changing module boundaries, shared primitives, adapters or runtime composition.
- `docs/specs/2026-09-28-house-plan-cli-mvp.md` — product model, scope and acceptance criteria.
- `docs/research/2026-09-28-2d-floorplan-tools.md` — researched CAD and floor-plan domain patterns.
