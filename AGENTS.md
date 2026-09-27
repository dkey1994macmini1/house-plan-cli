# HousePlan CLI

`house-plan` is a deterministic, local-first 2D house-plan geometry and validation CLI for LLM agents. It executes explicit layout decisions; it never generates, optimizes, snaps, or silently repairs a layout.

## Stack and layout

- Node.js 22+, TypeScript 5.9 in strict ESM mode.
- Effect v3, stable `@effect/cli`, `@effect/platform-node`.
- Vitest 3 with `@effect/vitest`; Biome handles formatting and baseline linting.
- `src/` holds production code; `tests/` holds behavior tests; `docs/` holds product decisions.
- Architecture is module-first: a new business capability starts in `src/modules/<module>/`; add only layers needed by active behavior. `src/shared/` is reserved for genuinely stable primitives shared by multiple modules. CLI and filesystem are adapters; runtime composition remains at the entry point.
- `.agents/skills/` contains versioned repo-local operating skills.

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
