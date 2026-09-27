# Workflow: Setup Effect in a New Repo

<required_reading>
1. SKILL.md `<essential_principles>` (version routing)
2. `references/v3-v4-map.md` — if the choice is not obvious
</required_reading>

<process>
## Step 1: Choose the version (ask if unset)

State the choice and the reason to the user before installing.

- **v4** (`pnpm add effect@rc`): current RC; merged platform packages; this skill's examples match it. Prefer for new tools that can take rc churn.
- **v3** (`pnpm add effect`): production-stable, feature-frozen, most older ecosystem guides.

Do not install a version "to get better docs." Match the repo's risk tolerance.

## Step 2: Install

```bash
pnpm add effect@rc          # v4
# or
pnpm add effect             # v3

pnpm add -D @effect/vitest @effect/language-service
```

Monorepo: install `effect` as a **dev dependency at the root** so agents can read `node_modules/effect/src` and `node_modules/effect/AGENTS.md` from anywhere.

v4: every remaining `@effect/*` package must share the **same** version as `effect`.

CLI entrypoints also need `@effect/platform-node` or `@effect/platform-bun` (see `references/cli.md`).

## Step 3: AGENTS.md / CLAUDE.md block

```md
# Learning more about Effect

This repository uses the Effect TypeScript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect APIs and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.
```

(From the official Effect-TS/skills `effect-ts` skill.)

## Step 4: Mechanical guardrails

- `@effect/language-service` in tsconfig plugins (`floatingEffect`, `effectFnImplicitAny`, `genericEffectServices`).
- `@effect/eslint-plugin` with recommended rules — or language-service only if Biome is the linter and no eslint compat layer exists.
- Type discipline as a **gate, not a checklist**: the nullish/cast drift rules (`type-discipline.md`, `<casts>`) are enforceable with type-aware ESLint — `references/static-gate.md` has the proven config. Wire once per repo; CI rejects what review greps used to hunt.

## Step 5: Skeleton conventions

- Errors: `Schema.TaggedErrorClass` (v3: `Schema.TaggedError`) at boundaries; `Data.TaggedError` internal-only.
- Records: `Schema.Struct` + interface; constrained brands for IDs.
- One runtime: entry point builds the Layer; nothing below calls `Effect.provide`.
- Tests: `@effect/vitest` with `it.effect` as default.

## Step 6: Verify

- `pnpm tsc --noEmit` with the language service active.
- One smoke `it.effect` test.
- `node -p "require('effect/package.json').version"` matches the stated choice.
</process>

<success_criteria>
- Installed version matches the deliberate choice (no dist-tag drift)
- AGENTS.md source-discipline block present
- Language service (and lint, if wired) reporting no Effect diagnostics on the smoke test
- Smoke `it.effect` green
</success_criteria>
