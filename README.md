# HousePlan CLI

Deterministic, local-first 2D house-plan CLI for LLMs and humans. The plan JSON is editable source of truth; SVG is a shareable render.

## Quick start

```bash
pnpm install
pnpm build
node dist/bin.js init --out my-house.json
node dist/bin.js apply --plan my-house.json --input examples/reference-ground-floor-ops.json --expected-revision 0
node dist/bin.js validate --plan my-house.json
node dist/bin.js survey --plan my-house.json
node dist/bin.js render --plan my-house.json --level ground --out my-house.svg
```

`survey` is the compact reading: rooms, unique face area, doors, passages, windows, and objects. `report` prints the full resolved geometry. Send `my-house.svg` as the floor-plan image. Open it in any modern browser first if you want to inspect it.

## Presentation images and offline PNG

```bash
node dist/bin.js render --plan my-house.json --level ground --style presentation --out my-house-presentation.svg
node dist/bin.js render --plan my-house.json --level ground --style presentation --format png --width 2400 --out my-house.png
node dist/bin.js render --plan my-house.json --all-levels --out-dir previews --style presentation --format png
```

Default rendering remains technical SVG. PNG is a rasterization of the same SVG, not a second geometry engine. Format is selected explicitly; `--width` is PNG-only (default2400, range1–8192), with derived height and total-pixel memory guards. Success envelopes include the format and PNG pixel dimensions; all-level exports write a manifest. The source plan is unchanged.

Presentation labels count each shared face once, mark model/wall-axis areas rather than legal usable area, and move oversized furniture descriptions into an O-number key. Check the exported image visually before sharing. This does not certify building-code compliance, daylight or real furniture ergonomics.

Rasterization uses @resvg/resvg-js2.6.2 (MPL-2.0) offline. Bundled DejaVu Sans regular/bold font files and their redistribution licence live in `assets/fonts/`; no macOS-specific fonts or Python runtime are needed. Cabinet-front sketches remain separate illustrations, not floor-plan features inferred from prose.

## Modify a plan

Create an operations JSON document and apply it with the current revision from the previous result. Supported operations are:

- `level.upsert`
- `wall.upsert`
- `room.upsert`
- `opening.upsert`
- `object.upsert`
- `stair.upsert`
- `void.upsert`

All public dimensions are centimetres in 0.1 cm steps. Use `--dry-run` before writing. Invalid operations are rejected without changing the plan. The reference operations build a 9 m × 11 m ground floor. The exterior front door opens to the porch, its door connects to the stair hall, and the hall leads to dining and bedrooms. Kitchen and bathroom connect to dining via doors through two named circulation zones. The `dining-living-stub` leaves an open passage rather than a fake door. Validation rejects furniture crossing a wall's physical thickness and named rooms without a door/open-passage route to an exterior entry (per storey); windows do not count. For rectangular open-plan zones, an interior wall's free end is extended *only for room-boundary derivation* to the nearest perpendicular authored wall; no extension is persisted or drawn. The physical gap supplies pass-through access. Room seeds must remain strictly inside a unique derived zone; this is not a general polygon/curved-wall engine. Cross-storey access through stairs is not yet inferred. The CLI rejects a stair footprint that blocks a door's rectangular approach on either side (depth equal to the door width); the reference stairs are 90 cm wide and leave side circulation in the hall. This geometric check does not certify building-code landings.

```bash
node dist/bin.js apply --plan my-house.json --input changes.json --expected-revision 1 --dry-run
node dist/bin.js apply --plan my-house.json --input changes.json --expected-revision 1
```

Run `node dist/bin.js --help` for human-readable command help; `node dist/bin.js commands` and `node dist/bin.js schema` return discoverable JSON.
