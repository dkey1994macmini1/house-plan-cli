<overview>
Outgoing HTTP in Effect apps. v4: `effect/unstable/http` (breaking changes allowed in minors). Incoming HTTP (Hono / HttpApi) is `workflows/stack-boundaries.md`, not this file. On v3, `@effect/platform/HttpClient` — grep installed source.
</overview>

<choose>
Prefer Effect `HttpClient` in application/provider code: typed `E`, layers, `mapRequest`, schema bodies.

Raw `fetch` is a deliberate exception: browser/edge constraints, a platform transport, or a library that must not depend on unstable HTTP. Keep it inside one adapter; wire `AbortSignal` from `Effect.tryPromise`; classify status **before** decoding; wrap with tagged errors that keep `cause`. Prefer replacing it with `HttpClient` before adding retries/auth/pagination.
</choose>

<patterns>
Yield `HttpClient.HttpClient` once in the adapter layer. `mapRequest` for base URL, auth, Accept — not per call. Tokens from `Config.redacted`, never literals.

```ts
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http"

const Users = Context.Service<
  Users,
  { readonly findById: (id: UserId) => Effect.Effect<User, UsersError | Schema.SchemaError> }
>()("@app/Users")

const layer = Layer.effect(
  Users,
  Effect.gen(function* () {
    const token = yield* Config.redacted("GITHUB_TOKEN")
    const base = yield* HttpClient.HttpClient
    const client = base.pipe(
      HttpClient.mapRequest(
        flow(
          HttpClientRequest.prependUrl("https://api.github.com"),
          HttpClientRequest.bearerToken(Redacted.value(token)),
          HttpClientRequest.acceptJson,
        ),
      ),
      HttpClient.retryTransient({ times: 3 }),
    )

    const findById = Effect.fn("Users.findById")(function* (id: UserId) {
      const response = yield* client.get(`/users/${id}`)
      return yield* HttpClientResponse.matchStatus(response, {
        "2xx": HttpClientResponse.schemaBodyJson(User),
        404: () => Effect.fail(new UserNotFound({ id })),
        orElse: (r) =>
          Effect.fail(new UsersHttpError({ id, status: r.status })),
      })
    })

    return Users.of({ findById })
  }),
).pipe(Layer.provide(FetchHttpClient.layer))
```

Filter-2xx-then-decode: `filterStatusOk` then `schemaBodyJson`. `schemaJson` when status/headers are part of the schema; `schemaNoBody` for empty bodies.

JSON request body is effectful (encode can fail): `yield* HttpClientRequest.post(url).pipe(HttpClientRequest.schemaBodyJson(Create)(payload))` then `HttpClient.execute`.
</patterns>

<retry>
`HttpClient.retryTransient` covers transport errors, timeouts, `408` / `429` / `5xx`. Retry **only** idempotent operations.

`HttpClient.withRateLimiter` when the client should pace and honor `Retry-After` (adds `RateLimiterError` to `E`).

Domain-specific retry (provider payload, idempotency key) = `Effect.retry` on the named operation, not a second blanket client retry.
</retry>

<guidelines>
- Adapter owns the full boundary: request, auth, execute, status, decode, map to tagged domain errors. Business services do not call `HttpClient.get` directly.
- Keep HTTP **outside** DB transactions.
- `RequestError` = network/DNS/timeout. `ResponseError` = non-2xx after `filterStatusOk`, or body parse failure. Do not `catchAll` them into `string`.
- Provide `FetchHttpClient.layer` once on the adapter layer, not per request.
- Do not `console.log` / `runPromise` in snippets that land in the app. Do not copy `ServiceMap.Service` from community HTTP tutorials.
</guidelines>
