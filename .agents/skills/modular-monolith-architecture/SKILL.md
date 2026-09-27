---
name: modular-monolith-architecture
description: Use when implementing or reviewing the internal structure of a modular monolith, including simple layering, feature modules, shared kernels, and ports/adapters at volatile edges.
---

<objective>
Provide technique guidance for implementing a modular monolith. This skill does
not decide the project's layout. The project's AGENTS.md is the layout authority;
this skill explains how to implement the selected structure without adding
unneeded ceremony.
</objective>

<quick_start>
Read the project's AGENTS.md first to learn the chosen structure and real folder
names. Then load only the reference that matches the task:
- `references/simple-layered.md` for simple layered monoliths.
- `references/feature-modules.md` for feature/module boundaries.
- `references/shared-kernel.md` for shared domain concepts.
- `references/ports-and-adapters.md` for volatile external/provider edges.
</quick_start>

<essential_principles>
## 1. AGENTS.md Owns Layout

Do not invent or override project layout from this skill. If AGENTS.md says this
project uses `src/domain` plus `src/ui`, follow that. If it says feature modules,
follow that. If AGENTS.md is missing or contradicts installed skills, stop and
ask for the project structure decision.

## 2. Start With the Smallest Structure That Works

Use the selected structure, but do not add optional layers automatically. A
feature module does not imply repositories, fakes, contract tests, or a barrel
file. A port exists only when an active boundary justifies it.

## 3. Wire or Delete

Adapters, providers, caches, repositories, and module APIs must be wired into the
current runtime or explicitly deferred outside the codebase. Do not leave
"ready for later" production modules.

## 4. Keep Domain Invariants Honest

When domain code claims determinism, inject time and randomness. Do not use
`Date.now()` or `Math.random()` in domain logic. When API errors cross a
boundary, use one explicit error envelope rather than casts in client hooks.

## 5. Tests Use Behavior Seams

Prefer public behavior seams: route/API behavior, service behavior, component
behavior, and domain functions. Do not add production props, exported copy
constants, or public test fakes only to make tests convenient.
</essential_principles>

<routing>
| Task | Read |
|---|---|
| Implement a small MVP structure | `references/simple-layered.md` |
| Add or review feature/module boundaries | `references/feature-modules.md` |
| Share stable domain concepts across modules | `references/shared-kernel.md` |
| Isolate provider, SDK, filesystem, clock, random, or DB volatility | `references/ports-and-adapters.md` |
</routing>

<reference_index>
- `references/simple-layered.md` - minimal layered modular monolith.
- `references/feature-modules.md` - feature modules without mandatory anatomy.
- `references/shared-kernel.md` - small shared domain kernel rules.
- `references/ports-and-adapters.md` - ports/adapters only at active volatile
  edges.
</reference_index>

<success_criteria>
Use of this skill is successful when:
- code follows the project layout from AGENTS.md,
- optional layers are justified by current behavior,
- every adapter or port is wired into runtime or removed,
- domain invariants are enforced by code and tests,
- tests exercise behavior without expanding production APIs for test-only needs.
</success_criteria>
