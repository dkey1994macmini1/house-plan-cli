<overview>
`@effect/vitest` defaults. Time, fakes, and config without escaping the test runtime.
</overview>

<defaults>
- `it.effect` — TestClock / TestContext. Default.
- `it.live` — only when wall-clock or live services are the subject.
- `it.scoped` — when the test acquires scoped resources.
- `it.layer` — only for expensive shared resources; prefer a fresh Layer per test.

Never `Effect.runPromise` / `runSync` inside `it.effect` — that escapes TestClock and test services.

Frontend/React tests stay plain Vitest. Do not force Effect into component tests.
</defaults>

<clock>
Fork the sleeping / retrying effect, **then** `TestClock.adjust` (or `setTime`). A test that "passes instantly" usually never ran the schedule.

Do not `Effect.sleep` to wait for another fiber. Use:

- `Deferred` — one-shot ready/done
- `Latch` — reusable gate
- `Queue` — events across fibers
- `Ref` — observed state
</clock>

<layers>
Provide the test Layer on the test effect. If the test `yield*`s a dependency that `Layer.provide` would hide, use `provideMerge` or a layer that exports that tag.

Reusable fake: same object added under the production tag **and** a `TestService` tag (`Layer.effectContext` + `Context.add` twice). Production code depends only on the production tag; tests inspect via `TestService`.

`Layer.succeed` for static stubs. `Layer.mock` only for tiny partial mocks where omitted members should fail loudly.

```ts
it.effect("finds a user", () =>
  Effect.gen(function* () {
    const users = yield* Users
    const result = yield* users.findById(id)
    expect(result.id).toBe(id)
  }).pipe(Effect.provide(Users.testLayer)),
)
```
</layers>

<config>
Exercise env decoding with `ConfigProvider.layer(ConfigProvider.fromUnknown({ ... }))`.

If the app already wraps decoded config in a service and the test should not hit env, `Layer.succeed(AppConfig, fixture)`.
</config>

<assert>
Assert tagged failures (`Effect.flip` / `catchTag` + expect), interruption, finalizers, retry bounds, and malformed payloads where that is the behavior. Do not swallow `E` to get a green test.
</assert>
