---
name: effect-ts-dk
description: Use when writing, reviewing, debugging, or setting up Effect TypeScript — services, layers, typed errors, Schema, Option/Result, tagged ADTs and exhaustive Match, Cache, Stream, CLI, HttpClient, testing — or wiring Effect at Hono, Drizzle, or Zod boundaries, including work that spans Effect v3 and v4.
---

<objective>
Write Effect that keeps types honest: `A` / `E` / `R` on computations, `Option` / `Result` / tagged ADTs + exhaustive `Match` on data (the TypeScript stand-in for Scala `Option` / `Either` / `sealed trait` / `match`). Examples are Effect v4. If the installed package is v3, translate via `references/v3-v4-map.md` before copying.
</objective>

<essential_principles>
## Version (READ FIRST)

1. Resolve the installed version: `node -p "require('effect/package.json').version"` in the target workspace.
2. **Write for that version.** This skill's snippets are v4 (`Context.Service`, `Result`, `Schema.TaggedErrorClass`, `Schema.decodeUnknownEffect`). On v3, do not paste them — map first.
3. Authoritative source = the **installed package**, not this skill, blogs, or memory. Read `node_modules/effect/AGENTS.md` (ships with effect ≥3.19) and grep installed `src/` when a signature is uncertain.
4. `pipe` exists in both versions. `ServiceMap.Service` is not the v4 service API — use `Context.Service`.

## Types Are The Feature

Domain code uses Effect data types the way Scala uses `Option` / `Either` / `sealed trait`. Details: `references/type-discipline.md`.

- **Absence** → `Option<A>`. No `null` / `undefined` / `!` inward of a Schema boundary.
- **Every raw-edge producer converts at creation**: parser output, regex match, DB row, env var, third-party JSON — each one maps nullish → `Option` right where the value is born (Schema decode / Option-returning helper), in one place per shape. Domain concept = ONE canonical type; module-local near-copies that re-introduce `| null` / `| undefined` are a defect, not a DTO.
- **Pure success/failure** → `Result<A, E>` (v3: `Either<E, A>`). Not a boolean, not `throw`.
- **Closed variants** → `Data.TaggedEnum` (internal) or `Schema.TaggedUnion` (wire). Not `kind: string`.
- **Dispatch** → `Match.valueTags` / `$match` / `Match.exhaustive`. `switch`/`default` on `_tag` is a silent miss.
- Option / Result are **data**, not fallible computations — those are `Effect<A, E, R>`.
- Never `as any`, `as never`, or double-assertion to silence an Effect type error. The error is the diagnosis: fix the service, error, or layer.
- Expected Effect failures live in `E` as tagged domain types. Recover with `catchTag` / `catchTags`. `catchAll` / `catchAllCause` only at a deliberate boundary.
- Untrusted input is `unknown` until `Schema.decodeUnknownEffect`. Do not `z.infer` across an Effect boundary.

## Effect Idioms (v4 names)

- Compose with `Effect.gen`. Attach retry / logging / spans via `.pipe` or extra `Effect.fn` arguments. Gen for logic, pipe for instrumentation.
- `Effect.fn("Domain.operation")` for reusable effectful functions. Raw `Effect.gen` for one-off programs. Reusable `() => Effect.gen(...)` is the anti-pattern — that wrapper is `Effect.fn`.
- Never `throw` inside `Effect.gen` — `try/catch` does not catch yielded failures. Wrap foreign throwing code with `Effect.try` / `Effect.tryPromise` and **preserve `cause`**.
- Always `return yield*` on failure/interruption branches so the error lands in `E` and control-flow narrows.
- No point-free style (`Effect.map((x) => fn(x))`, not `Effect.map(fn)`) — overloads erase types.
- Entry: `NodeRuntime.runMain` / `BunRuntime.runMain`, not bare `Effect.runPromise`.
- Cap concurrency (`{ concurrency: N }`); never `"unbounded"` on untrusted-size input.
- Time: `Clock` / `DateTime` + `TestClock` in `it.effect`. Never `Date.now()` / `DateTime.unsafeNow` inside Effect. `crypto.randomUUID()` is `Effect.sync`.
- Schema: DTO → `Schema.Struct` + same-name `interface`; equality/methods → `Schema.Class`; IDs → constrained brands; errors → `Schema.TaggedErrorClass`. Internal control-flow algebras → `Data.TaggedEnum`, not a Schema.
- Services: yield deps once in `Layer.effect`'s gen, close over them. Methods return `Effect<A, E>` with `R = never`. One Layer/runtime at the entry point — never per request.
</essential_principles>

<intake>
**Determine the task (ask only if genuinely ambiguous):**

1. Writing or reviewing core Effect (services, layers, errors, Schema, Cache, Stream, CLI, HttpClient, tests)
2. Debugging an Effect type error, missing context, defect, or flaky Effect test
3. Wiring Effect at stack boundaries (Hono, Drizzle, Zod/Standard Schema)
4. Setting up Effect in a new repo
5. Migrating Effect v3 → v4
</intake>

