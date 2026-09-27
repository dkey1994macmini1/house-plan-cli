# Static Analysis Gate for Effect Type Discipline

The rule tables in `type-discipline.md` (`<channels>`, `<casts>`, `<brands>`, Drift watch) are machine-checkable. Wire them once per repo so CI rejects drift instead of relying on review greps. Battle-tested config: `dealwatch` (`eslint.config.mjs` on `chore/static-analysis-gate`).

## Why type-aware (and what it costs)

`no-unnecessary-condition` needs the TypeScript type checker — `parserOptions.projectService: true`. This makes the lint pass slower (~2s on a small repo, more on big ones) and occasionally flags *defensive* conditions that TS proves impossible. Both are fine: keep it loud on `src/`, downgrade to `warn` on `tests/` if it nags. Biome stays as formatter — the ESLint layer is semantic, format stays cheap.

## The ruleset (type-aware)

```js
// eslint.config.mjs — flat config
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.strictTypeChecked,   // no-unnecessary-condition lives here
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "error", // dead conditions, dead defaults (`?? x` on fully-keyed Records)
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      {
        // 'as' casts: only with an inline justifying comment
        "no-restricted-syntax": ["error",
          {
            selector: "TSAsExpression:not(:has(TSTypeOperator)),TSTypeAssertion",
            message: "'as' cast — usuń go przez dopasowanie typów (Schema decode na krawędzi / narrowing). Wyjątek wymaga eslint-disable z nazwą luki biblioteki",
          },
        ],
      },
      // effect/no-import-from-barrel-package (@effect/eslint-plugin)
    },
  },
)
```

Note `:not(:has(TSTypeOperator))` keeps `as const` legal if your selector needs it; `strictTypeChecked` also pulls `no-explicit-any` / `no-unsafe-*`.

## The escape hatch (this is the important part)

An absolute rule dies on real library gaps and becomes noise, so every suppression must name the gap:

```ts
// eslint-disable-next-line no-restricted-syntax -- effect/unstable/cli runWith nie eksponuje kanału E w typach (brak generyka)
const exit = effectUnstableCliRun(cmd) as Effect.Effect<void, CliError>;
```

Convention: `-- <library gap in one line>`. A disable without the gap named fails review; a cast *without* a disable fails CI. Symmetric rule: **suppress only library gaps, never your own types** — if a cast is needed to bridge your own modules, the producer is mis-typed, fix the types upstream (`type-discipline.md` `<casts>`). This matches rule-based gates like typed exits: prefer types that make the mistake unrepresentable (`Record<CliError["_tag"], number>` over `as keyof` + `?? fallback`) — adding a variant without its mapping is then a compile error, not a lint finding.

## What the gate caught in practice (dealwatch, 2026-08-29)

First run surfaced 36 violations, all real, all fixed rather than suppressed:

- dead `?? 1` fallback behind a `Record` with complete keys — `no-unnecessary-condition`
- a filter condition that was provably always-true on the value's path — same rule
- `JSON.parse(...) as unknown`, better-sqlite3 `row as WatchRow` casts → typed via `: unknown` annotation and `prepare<Params, Row>()` generics (check your `@types/*` for generics before suppressing — many casts only paper over an un-parameterized call)
- `Deal | null` in a parser signature → `Option<Deal>`; producer re-typed instead of cast at consumption
- test factories building branded values with `as Brand` → moved to Schema decode helpers (`tests/helpers/brands.ts` via `Schema.decodeUnknownSync`)
- one shared helper for `Cause.findErrorOption`'s `Option<unknown>` gap, one suppress-comment, imported by tests

## Setup checklist

```bash
pnpm add -D eslint typescript-eslint eslint-plugin-*   # + @effect/eslint-plugin if not present
```

1. `eslint.config.mjs`: `tseslint.configs.strictTypeChecked` (or `recommendedTypeChecked`), `projectService: true`, the `no-restricted-syntax` cast ban above.
2. Add a script next to the fast linter: `"lint:effect": "eslint src tests"` (Biome stays formatter).
3. Fix the backlog once — expect casts to evaporate via generics/`: unknown` annotation/`Option` producers; suppress the rest with named library gaps.
4. Gate on CI or on the local `Done` chain together with typecheck + tests.
5. Optional repo-level `AGENTS.md` note: `Done = lint + lint:effect + typecheck + tests`.