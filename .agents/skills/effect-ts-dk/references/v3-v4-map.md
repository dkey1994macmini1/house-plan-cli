# Effect v3 ↔ v4 Concept Map

Orientation only. Installed package is authority. Full rename map: Effect repo `migration/v3-to-v4.md` — `rg` it, never read whole.

This skill's examples are **v4**. Use this table when the workspace is v3, or when a doc/skill uses the other era's names.

| Concept | v3 (stable) | v4 (rc, 2026) |
|---|---|---|
| App service tag | `Effect.Service` (class = tag, `.Default`) | `Context.Service` + `Service.of` |
| Library service tag | `Context.Tag` | `Context.Service` |
| Stale community name | — | **not** `ServiceMap.Service` — that is not the official v4 API |
| Default-valued context | `Context.Reference` | `Context.Reference` |
| Typed error class | `Schema.TaggedError<T>()(...)` / `Data.TaggedError` | `Schema.TaggedErrorClass` / `Data.TaggedError` |
| Sum type | `Either` (Right/Left) | `Result` (Success/Failure) |
| Decode unknown (Effect) | `Schema.decodeUnknown` | `Schema.decodeUnknownEffect` |
| Decode unknown (pure) | `Either` helpers | `Schema.decodeUnknownResult` |
| Schema union | `Schema.Union(A, B)` | `Schema.Union([A, B])` |
| STM collections | `TMap` / `TSet` / `TQueue` / `TRef` | `TxMap` / `TxHashSet` / `TxQueue` / `TxRef` |
| Runtime | `Runtime<R>` + `ManagedRuntime` | `Runtime<R>` removed; layer-based runtime (`ManagedRuntime` still used at HTTP edges) |
| Platform packages | `@effect/platform`, `@effect/rpc`, `@effect/cluster` (separate versions) | merged into core `effect`; one shared ecosystem version |
| Unstable surfaces | `@effect/platform/*` | `effect/unstable/*` (http, rpc, sql, schema, cli, ai, workflow, observability, process) |
| CLI | `@effect/cli` | `effect/unstable/cli` (`Command` / `Argument` / `Flag`) |
| Outgoing HTTP | `@effect/platform/HttpClient` | `effect/unstable/http` (`HttpClient`, `FetchHttpClient.layer`) |
| Stream push/callback | `Stream.async*` / `asyncEffect` / `asyncPush` / `asyncScoped` | `Stream.callback` |
| Stream pagination | `Stream.paginateChunkEffect` | `Stream.paginate` (step already returns `Effect`) |
| Cache | `Cache.make` (no lookup `R`) | `Cache.make` / `makeWith` (lookup may require `R`; stats APIs removed) |
| Schema package | `effect/Schema` (since 3.10; `@effect/schema` **deprecated**) | core `Schema` (rewrite — `migration/schema.md`) |
| Raw generator values | `yield*` yields `GenKind`-wrapped | raw values (`GenKind` removed) |
| Equality | reference for classes unless Equal implemented | structural by default |
| `pipe` | yes | **still exists** |
| Body of work | `Effect.Effect<A, E, R>` | unchanged |
| Install | `effect@^3` | `effect@rc` dist-tag |

## Version-agnostic rules

1. Resolve installed version first. Do not mix APIs in one change.
2. Grep installed `src/` when a helper's shape is uncertain.
3. Migration: no `v3-compat` re-export shims, no `as any`. Every replacement traces to `migration/v3-to-v4.md` (search) or v4 source. Official skill: `effect-v3-to-v4`.
4. `@effect/schema` imports are stale in any version since 3.10.
5. v4: all remaining `effect` / `@effect/*` packages share one version. Mismatched versions are a bug before any code fix.

## Bundle note (v4)

Minimal program ~6.3 KB gz, ~15 KB with Schema (vs ~70 KB v3). Do not carry v3 Schema-avoidance-for-size habits into v4.
