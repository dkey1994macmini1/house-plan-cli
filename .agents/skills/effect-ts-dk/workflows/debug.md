# Workflow: Debug Effect Types and Runtime

<required_reading>
**Read these NOW:**

1. SKILL.md `<essential_principles>`
2. `references/core-gotchas.md`
3. `references/type-discipline.md`
4. `references/services-layers.md` — if the error mentions context, Layer, or `R`
5. `references/v3-v4-map.md` — if the code or the error mixes v3/v4 names
</required_reading>

<process>
## Step 1: Classify — do not cast

Paste nothing into `as any`. Map the symptom:

| Symptom | Likely cause | Where |
|---------|--------------|--------|
| `Effect<A, E, S> not assignable to Effect<A, E, never>` / "Missing X in context" | Unsatisfied `R` | `Layer.provide` vs `provideMerge`; dep not captured at construction |
| `E` includes tags you thought you handled | Missing `return yield*` on fail branch; `catchTag` typo; v3/v4 error class mismatch | generator + catchers |
| `E` became `unknown` or `Error` | `catchAll`, `try/catch`, or `cause` typed as `unknown` without a tagged wrap | recovery |
| Schema assignability / brand mismatch | Using `Type` where `Encoded` is required, or the reverse; unconstrained brand | `references/schema-decision.md` |
| Defect / fiber dump, not a tagged error | `throw` in gen; discarded `Effect.log*`; `orDie` on a real failure | Cause vs `E` |
| Test passes instantly or hangs | `it.effect` TestClock never adjusted; `runPromise` inside `it.effect` | `references/testing.md` |
| `floatingEffect` / log has no side effect | Effect value created and dropped | language-service |

Grep the installed package for the combinator if the signature might have changed.

## Step 2: Confirm version

If the code uses `Context.Tag` + `Effect.Service` on a 4.x install, or `Context.Service` / `Result` / `TaggedErrorClass` on 3.x, stop translating piecemeal — one version per file, map via `v3-v4-map.md`.

`ServiceMap.Service` in community skills is stale. Official v4 tag is `Context.Service`.

## Step 3: Fix the channel, not the annotation

- **R:** yield the missing service in the layer `make`, or `provide`/`provideMerge` the layer that supplies it. Do not add the service to a method's `R` "to make it compile."
- **E:** add `return yield*` on fail branches; recover with `catchTag`/`catchTags`; wrap foreign throws with `try`/`tryPromise` and a tagged error that keeps `cause`.
- **Defects:** do not `mapError` a defect. Fix the throw, or handle `Cause` only at the reporting boundary.
- **Discarded Effects:** `yield*` or `.pipe` them. `Effect.logError(...)` as a statement is a bug.

## Step 4: Prove the fix

Run the narrowest `tsc --noEmit` and the failing `it.effect`. If time is involved, `TestClock.adjust` after fork. If the original failure was a missing service, the test Layer must still expose it (`provideMerge`) when the test `yield*`s it.
</process>

<success_criteria>
This workflow is complete when:

- [ ] Root cause named in terms of `A` / `E` / `R` / Cause — not "TypeScript being annoying"
- [ ] Fix does not introduce `any`, `as never`, or a v3-compat shim
- [ ] Same symptom cannot recur from the same pattern in the touched files
- [ ] Typecheck + the reproducing test pass
</success_criteria>
