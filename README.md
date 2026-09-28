# HousePlan CLI

Deterministic, local-first 2D house-plan CLI for LLMs and humans. The plan JSON is editable source of truth; SVG is a shareable render.

## Quick start

```bash
pnpm install
pnpm build
pnpm cli init --out my-house.json
pnpm cli apply --plan my-house.json --input examples/reference-ground-floor-ops.json --expected-revision 0
pnpm cli validate --plan my-house.json
pnpm cli render --plan my-house.json --level ground --out my-house.svg
```

Send `my-house.svg` as the floor-plan image. Open it in any modern browser first if you want to inspect it.

## Modify a plan

Create an operations JSON document and apply it with the current revision from the previous result. Supported operations are:

- `level.upsert`
- `wall.upsert`
- `room.upsert`
- `opening.upsert`
- `object.upsert`
- `stair.upsert`
- `void.upsert`

All public dimensions are centimetres in 0.1 cm steps. Use `--dry-run` before writing. Invalid operations are rejected without changing the plan. The reference operation file builds a 9 m × 11 m ground floor: the stair hall has a hosted door into dining, while a short `dining-living-stub` leaves an open passage rather than a fake door. For rectangular open-plan zones, an interior wall's free end is extended *only for room-boundary derivation* to the nearest perpendicular authored wall; no extension is persisted or drawn. The physical gap supplies pass-through access. Room seeds must remain strictly inside a unique derived zone; this is not a general polygon/curved-wall engine.

```bash
pnpm cli apply --plan my-house.json --input changes.json --expected-revision 1 --dry-run
pnpm cli apply --plan my-house.json --input changes.json --expected-revision 1
```

Run `pnpm cli --help` for human-readable command help; `pnpm cli commands` and `pnpm cli schema` return discoverable JSON.
