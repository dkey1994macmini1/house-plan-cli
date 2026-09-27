<overview>
`Stream<A, E, R>` is a pull-based, backpressured source of many `A` over time. Use it for evented / paginated / piped work — not as a fancy `while (true)`.
</overview>

<choose>
**Source**

- In-memory / tests: `Stream.make` / `Stream.fromIterable` (open subscription fixture: `concat(Stream.never)`).
- One consumer per item: private `Queue` + `Stream.fromQueue`.
- Every subscriber sees every event: `PubSub` + `Stream.fromPubSub`.
- Current value + changes: `SubscriptionRef` + `.changes`.
- Paginated pull API: `Stream.paginate(state, (s) => Effect<[readonly A[], Option<S>]>)`. Step is already effectful — v4 has no `paginateEffect`. `unfold` drops the last page when you terminate on `none` without emitting.
- Foreign async iterable: `Stream.fromAsyncIterable(iter, onError)`.
- Push/callback APIs (v4): `Stream.callback` (replaces v3 `async` / `asyncEffect` / `asyncPush` / `asyncScoped`).
- Stream after reading services: `Stream.unwrap`.

**Do not** use a stream to repeat one effect with no values — `Effect.repeat` + `Schedule`.

**Transform:** `map` pure; `mapEffect` effectful; `{ concurrency: N }` bounded (never `"unbounded"` on untrusted volume); `unordered: true` only when order does not matter. `flatMap` for 1→N. `filter` / `filterEffect`. `mapAccum` / `mapAccumEffect` for state. `debounce` quiet period; `throttle` / `throttleEffect` rate.

**Consume:** `runForEach` side effects; `runDrain` ignore values; `runCollect` / `take(n)` **only** on finite/test streams; `runFold` to a value. Long-lived consumer in a layer: `stream.pipe(Stream.runForEach(handler), Effect.forkScoped)` so acquisition completes.
</choose>

<patterns>
Expose `Stream` on the service; keep Queue/PubSub private:

```ts
export interface Interface {
  readonly events: Stream.Stream<ProviderEvent, ProviderError>
}
```

```ts
export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const gateway = yield* Gateway
    yield* gateway.events.pipe(
      Stream.filter(isMessageEvent),
      Stream.runForEach(handleEvent),
      Effect.forkScoped,
    )
  }),
)
```

`Stream.buffer({ capacity, strategy })` only to decouple producer/consumer: `"suspend"` backpressure, `"dropping"` drop new, `"sliding"` keep latest. `"unbounded"` only if growth is bounded elsewhere.

Keyed work (per session/id): one named helper with `FiberMap` — serialize per key, concurrent across keys. Do not scatter fiber maps in consumers.
</patterns>

<errors>
Prefer typed stream `E`. `Stream.mapError` at boundaries; `catchTag` / `catchIf` for recovery; `catchCause` only at supervision. Do not swallow defects on a production event stream unless the boundary is explicitly best-effort.

Wrap one-shot consumption in `Effect.scoped` when the stream holds resources.
</errors>

<tests>
Finite fixtures: `fromIterable` + `take(n)` + `runCollect`. Drive interactively with a test-owned `Queue`. Coordinate with `Deferred` / `Latch` / `TestClock` — not real sleeps. Never `runCollect` an unbounded production stream in a test without `take`.
</tests>
