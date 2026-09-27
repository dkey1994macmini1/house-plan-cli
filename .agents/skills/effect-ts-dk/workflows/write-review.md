# Workflow: Write or Review Core Effect

<required_reading>
**Read these NOW (skip a file only if the task cannot touch that surface):**

1. SKILL.md `<essential_principles>`
2. `references/services-layers.md`
3. `references/schema-decision.md`
4. `references/type-discipline.md`
5. `references/core-gotchas.md`
6. `references/testing.md` — when adding or changing tests
7. `references/v3-v4-map.md` — **required on v3**; on v4 only if a symbol looks like the other era
8. `references/caching.md` — memoize, TTL, in-flight dedupe, batch resolvers
9. `references/streams.md` — Stream, Queue, PubSub, pagination, long-lived consumers
10. `references/cli.md` — Command/Argument/Flag or a process entrypoint
11. `references/http-clients.md` — outgoing HTTP, `fetch`, provider adapters
</required_reading>

<process>
## Step 1: Version and neighbors

Resolve `effect` (and relevant `@effect/*`) from the target workspace lockfile. Inspect neighboring services, layers, errors, schemas, and tests. Local module style wins for names/files; installed source wins for API facts.

Do not redesign domain facades unless the user asked.

## Step 2: Domain types first

If the change introduces or crosses a type:

- Untrusted input → Schema + `decodeUnknownEffect` at the boundary.
- Absence → `Option` (normalize nullish once at the edge).
- Pure success/failure, no IO → `Result` (v3: `Either`).
- DTO → `Schema.Struct` + same-name `interface`.
- ID / scalar → constrained brand (`NonEmptyString` / `pattern` / int bounds **then** `Schema.brand`).
- Closed variants inside the program → `Data.TaggedEnum` + `$match` (Scala `sealed trait`).
- Closed variants on the wire → `Schema.TaggedUnion` / `Schema.TaggedStruct` + `Match.valueTags`.
- Expected Effect failure → `Schema.TaggedErrorClass` with `cause: Schema.Defect()` when wrapping foreign errors.

Follow `references/schema-decision.md` and `references/type-discipline.md`. Do not invent unique-symbol brands, phantom `& { _tag }`, or `switch`/`default` on domain ADTs.

## Step 3: Service and layer

- Tag: v4 `Context.Service<Service, Interface>()("@app/Name")`. Unique string. Match existing project style if it already has one.
- Implement with `Layer.effect` (or `scoped` if finalizers/fibers). Yield deps once, close over them, return `Service.of({ ... })`.
- Every public / non-trivial method: `Effect.fn("Domain.method")`. Extra `Effect.fn` args for retry, timeout, span, error classification — not for in-body branching.
- Method signatures: `Effect<A, E>` with `R = never`. A dep in `R` on a method is a smell.
- Compose with `Layer.provide` to hide internals. `provideMerge` only when the caller must still `yield*` that dep (tests, multi-service entry).

Keep pure helpers pure. Do not wrap array maps or path joins in `Effect.try`.

## Step 4: Errors and instrumentation

- Yield tagged errors directly (they are yieldable). `return yield*` on conditional failure branches.
- Map infrastructure → domain tagged errors at the adapter. Preserve `cause`.
- `Effect.log*` values are Effects — chain them. `console.log` and `process.env` are out.
- Background work owned by a layer: `Effect.forkScoped` so layer acquisition completes.
- Cache/Stream/CLI/HTTP surfaces: follow the matching reference. Do not hand-roll Map+TTL, `unfold` pagination, `runPromise`+`process.exit` CLIs, or raw `fetch` in business services.

## Step 5: Tests

Default `it.effect` + a test Layer provided on that test. `TestClock.adjust` after forking sleeping/retrying effects. Synchronize with `Deferred` / `Latch` / `Queue`, not `Effect.sleep`. See `references/testing.md`.

## Step 6: Review checklist (always, including write)

- [ ] No domain `null` / `undefined` / `getOrThrow`; absence is `Option`, pure fail is `Result`
- [ ] No `as Brand`-style casts in logic; producers (parsers, rows, DTOs, CLI Invocation) emit branded/`Option` shapes, tests build brands via Schema decode
- [ ] `lint:effect` (type-aware: `no-unnecessary-condition`, cast ban with named escape hatches) green on changed files — `references/static-gate.md`
- [ ] No `as any` / `as never` / non-null assertion used to beat an Effect type
- [ ] No `try/catch` around `yield*`
- [ ] No `Effect.catchAll` that drops tagged variants the caller still needs
- [ ] No `DateTime.unsafeNow` / `Date.now` / raw `crypto.randomUUID` in Effect
- [ ] No `Layer.mergeAll` of dependent layers
- [ ] Exhaustive match on tagged unions (`Match.exhaustive` / `$match` / `valueTags`) — no `switch`/`default`
- [ ] No domain `null` / `undefined` / `getOrThrow`; absence is `Option`, pure fail is `Result`
- [ ] No hand-rolled Map+TTL cache, unbounded `runCollect`, CLI handler that embeds domain rules, or `fetch` outside an HTTP adapter
- [ ] `tsc --noEmit` (or project equivalent) + the narrowest `it.effect` covering the change
</process>

<success_criteria>
This workflow is complete when:

- [ ] Code matches installed Effect version (v4 snippets translated on v3)
- [ ] `E` and `R` on new/changed functions are intentional, not accidental `unknown`/`any`
- [ ] Deps captured at layer construction; methods have `R = never`
- [ ] Untrusted data decoded with Schema; brands have real constraints; ADTs matched exhaustively
- [ ] Review checklist items pass; typecheck + scoped test green
</success_criteria>
