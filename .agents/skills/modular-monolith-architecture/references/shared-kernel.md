# Shared Domain Kernel

Use a shared kernel when multiple modules use the same stable domain concepts
with the same meaning.

## What Belongs

Good candidates:
- branded IDs and value objects used consistently across modules,
- stable enums or discriminated unions with one meaning,
- schemas for concepts that truly belong to the shared language,
- pure functions that enforce shared invariants.

Bad candidates:
- provider response shapes,
- UI state,
- module-specific errors,
- repository interfaces,
- helpers that merely avoid duplication,
- concepts whose meaning differs by feature.

## Keep It Small

The kernel is shared cost. Every change can affect multiple modules, so make it
boring and stable.

Rules:
- No IO.
- No imports from feature modules.
- No project-provider vocabulary unless it is the domain's vocabulary.
- No dumping ground names like `utils`, `shared`, or `helpers`.
- Every exported symbol has at least two real consumers.

## When Meaning Splits

If the same word starts meaning different things in different modules, stop
expanding the kernel. Move the concept back into each module or add translation
at the boundary.

Example:
- `Customer` in billing and `Customer` in support may not be the same model.
- `Place` from a provider and `Place` in a trip plan may need translation rather
  than sharing one type.

## Testing

Test kernel invariants directly and through consuming module behavior. Do not
create production-only exports for test setup.
