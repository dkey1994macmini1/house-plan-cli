# Ports and Adapters at Volatile Edges

Use ports/adapters when an external or volatile concern must not leak into the
domain model: providers, SDKs, databases, clock, randomness, filesystem, queues,
or third-party APIs.

## When a Port Is Worth It

Add a port only when at least one is true now:
- two real adapters are used now,
- a live adapter and a test fake both need a verified contract,
- the external system's behavior materially shapes domain logic,
- policy/compliance/deployment requires swapping the provider without changing
  domain or UI code.

Do not add a port when:
- there is one stable helper and one call site,
- it exists only for future vendors,
- it is not wired into runtime,
- it makes production APIs wider just to help tests.

## Boundary Shape

The domain talks to a small interface in its own language. The adapter translates
between that interface and the external model.

```typescript
// Domain-facing port. Uses domain vocabulary.
export interface PlacesPort {
  searchNearby(query: NearbyPlacesQuery): Promise<PlaceCandidate[]>
}

// Adapter. Owns provider vocabulary and maps it away.
export class OverpassPlacesAdapter implements PlacesPort {
  async searchNearby(query: NearbyPlacesQuery): Promise<PlaceCandidate[]> {
    const response = await callOverpass(query)
    return response.elements.map(toPlaceCandidate)
  }
}
```

Exact file names and dependency injection style belong to AGENTS.md and the
project's stack. The rule is the same: provider shapes stop at the adapter.

## Wire or Delete

Every adapter must be used by the composition root, route wiring, or test setup.
If an adapter is not wired:
- delete it,
- move it to a doc/backlog,
- or mark it out of scope before implementation.

Do not keep "ready for later" adapters in production source.

## Determinism

Treat time and randomness as boundaries when domain behavior depends on them:
- inject clock/random seams,
- seed tests,
- keep `Date.now()` and `Math.random()` out of domain logic.

## Error Boundary

Normalize external failures at the adapter or API boundary:
- provider/network/parser failures become explicit provider errors,
- domain/planner failures stay domain errors,
- client hooks receive one documented API error envelope.

Do not cast raw server errors to convenient client types.

## Testing

Test the port through behavior:
- adapter tests map real provider fixtures to domain values,
- domain tests use fake ports only when the port affects domain behavior,
- contract tests are justified only when two implementations must stay
  interchangeable.
