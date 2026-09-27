# Workflow: Stack Boundaries (Hono, Drizzle, Zod)

Verified integration patterns for TS + Effect + Hono + Drizzle + Zod + Vitest. Each section names the stale pattern to avoid — those exist in training data.

<required_reading>
1. SKILL.md version routing — verify installed `effect`, `hono`, `drizzle-orm`, `zod`
2. `references/schema-decision.md` — decode vs make, DateTimeUtc, brands
3. `references/type-discipline.md` — `unknown` at the edge, no `z.infer` across Effect
4. `references/services-layers.md` — one runtime, `R = never` on service methods
</required_reading>

<process>
## Step 1: Confirm versions, then pick the section that matches the boundary

Do not mix Hono RPC validators with Effect `HttpApi` in the same service. Outgoing HTTP (`HttpClient`, provider `fetch`) is `references/http-clients.md`.

## Zod ↔ Effect Schema

**Rule: Zod for frontend/forms (TanStack etc.), Effect Schema for all Effect-side decoding. No bidirectional conversion package exists — do not look for one, do not build one.**

Interop = Standard Schema v1:

```typescript
import { Schema } from "effect"
const standardSchema = Schema.standardSchemaV1(MySchema) // effect ≥ 3.10
```

- Effect Schema exports OUT to Standard Schema. There is no Effect-side consumer of arbitrary Standard Schemas — do not assume `Schema.fromStandard`.
- Zod 4: native Standard Schema + `z.toJSONSchema()`. Zod 3 is EOL — new code targets Zod 4.
- **STALE:** `@effect/schema` (deprecated since 3.10), shared raw `z.infer` types across the Effect boundary.

## Hono + Effect

**STALE:** `@hono/effect-validator` — pinned to deprecated `@effect/schema`, unmaintained.

**Validation** — official `@hono/standard-validator`:

```typescript
import { Hono } from "hono"
import { sValidator } from "@hono/standard-validator"
import { Schema } from "effect"

const CreateUser = Schema.Struct({ email: Schema.String })

const app = new Hono().post(
  "/users",
  sValidator("json", Schema.standardSchemaV1(CreateUser)),
  (c) => c.json({ ok: true }),
)
```

**Running Effect in handlers — ManagedRuntime once at module scope:**

```typescript
import { ManagedRuntime } from "effect"
import { AppLayersLive } from "./layers.js"

export const runtime = ManagedRuntime.make(AppLayersLive) // never per request

const app = new Hono().get("/users/:id", (c) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const users = yield* Users
      return yield* users.find(c.req.param("id"))
    }),
  ),
)
```

- `runPromise` collapses typed `E` — map expected errors to HTTP **inside** the Effect (`catchTag`) before returning, or they become 500s/defects.
- Keep handlers thin: decode, call a service, map tagged errors to status. Business rules stay in services.
- Hono RPC (`hc<AppType>`) needs `sValidator` in the chain for `c.req.valid` / `c.json`.
- Alternative without Hono middleware: Effect `HttpApi` (schema-first, `HttpApiTest`). Pick one per service.

## Drizzle + Effect

Resolve `drizzle-orm` first.

**Path A — `drizzle-orm` v1/rc (first-party Effect):**

```typescript
import * as PgDrizzle from "drizzle-orm/effect-postgres"
import { PgClient } from "@effect/sql-pg"
import { Layer, Redacted } from "effect"

const DbLive = PgDrizzle.makeWithDefaults().pipe(
  Layer.provide(PgClient.layer({ url: Redacted.make(process.env.DATABASE_URL!) })),
)
```

Config still belongs in `Config` / a config Layer in app code — the snippet above is the Drizzle wiring shape, not permission to scatter `process.env`.

- `EffectLogger` / `EffectCache` are Effect services.
- Schema bridge: `drizzle-orm/effect-schema` → `createInsertSchema` / `createUpdateSchema` / `createSelectSchema`. Override branded columns; nullable overrides need `Schema.NullOr`. Dates over HTTP: `Schema.DateTimeUtc`, not `DateTimeUtcFromDate`.
- Handlers decode with Schema — no `toModel` mapper functions.

**Path B — stable `drizzle-orm` 0.x:** wrap Drizzle in a service over `@effect/sql-pg`, or use `@effect/sql-*` directly. **STALE:** `@effect/sql-drizzle` (undocumented, Effect-TS/effect#3796).

**Transactions (both paths):** Drizzle tx is callback-style — `Effect.tryPromise` with a tagged error that keeps `cause`. Keep provider/network calls **outside** the transaction.

## Vitest

- Effect tests: `it.effect` / `it.live` / `it.scoped`. Never `runPromise` inside them. Details: `references/testing.md`.
- React tests stay plain Vitest.

## Step 2: Verify the boundary

Typecheck the handler/repo module. Hit one happy path and one tagged error mapped to HTTP/tx rollback. Confirm no `z.infer` or `as` on the Effect side of the boundary.
</process>

<success_criteria>
- Installed versions checked; stale packages not introduced
- Untrusted payloads decoded with Effect Schema (Standard Schema into Hono, not a custom Zod↔Schema bridge)
- Single ManagedRuntime (or HttpApi) at the process edge; `E` mapped before `runPromise`
- Drizzle path matches `drizzle-orm` major; dates/brands/nullability encoded correctly
- Scoped typecheck + one boundary test green
</success_criteria>
