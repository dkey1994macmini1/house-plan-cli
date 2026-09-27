<overview>
Which Schema/Data constructor to reach for. Defaults are v4. Do not use `Schema.Class` as the default record type.
</overview>

<decision_tree>
```
Untrusted input (HTTP, DB, env, queue)?
  YES → Schema + decodeUnknownEffect at that boundary
  NO  ↓
Scalar ID / value object?
  YES → constrained schema, then Schema.brand
  NO  ↓
Internal workflow algebra (not serialized)?
  YES → Data.TaggedEnum + constructors + $match
  NO  ↓
Used as HashMap/HashSet key, or needs methods / Equal / PrimaryKey?
  YES → Schema.Class (implement Equal/Hash when it is a key)
  NO  ↓
Wire/storage discriminated union (Effect-owned `_tag`)?
  YES → Schema.TaggedUnion / TaggedStruct (custom discriminant: Schema.tag + toTaggedUnion)
  NO  ↓
Schema.Struct + same-name interface
```
</decision_tree>

<records>
```ts
export const User = Schema.Struct({
  id: UserId,
  name: Schema.NonEmptyString,
  email: Schema.optionalKey(Schema.String),
})
export interface User extends Schema.Schema.Type<typeof User> {}
```

- Reuse fields with `.fields` / `Schema.fieldsAssign` when contracts are actually related — not to build inheritance trees.
- `Schema.optionalKey` = key may be absent. `Schema.optional` = explicit `undefined` is in the contract. `NullOr` / `UndefinedOr` only when the encoded form really has nullish.
- `.annotate({ identifier: "User" })` only when HTTP/RPC/OpenAPI/codegen consumes it.
</records>

<construction>
| Situation | API |
|-----------|-----|
| Trusted in-process construction | `schema.make(...)` |
| Construction failure should be `E` | `schema.makeEffect(...)` |
| Untrusted unknown | `Schema.decodeUnknownEffect(...)` |
| Untrusted → `Option<A>` outside an Effect (row mapper, parser, test factory) | `Schema.decodeUnknownOption(...)` |
| Scripts/startup where throwing is OK | `Schema.decodeUnknownSync(...)` (rare) |
| Pure success/failure, no Effect | `Schema.decodeUnknownResult(...)` (v3: Either) |

Never cast to skip validation.
</construction>

<variants>
**Internal (no codec):** `Data.TaggedEnum` + `$match` / `$is`. Do not add a Schema just to get constructors.

**Boundary (codec, JSON Schema, persistence):**

```ts
export const Event = Schema.TaggedUnion({
  Started: { runId: RunId },
  Finished: { runId: RunId, result: Schema.Json },
})
export type Event = typeof Event.Type
Event.match(event, { Started: ..., Finished: ... })
```

External discriminant (`type` / `kind`): `Schema.tag("variant")` on the struct, then `Schema.toTaggedUnion("type")` if union helpers are needed.
</variants>

<brands>
Always constrain, then brand:

```ts
export const UserId = Schema.NonEmptyString.pipe(
  Schema.pattern(/^usr_[a-z0-9]+$/),
  Schema.brand("UserId"),
)
export type UserId = typeof UserId.Type
```

Bare `Schema.String.pipe(Schema.brand("UserId"))` is a lint-level smell — it only buys the nominal type, not the invariant.
</brands>

<errors>
`Schema.TaggedErrorClass` is the class exception (typed `E`, yieldable, schema-backed):

```ts
export class PersistenceError extends Schema.TaggedErrorClass<PersistenceError>()(
  "UserRepo.PersistenceError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}
```

Preserve `cause` when wrapping foreign failures. `Data.TaggedError` only for internal-only errors that never cross encode/docs/API. Do not hand-roll `_tag` error classes.
</errors>

<datetime>
On HTTP/JSON boundaries use `Schema.DateTimeUtc` (Encoded = string). `DateTimeUtcFromDate` (Encoded = Date) breaks JSON round-trips. When deriving from Drizzle, branded/nullable overrides replace the **whole** column schema — wrap with `Schema.NullOr` if the column is nullable.
</datetime>

<stale>
- `@effect/schema` package — dead since Effect 3.10; use `effect/Schema`
- v3 `Schema.TaggedError<T>()("Tag", { ... })` → v4 `Schema.TaggedErrorClass`
- v3 `Schema.Union(A, B)` → v4 `Schema.Union([A, B])`
</stale>