<routing>
| Response | Workflow |
|----------|----------|
| 1, "write", "review", "service", "layer", "error", "schema", "test", "stream", "cache", "cli", "http", "fetch", "option", "match", "either", "result" | `workflows/write-review.md` |
| 2, "debug", "type error", "missing context", "defect" | `workflows/debug.md` |
| 3, "hono", "drizzle", "zod", "boundary", "stack" | `workflows/stack-boundaries.md` |
| 4, "setup", "new repo" | `workflows/setup.md` |
| 5, "migrate", "v4", "upgrade" | Official skill: `npx skills add Effect-TS/skills` → `effect-v3-to-v4`. Never read `migration/v3-to-v4.md` whole — `rg` it. |

Do not load this skill's full reference set merely because a file imports `effect`. After routing, follow that workflow exactly.
</routing>

<quick_start>
v4 names. On v3, translate via `references/v3-v4-map.md`.

- Service: `Context.Service` + `Layer.effect` + `Service.of`. (v3 app: `Effect.Service` / `.Default`; v3 library: `Context.Tag`)
- Layer: `succeed` pure / `effect` effectful / `scoped` with finalizers / `unwrap` when an Effect chooses the layer
- Composition: `Layer.provide` (dep hidden) vs `provideMerge` (dep satisfied AND exported) vs `mergeAll` (independent, both exported). `Effect<A, E, S> not assignable to Effect<A, E, never>` → unsatisfied `R`, not a cast.
- Parse untrusted data: `Schema.decodeUnknownEffect`. Trusted: `schema.make`. Failure in `E`: `schema.makeEffect`. Raw→branded outside an Effect (row mappers, parsers, tests): `Schema.decodeUnknownOption` / `decodeUnknownSync` — the only road into a brand, never `as Brand`.
- Absence / pure fail / sealed variants: `Option` / `Result` / `Data.TaggedEnum` + exhaustive `Match` — `references/type-discipline.md`
- Config: `Config.schema` / `Config.redacted` — never `process.env` in logic
- Retry: bounded `Schedule`; retry only idempotent operations
- Cache: `Cache.make` / `makeWith` in the owning layer — never a hand-rolled Map+TTL
- Stream: pull + backpressure; `paginate` for pages; `forkScoped` consumers in layers; not a substitute for `Effect.repeat`
- CLI: `effect/unstable/cli` `Command.make` + `NodeRuntime.runMain` / `BunRuntime.runMain`; thin handler, fat service
- Outgoing HTTP: `effect/unstable/http` `HttpClient` in an adapter layer; Schema-decode bodies; `retryTransient` only if idempotent
- Concurrency: `Effect.all` with explicit `N`
- Time-sensitive test: `it.effect` + `TestClock`; `it.live` only when wall-clock is the subject

**Wire once per repo:** `Effect-TS/language-service` (floatingEffect, effectFnImplicitAny, genericEffectServices) and `@effect/eslint-plugin`. Make the type discipline itself a CI gate with **type-aware ESLint** (`no-unnecessary-condition` for dead/nullish conditions, `no-restricted-syntax` ban on `as`-casts with named library-gap escape hatches): `references/static-gate.md`. Official GitHub: `Effect-TS/skills`.
</quick_start>

<reference_index>
All in `references/`:

- `core-gotchas.md` — LLM traps: try/catch vs yield, discarded Effects, defects, layers, fibers
- `static-gate.md` — type-aware ESLint config that makes the type discipline a CI gate (nullish/cast drift, named escape hatches)
- `v3-v4-map.md` — concept map when the installed version is v3 or docs mix eras
- `schema-decision.md` — Struct vs Class vs TaggedUnion vs brands; decode vs make
- `type-discipline.md` — `Option` / `Result` / sealed tagged unions / exhaustive `Match`; `unknown`; brands; why casts fail
- `services-layers.md` — tags, capture-at-construction, provide vs provideMerge, `Effect.fn`
- `testing.md` — `@effect/vitest`, TestClock, fakes, ConfigProvider
- `caching.md` — `Cache` / `Effect.cached` / when RequestResolver is worth it
- `streams.md` — Stream sources, backpressure, pagination, layer consumers
- `cli.md` — `effect/unstable/cli` commands, args/flags, process entry
- `http-clients.md` — outgoing `HttpClient`, schema bodies, retries; raw `fetch` only as an adapter exception
</reference_index>

<workflows_index>
| Workflow | Purpose |
|----------|---------|
| `workflows/write-review.md` | Implement or review services, layers, Schema, Cache, Stream, CLI, HttpClient, tests |
| `workflows/debug.md` | Diagnose Effect type/runtime failures without erasing channels |
| `workflows/stack-boundaries.md` | Hono / Drizzle / Zod without breaking typed channels |
| `workflows/setup.md` | Install + configure Effect (version chosen deliberately) |
</workflows_index>

<success_criteria>
- Installed version resolved; v4 snippets translated if the repo is v3
- API facts verified against installed source when uncertain
- `E` and `R` preserved (no silent `catchAll`, no swallowed defects, no `as any`)
- Domain data uses `Option` / `Result` / tagged ADTs + exhaustive `Match` (no `null`, no `switch`/`default` on `_tag`)
- Runtime provided once at entry; deps captured at layer construction
- Boundary code follows `workflows/stack-boundaries.md`
- Narrowest typecheck/test covering the changed semantics passes
</success_criteria>
