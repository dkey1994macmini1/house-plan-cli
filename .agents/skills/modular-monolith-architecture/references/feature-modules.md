# Feature Modules

Use feature modules when the modular monolith has multiple user-visible
capabilities that can change independently but still share one runtime and repo.

## Module Rule

A feature module owns the behavior for one capability. Other modules use its
public API, not its internals.

```text
src/
  features/
    planning/
      index.ts          # public API only
      planning.domain.ts
      planning.service.ts
      planning.routes.ts
      components/
```

AGENTS.md decides the exact folder names. This reference only defines the
boundary behavior.

## Public API

Expose the smallest surface that other modules need:
- commands or use cases,
- stable DTO/domain types,
- route registration if the server composes feature routes,
- UI components only when they are intentionally reusable.

Do not export:
- repositories by default,
- test fakes,
- internal schemas that are not stable public contracts,
- copy constants or helpers used only by tests.

## Optional Files Are Earned

Add a file only when it has a job now:

| File/pattern | Add when |
|---|---|
| `repository` | persistence is in scope and behavior is non-trivial |
| in-memory fake | tests need a verified substitute for a real boundary |
| contract test | two implementations must stay interchangeable |
| `routes` | the feature exposes API endpoints |
| `client`/query hooks | UI consumes remote/server state |
| `components/` | the feature owns UI |
| barrel `index.ts` | another module imports this module |

Avoid mandatory per-feature anatomies. Empty or speculative files become
architecture debt.

## Cross-Module Calls

Prefer:
- module public API,
- a shared kernel type for truly stable shared concepts,
- an adapter/ACL when consuming an external model.

Avoid:
- reaching into another module's internals,
- sharing repositories across modules,
- moving business rules to `common/` because two modules happen to call them.
