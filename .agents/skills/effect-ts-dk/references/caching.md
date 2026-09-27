<overview>
Keyed memoization, TTL, in-flight dedupe, and when **not** to invent a Map. v4 names; on v3 grep installed `Cache` before copying.
</overview>

<choose>
| Need | API |
|------|-----|
| Same key over time, bounded memory, TTL | `Cache.make` / `Cache.makeWith` |
| Concurrent burst of the **same** missing key | `Cache` — shared pending lookup is built in |
| One value, no key | `Effect.cached` / `Effect.cachedWithTTL` |
| Cached resource with cleanup | `ScopedCache` |
| N distinct keys, backend has a **batch** endpoint (`IN (...)`, DataLoader) | `Effect.request` + `RequestResolver` |
| N distinct keys, per-item HTTP only | `Effect.forEach(..., { concurrency: N })`, optionally through a `Cache` |
</choose>

<patterns>
Build the cache **once** in the owning layer. A cache constructed per call caches nothing.

```ts
const layer = Layer.effect(
  Users,
  Effect.gen(function* () {
    const lookup = (id: UserId) => fetchUser(id) // client already in closure
    const cache = yield* Cache.make({
      capacity: 300,
      lookup,
      timeToLive: "10 minutes",
    })
    const findById = Effect.fn("Users.findById")((id: UserId) => Cache.get(cache, id))
    return Users.of({ findById })
  }),
)
```

**Exit-aware TTL** — cache successes, skip transients:

```ts
const cache = yield* Cache.makeWith(lookup, {
  capacity: 300,
  timeToLive: (exit) =>
    Exit.isSuccess(exit) && exit.value.cacheable ? "10 minutes" : Duration.zero,
})
```

Zero TTL = do not store that exit. A short negative-cache TTL is for **stable** failures (not-found), not for timeouts.

`Cache.invalidate` / `Cache.refresh` for explicit staleness. `Cache.has` checks without a lookup. `refresh` keeps the old value until the new lookup succeeds.
</patterns>

<guidelines>
- `capacity` is required. Do not write prune/LRU/in-flight Maps when `Cache` fits.
- Concurrent `Cache.get` on the same missing key shares one lookup — do not add your own inflight set.
- Lookup must be a cheap call. Acquire HTTP/SDK clients in the **layer**, not inside `lookup`. `Effect.provide(clientLayer)` on every miss pays acquisition per key.
- `RequestResolver.batchN` bounds batch size. Do not use request-batching when the backend has only per-item endpoints — it still does N calls.
- v4 `Cache` lookup can require `R`; keep that `R` satisfied by the layer that owns the cache, not by each `get` caller.
</guidelines>
