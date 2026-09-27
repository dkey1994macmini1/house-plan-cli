# Simple Layered Modular Monolith

Use this for personal MVPs, throwaway products that may grow, or one core
workflow where most parts change together.

## Shape

Follow the real folder names from AGENTS.md. A common shape is:

```text
src/
  app/      # app bootstrap, composition, route tree
  domain/   # pure domain rules, value objects, schemas
  server/   # HTTP/API entry points and server wiring
  ui/       # components, screens, client state
```

This is a starting point, not a law. Keep it small until change pressure proves a
stronger boundary is needed.

## Rules

- Domain code has no direct IO: no fetch, DB client, process env, timers, or SDKs.
- Server/UI code can orchestrate IO and call domain behavior.
- Validation belongs at trust boundaries and can reuse domain schemas when the
  domain owns the concept.
- Shared helpers stay local until two real call sites need them.
- Do not create feature folders, ports, repositories, or contract tests just
  because the project may need them later.

## When To Evolve

Move from simple layered to feature modules when:
- a second user-visible capability appears,
- two areas start changing independently,
- terms begin meaning different things in different areas,
- files grow because unrelated workflows share one layer folder.

Move one boundary at a time. Keep the old behavior passing while the structure
changes.
