<overview>
Service tags, layer constructors, composition, and `Effect.fn`. v4 defaults. Preserve the project's existing tag style when it is type-safe.
</overview>

<tags>
v4 application default:

```ts
export class Users extends Context.Service<
  Users,
  {
    readonly findById: (id: UserId) => Effect.Effect<User, UserNotFound>
  }
>()("@app/Users") {}
```

- Identifiers globally unique (`@app/Name` or `package/path/Name`).
- Methods `readonly`, return `Effect<A, E>` with **`R = never`**.
- `Users["Service"]` if you need the interface type.

v3: app convenience = `Effect.Service` + `.Default`; library / multiple impls = `Context.Tag`. Do not emit `ServiceMap.Service` (stale community name).

`Context.Reference` only for ambient values with a **real** safe default (feature flag). Not for credentials, DB, or HTTP clients.

`Effect.provideService` for request-local data (actor, tenant, request id) — do not build a Layer for values that change per request.
</tags>

<construction>
Yield deps once in the layer `make`, close over them. Do not take services as factory parameters — that hides the graph.

```ts
static readonly layer = Layer.effect(
  Users,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const findById = Effect.fn("Users.findById")(function* (id: UserId) {
      const response = yield* http.get(`/users/${id}`)
      return yield* HttpClientResponse.schemaBodyJson(User)(response)
    })
    return Users.of({ findById })
  }),
)
```

A dep appearing in a method's `R` means it was not captured at construction.

| Constructor | When |
|-------------|------|
| `Layer.succeed` | Already-built pure impl |
| `Layer.sync` | Lazy synchronous impl |
| `Layer.effect` | Effectful acquisition, no finalizer |
| `Layer.scoped` | `acquireRelease` or scoped fibers |
| `Layer.unwrap` / v3 `unwrapEffect` | An Effect **chooses** which layer to build |
| `Layer.effectContext` | One acquisition supplies multiple tags (typical test stub) |
| `Layer.effectDiscard` | Layer that only starts background work |

Do not hide effectful construction inside `Layer.succeed`.

**Background work:** acquisition must finish. Fork with `Effect.forkScoped` (or `FiberSet` / `FiberMap`). Do not run `Stream.runForEach` / forever loops inline in `make` without a fork.
</construction>

<composition>
| Method | Deps satisfied | Still in program `R` | Use |
|--------|----------------|----------------------|-----|
| `Layer.provide` | yes | no | hide implementation deps |
| `Layer.provideMerge` | yes | yes | tests / entry that still `yield*` the dep |
| `Layer.mergeAll` | no | yes | independent layers |

`provideMerge` is not a "make tsc green" tool. `mergeAll` of **dependent** layers leaves `R` unsatisfied.

Memoization is by **reference identity**. Store parameterized layers in constants. `Layer.fresh` only to deliberately escape that.

Provide the app Layer once at the runtime boundary. Do not scatter `Effect.provide` through domain methods.
</composition>

<effect_fn>
```ts
const read = Effect.fn("Attachment.read")(
  function* (ref: AttachmentRef) {
    return yield* api.read(ref)
  },
  (effect, ref) =>
    effect.pipe(classifyError("Attachment.read", { id: ref.id })),
)
```

Extra arguments wrap the **whole call** (retry, timeout, span, error map, `annotateLogs`). They receive `(effect, ...originalArgs)`. Keep the generator for the workflow; one or two transforms is enough.

`Effect.fnUntraced` only when span/stack metadata is intentionally omitted.

Do not export one accessor wrapper per method when callers can `yield*` the service.
</effect_fn>
