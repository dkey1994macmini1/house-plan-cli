# Core Effect Gotchas (LLM Traps)

Patterns ordinary TypeScript intuition (and training data) get wrong. Snippets are v4; on v3 translate via `v3-v4-map.md`.

## try/catch Does Not Catch Effect Failures

```ts
// WRONG — catch never runs for an Effect failure
Effect.gen(function* () {
  try {
    return yield* program
  } catch {
    return fallback
  }
})
```

Recover with `Effect.catchTag` / `catchTags` / `catchAll` / `Effect.exit`. Wrap foreign throwing code with `Effect.try` / `Effect.tryPromise` at the boundary — and keep `cause`:

```ts
Effect.tryPromise({
  try: () => fetch(url),
  catch: (cause) => new FetchError({ cause }),
})
```

## return yield* on Failure Branches

Without `return`, TypeScript keeps checking the branch; the error may not land in `E` (Effect-TS/website#972):

```ts
Effect.gen(function* () {
  if (!authorized) {
    return yield* new Unauthorized({ reason: "no" })
  }
  return yield* performAction
})
```

## Effect.log* Is an Effect

```ts
// BUG — constructs an Effect and drops it
Effect.logError("broke", { error })
return Effect.succeed(fallback)

// FIX
return Effect.logError("broke", { error }).pipe(Effect.as(fallback))
```

Same class of bug: floating `Effect.sync`, `withSpan` assigned to a variable and never yielded. Language-service `floatingEffect` exists for this.

## Impure Ops Must Be Tracked

```ts
const id = crypto.randomUUID()           // escapes Effect
const id = yield* Effect.sync(() => crypto.randomUUID())

const now = DateTime.unsafeNow           // bypasses TestClock
const now = yield* DateTime.now
```

## Defects vs Expected Errors

`Cause` = expected failures + defects + interruption. Tagged recovery / `mapError` for expected failures. `catchAllCause` only at runtime/reporting boundaries. Never convert audit/billing/persistence/notification to `Effect.void`. `Effect.orDie` only for impossible failures.

## Layer Composition

| Method | Deps satisfied | Exposed to program | Use |
|--------|----------------|--------------------|-----|
| `Layer.provide` | yes | no | internal wiring |
| `Layer.provideMerge` | yes | yes | tests/entry needing the dep |
| `Layer.mergeAll` | no | yes | independent layers |

`Effect<A, E, SomeService> not assignable to Effect<A, E, never>` → unsatisfied `R`. Fix the graph. Do not cast.

Layers memoize by reference identity — store parameterized layers in constants; `Layer.fresh` only to escape memoization.

Capture deps at construction (yield once, close over). A dep in a method's `R` is a smell.

## Runtime Boundaries

- No `runPromise` / `runSync` inside services or `it.effect`. One runtime at entry.
- No `console.log` — `Effect.log` with structured data.
- No `process.env` — `Config` / `ConfigProvider` in tests.

## Nullish Drift Through Secondary Producers

The primary Schema edge being clean does not make the codebase null-free. Nullish sneaks back in through shapes that are "not really the edge":

- regex/HTML parsers: helper returns `string | undefined`, so every consumer branches or casts
- persistence rows: `number | null` mapped to domain with `n as Price` inside a mapper
- module-local DTOs re-declaring a domain type with optional/nullable fields instead of importing the canonical one
- CLI frameworks handing `string | undefined` — store it as `Option` immediately (parser layer), never pass raw `| undefined` past that file

Each of these producers is the **boundary for its own shape**: convert at creation (`Option.flatMap` + `Schema.decodeUnknownOption`, one helper per raw shape), never in the consumer. If several consumers each do the conversion, the producer is wrong. Symptom to hunt in review: a `as Brand` cast appearing "once" in consumption code — its producer is already mis-typed.

## Concurrency and Resources

- `Effect.all(..., { concurrency: "unbounded" })` on untrusted-size input = exhaustion. Bound it.
- Forked fibers outside a Scope leak — `forkScoped` / `forkDaemon` deliberately; join or interrupt in tests.
- Scoped resources: `acquireRelease` or `Layer.scoped`; release on success, failure, **and** interruption. Wrap direct stream consumption with `Effect.scoped`.
- Layer that starts a listener/worker: fork into the layer scope so acquisition completes.

## Stream Pagination

v4: `Stream.paginate` (step is already effectful). v3: `Stream.paginateChunkEffect`. `unfold` drops the last page when terminating on `Option.none()` without emitting. Details: `references/streams.md`.

## Hand-Rolled Caches

`Map` + timestamp + prune loop (or an inflight-promise map) is almost always `Cache.make` / `Cache.makeWith`. Build it in the layer, not in the handler. Details: `references/caching.md`.

## Testing

- `it.effect` gives TestClock; `TestClock.adjust` after forking. Instant-green often means the schedule never ran.
- `runPromise` inside `it.effect` replaces test services silently.
- Synchronize with `Deferred` / `Latch` / `Queue`, never arbitrary `Effect.sleep`.
- Match tagged unions with `Match.exhaustive` / `valueTags` / `$match` — not `switch`/`default`.
- Domain `null` / `getOrThrow` / untagged `status: string` — `references/type-discipline.md`.
