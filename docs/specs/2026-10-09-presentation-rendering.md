# Presentation rendering and offline PNG export

## Approved scope
Damian approved moving the Pillow prototype's visual style into house-plan-cli, retaining a single geometry source and documenting the workflow in the operating skill. Separate approval given for @resvg/resvg-js 2.6.2 (MPL-2.0) as an offline SVG→PNG adapter. No remote rendering service, no Python dependency, no edits to the private house plan.

## Baseline
Branch feat/house-plan-operating-skill. Pre-existing local changes: modified .agents/skills/house-plan-cli-dk/SKILL.md and untracked workflows/furniture-review.md; preserve them. Baseline pnpm check passes 53 tests in 5 files. Node>=22, Effect 3.22.2, Vitest3.2.7. Existing renderer src/modules/render/svg-renderer.ts and domain WallSegment/PlanObject own geometry.

## Public CLI contract
Keep existing render invocations and output envelopes compatible. Add:
- --style technical|presentation, default technical.
- --format svg|png, default svg. Explicit selection; do not infer from a path suffix.
- --width positive bounded integer, PNG pixel width, default2400, upper bound8192. Reject explicit --width on SVG, and constrain total image pixels/aspect-derived height to avoid memory explosion.
- Both single-level (--level + --out) and all-levels (--all-levels + --out-dir) work with the new style and format.
- Errors: one JSON envelope on stderr, empty stdout;2 invalid arguments/invalid plan/render configuration,5 unknown level,1 infrastructure failure. Do not change legacy output types or schemaVersion1. No new --json flag (already JSON-only tool).
- Update commands discovery, help descriptions, README, operating skill references and workflows together.

## Presentation requirements
- Same wall/opening/object/stair geometry as technical SVG. Reuse domain geometry and SVG layers; no duplicated door/rotation formulas and no reading unrelated scratch survey files.
- Warm neutral background and floor palette, cool bathroom tint, muted office green, furniture fill/icons within authored footprints; dimensions and north reference.
- Readable multi-line labels placed deterministically avoiding walls and furniture where possible. One area label per unique face in an open-plan zone, not duplicate area claims. Mark areas as wall-axis/model areas, not legal usable area.
- Revision and level heading; scale; all dimensions/annotations visible or routed to a bounded-width notes area included in the SVG viewport. No clipped metadata or long Polish labels. Do not invent terrace geometry, hidden storage, window height or architectural compliance based on annotation prose.
- Read supplied object labels and room types, fallback gracefully for unknown names/types. No hardcoded Damian rooms, pantry width, counts, constraints, paths or font locations.
- Technical rendering remains default and retains current layer identifiers and behavior.
- PNG adapter rasterizes the exact generated SVG, never redraws plan primitives; offline only, no resource downloads at render time. Portable licensed font strategy (bundle a redistributable font with its licence if needed), not macOS Arial paths.
- Show invalid drafts clearly when --allow-invalid is explicitly requested, preserve diagnostic envelope. Reject invalid plans by default without creating output.

## Architecture
Use existing module-first structure in AGENTS.md. Small cohesive rendering components; no new framework or domain redesign. Introduce only an active rasterization adapter/port, wired into CLI runtime. Effect v3 composition at existing boundaries; preserve typed failures and causes. Rasterization library imports stay at the rasterization edge. Do not copy the Python sketch engine.

## Tests and acceptance
TDD: observe targeted new tests fail first. Behavior tests cover default compatibility, new flags and errors, both styles/PNG and SVG, all-level exports/manifests, correct image signature and size, input hash unchanged. Geometry tests cover rotated furniture, all hinged door directions, shared faces, labels/annotations/XML escaping, bounds. PNG tests exercise a real native rasterization and Polish text/portable font path. Full pnpm check and pnpm build must pass.
Parent must render the current private plan using the real built CLI, inspect final PNG visually, verify source plan hash unchanged, and deliver a working PNG to Damian. Do not commit/push/publish without additional request. Specific cabinet-front illustrations remain separate from house-plan core.
