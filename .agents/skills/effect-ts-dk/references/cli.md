<overview>
v4 CLI lives in `effect/unstable/cli` (breaking changes allowed in minors). Handlers are Effects; the process entry is `NodeRuntime.runMain` / `BunRuntime.runMain`. On v3, `@effect/cli` — grep installed source, do not paste these snippets.
</overview>

<install>
v4: `effect` already contains unstable CLI. Runtime + FS/terminal services still come from the platform package:

```bash
pnpm add effect@rc @effect/platform-node   # or @effect/platform-bun
```

Those `@effect/*` versions must match `effect`. Verify `Command.make` / `Argument` / `Flag` against `node_modules/effect/src/unstable/cli` before copying.
</install>

<patterns>
Thin command, fat service. Parse args → call a service → print. Business rules do not live in the handler.

```ts
import { Argument, Command, Flag } from "effect/unstable/cli"
import { Console, Effect, Layer } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"

const name = Argument.string("name").pipe(Argument.withDefault("World"))
const shout = Flag.boolean("shout").pipe(Flag.withAlias("s"))

const greet = Command.make("greet", { name, shout }, ({ name, shout }) =>
  Effect.gen(function* () {
    const users = yield* Users
    const message = yield* users.hello(name)
    yield* Console.log(shout ? message.toUpperCase() : message)
  }),
).pipe(Command.withDescription("Say hello"))

const app = Command.make("mycli").pipe(
  Command.withDescription("…"),
  Command.withSubcommands([greet]),
)

const cli = Command.run(app, { name: "mycli", version: "1.0.0" })
const MainLive = Users.layer.pipe(Layer.provideMerge(NodeServices.layer))

cli(process.argv).pipe(Effect.provide(MainLive), NodeRuntime.runMain)
```

`--help` / `--version` are built in. Every command/arg/flag that users see needs `withDescription`.
</patterns>

<config>
| Kind | API |
|------|-----|
| Positional | `Argument.string` / `integer`; `.optional`; `.withDefault`; `.variadic()`; `.atLeast(1)` |
| Named | `Flag.boolean` / `string` / `integer` / `choice("format", ["json", "yaml"])` |
| Alias | `Flag.withAlias("v")` |
| Brand/schema | `Argument.withSchema(UserId)` — decode at the CLI edge, pass branded `Type` inward |
| Nest | `Command.withSubcommands([...])` |
| Run | `Command.run(cmd, { name, version })` then platform `runMain` |

Flags are named options; arguments are positional. Keep handlers `Effect<void, E, R>` and provide `R` **once** at the entry Layer — same rule as HTTP `ManagedRuntime`.
</config>

<guidelines>
- `Console.log` / `Console.error` at the CLI edge is the user surface. Domain code still uses `Effect.log` for structured diagnostics.
- `process.argv` is allowed **only** at `Command.run`. Everything below takes parsed config.
- Map tagged `E` to stderr + non-zero exit inside the handler (or rely on `runMain` teardown) — do not `runPromise` + `process.exit` by hand.
- `Argument.withSchema` is the decode boundary; do not `as UserId`.
- Do not use `ServiceMap.Service` (stale). Do not default domain records to `Schema.Class` because a CLI tutorial did.
- Bun: `BunServices.layer` + `BunRuntime.runMain`. Node: `NodeServices.layer` + `NodeRuntime.runMain`.
</guidelines>
