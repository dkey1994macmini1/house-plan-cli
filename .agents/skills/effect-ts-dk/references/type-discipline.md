<overview>
Strong typing in this codebase means Effect's data types, not TypeScript `null` / `string | undefined` / `boolean` flags. v4 names; on v3: `Either` instead of `Result`. Constructors for Schema ADTs: `schema-decision.md`.
</overview>

<channels>
`Effect<A, E, R>` is the fallible **computation**. Do not stuff absence or a closed set of variants into `E` when they are data.

| Need | Type | Not |
|------|------|-----|
| Missing value | `Option<A>` | `null`, `undefined`, `T \| null`, `!` |
| Pure success / failure (no effects) | `Result<A, E>` (v3: `Either<E, A>`) | `boolean`, thrown `Error`, `A \| Error` |
| Closed set of variants (Scala `sealed trait`) | `Data.TaggedEnum` internal; `Schema.TaggedUnion` on the wire | `string` enums, `status: string`, untagged unions |
| Effectful work | `Effect<A, E, R>` | wrapping Option/Result "just in case" |

Option and Result are **data**. Yielding them does not fail the fiber. `Option.none()` is not `Effect.fail`. `Result.fail` is not a tagged Effect error — lift with `Effect.fail` / `Effect.fromResult` only at a boundary that should occupy `E`.
</channels>

<option>
Domain absence is `Option`. Normalize `null`/`undefined` **once at the system edge** (`Schema.OptionFromNullOr` for JSON, `OptionFromUndefinedOr` for JS object keys), then pass `Option<A>` inward.

**Drift watch (real failure mode):** nullish re-enters through *secondary producers* even after the primary edge is clean — a regex parser returning `attr(): string | undefined`, a sqlite row typed `number | null`, a module-local DTO re-declaring a domain type with optional fields, a CLI Invocation carrying `string | undefined`. Consumers then "fix" it with `as Brand` casts one by one. Rule: **every producer of a raw shape converts at creation, in one place per shape** (an Option-returning helper or Schema decode); consumption code never converts, never branches on nullish. Grep drift before review: `rg -n '\| null|\| undefined|as [A-Z][A-Za-z]+,' src --type ts -g '!*.test.ts'` — or make the grep a rule: type-aware ESLint CI gate (`references/static-gate.md`) rejects drift mechanically instead.

```ts
import { Option } from "effect"

const label = Option.match(user.nickname, {
  onNone: () => "anonymous",
  onSome: (name) => name,
})
```

- `Option.getOrElse` / `orElse` when a default is real.
- `Option.getOrThrow` / `unwrap` is a defect. Same class of bug as `!`.
- Do not use `Option` for failures that the caller must handle — that is `Result` or `E`.
</option>

<result>
Pure parse / decision with two outcomes, no services, no IO:

```ts
import { Result } from "effect"

const parsed = decode(input) // Result<Value, ParseIssue>
Result.match(parsed, {
  onSuccess: (value) => value,
  onFailure: (err) => fallback(err),
})
```

v3: `Either.match` / `Either.right` / `Either.left` (note the type parameter order: `Either<E, A>`).

If the work needs a service, clock, or IO, it is an `Effect`, not a Result. If a Result failure should occupy Effect `E`, lift it (`grep` installed `fromResult` / `Result.match` + `Effect.fail`). Do not wrap a Result in `Effect.succeed` and pretend it can fail.
</result>

<sealed>
TypeScript has no `sealed trait`. The substitute is a **tagged union** whose constructors are the only inhabitants.

**Internal algebra** (not serialized) — Scala `sealed trait` + `case class`:

```ts
type Step = Data.TaggedEnum<{
  Continue: { readonly cursor: number }
  Finished: { readonly count: number }
}>
export const Step = Data.taggedEnum<Step>()

const label = Step.$match(step, {
  Continue: ({ cursor }) => `at ${cursor}`,
  Finished: ({ count }) => `done ${count}`,
})
```

**Wire / persistence** — same idea, with a Schema: `Schema.TaggedUnion` / `TaggedStruct` (see `schema-decision.md`). Match with `Event.match` or `Match.valueTags`.

Do not add a Schema solely to get constructors. Do not model a closed variant set as `kind: string`.
</sealed>

<match>
This is Scala `match` with exhaustiveness. The leftover type is `never`.

```ts
import { Match } from "effect"

const render = Match.valueTags(event, {
  Started: ({ runId }) => `started ${runId}`,
  Finished: ({ runId }) => `finished ${runId}`,
})

Match.value(event).pipe(
  Match.tag("Started", ({ runId }) => `started ${runId}`),
  Match.tag("Finished", ({ runId }) => `finished ${runId}`),
  Match.exhaustive,
)
```

- `$match` / `valueTags` / `Match.exhaustive` — compiler error when a tag is added and the match is not updated.
- `switch (x._tag) { default: return fallback }` — **silent miss**. Forbidden on domain ADTs.
- `as never` in a match = a case is missing. Add the case.

Pattern-match on `_tag`. Do not `instanceof` Effect tagged classes as the primary dispatch (tags are the contract; `Match` is the tool).
</match>

<brands>
Structural typing makes `UserId` and `OrderId` the same if both are `string`. Constrain, then `Schema.brand`. No unique-symbol DIY next to Schema. No phantom `& { _tag: "X" }` instead of TaggedEnum / TaggedStruct.

**Brands only via Schema decode — never `as Brand`.** The one-way door: validate at the point where raw meets branded (adapter `validateWatch`-style function, CLI arg decoding, row mappers), then every downstream signature takes the branded/`Option`-typed shape and contains zero casts. If consumption code needs `x as Brand`, the *producer* is mis-typed — fix the producer. Tests build branded values through Schema too (`Schema.decodeUnknownSync(BrandSchema)(n)` helper), so the codebase has no cast to copy.

Untrusted input is `unknown` until `Schema.decodeUnknownEffect`. `any` deletes brands, `E`, and `R`.
</brands>

<casts>
| Cast | What you deleted |
|------|------------------|
| `as any` | channels + brands + ADTs |
| `as never` | exhaustiveness |
| `as SomeService` | Layer graph |
| `!` / `getOrThrow` | Option |
| `try/catch` around `yield*` | `E` (it never runs) |

A narrow assertion at a **foreign** untyped boundary needs a one-line comment naming the library gap. Domain Effect code does not get that exception.

This table is enforceable: type-aware ESLint with a `no-restricted-syntax` ban on `TSAsExpression`/`TSTypeAssertion` makes every row a CI failure unless the line carries the named-gap disable. Config: `references/static-gate.md`.
</casts>
