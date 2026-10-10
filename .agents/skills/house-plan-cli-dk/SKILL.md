---
name: house-plan-cli-dk
description: Use when an agent needs to create, edit, validate, inspect, survey, or render a 2D house plan with the house-plan CLI.
---

<objective>
Operate the repository's `house-plan` executable to turn explicit layout decisions into a versioned HousePlan JSON, technical/presentation SVG previews, and offline PNG exports. The CLI checks geometry; the agent, not the CLI, decides the layout and corrections.
</objective>

<essential_principles>
- Work from the repository root. Build once only when dist is missing/stale after source changes; reuse a verified build during local plan edits. Invoke every command as `node dist/bin.js <command>`. Do not use `pnpm cli`: pnpm prints banners around the JSON envelope. Rebuild after pulling source changes.
- Treat the plan JSON as the source of truth; SVG is derived and PNG rasterizes that same SVG. For user-facing images use `--style presentation --format png --width 2400`; default rendering stays technical SVG. Rendering never edits the plan or infers geometry from notes. Inspect the fresh PNG before delivery; follow `workflows/present-plan.md`. Public coordinates and dimensions are centimetres on a 0.1 cm grid, X right, Y up. Do not silently snap, resize, or repair authored geometry.
- All changes go through `apply --input` with a JSON **array** of operations and `--expected-revision`; batch related edits because validation checks the resulting plan as a whole. `--dry-run` does not persist or advance the on-disk revision; inspect its diagnostics before the real apply.
- Read the current revision immediately before a write. On exit 5 `revision_conflict`, reread the plan and re-evaluate the intended edits; never blindly replay with a new number. On any failed write, inspect stderr's structured `error` and correct the input; do not assume partial success.
- Only claim a valid plan when `validate` returns `data.valid === true`; its exit 0 alone is not proof. Render only after validation. Neither validity nor SVG certifies building-code compliance.
- Understand a plan with `survey`, not by reconstructing it from `report`. `survey` is the spatial reading (rooms, unique face area, connections). `report` is the full resolved geometry. Sum `faceAreaCm2`, never `roomClaimAreaCm2`, when two rooms share a `faceId`.
- Do not claim this CLI supports `--json`, `--format text`, stdin `-`, single-resource commands, PDF, layout generation or auto-fixes: these are not implemented in the current executable. Check `commands` and `schema` again when upgrading the repo.
- `init` refuses to overwrite an existing file. Use `apply` for an existing plan.
- Valid door variants are `single`, `double`, and `sliding`; hinged doors require both `hinge` and `swing`. Valid window variants are `fixed`, `casement`, `tilt-turn`, and `sliding`.
- Every furniture position must be JUSTIFIED, not inherited: state WHY each object stands where it does (relation to door, window, daylight, view line, walking flow, reach of adjacent front/appliance). When a re-layout moves rooms, walls, doors or windows, run `workflows/furniture-review.md` before presenting the revision as done — carrying furniture coordinates across a room rotation is the known failure (r4→r5: wardrobe blocking the entry door because positions were carried from r4 unreviewed).
- A visually important deliverable needs a real PNG readability gate after tests: green geometry/unit tests do not detect header collisions or oversized labels. Keep all wall/door/object calculations in the existing CLI renderer; do not clone them into Pillow. Use bounded labels and a keyed legend rather than spilling text over a fixture.
- The CLI guarantees only hard geometry (block–wall, block–block, door-sweep collisions). It does NOT check circulation, clearance widths, opening swings of fronts, or furniture daylight/view relationships — those gaps surface through the review workflow, not through CLI diagnostics.
</essential_principles>

<schema_facts>
- Every storey-local operation (wall/room/opening/object/annotation/dimension upsert) requires a `level` field in addition to `entity`; omitting it fails schema validation with `is missing`. Storey-local removes take `level` + `name`; `level.remove` takes only `name`.
- Openings: `hinge` (`left`/`right`) and `swing` (`in`/`out`) are required for `single`/`double` doors and rejected for `sliding` doors and all windows. `offset` is measured from the wall's canonical start in the AUTHORED a→b direction.
- Room `type` is a free string; known-good values include bedroom, bathroom, kitchen, circulation, dining, living, porch, utility, garage.
</schema_facts>

<lessons>
- Faces are closed orthogonal polygons (rectangles, L and T shapes) derived from wall segments: every room zone must be fully enclosed by wall centerlines (a free interior wall endpoint only virtually extends to the nearest perpendicular wall for zoning). A corridor whose boundary wall stops short leaves ROOM_FACE_NOT_FOUND; extend the wall or add a perpendicular closing wall.
- An upper-floor room needs no exterior door when a connecting stair run lands in its face: the run must occur on exactly two levels (lower `up`, upper `down`, identical bounds) and the upper occurrence must sit inside a void.
- Circulation connects faces ONLY through doors and physical gaps between walls on a shared edge — windows never provide access, and virtual zoning extensions are not barriers. If all rooms report ROOM_NOT_REACHABLE/ROOM_WITHOUT_DOOR at once, the daily zone was sealed: add a door (even wide, 120–140 cm) on the separating wall.
- Door swings that collide with furniture flip by authored direction: on a wall authored left→right (+x), `in` opens north, `out` south; on a wall authored bottom→top (+y), `in` opens west (left), `out` east (right).
- Garage doors as variant "single" with swing collide with parked cars; use variant "sliding" with no hinge/swing.
- Open-plan living/kitchen/dining: one big zone with room seeds works when interior walls or gaps delimit sub-rectangles, but a free-floating partition stub inside the zone can leave a face unclosed — anchor the stub between perpendicular walls or accept a single shared face.
</lessons>

<quick_start>
Read `references/cli-contract.md`, then follow the matching workflow. Start discovery with `node dist/bin.js commands` and `node dist/bin.js schema` (build first). To see an existing plan, run `node dist/bin.js survey --plan plan.json` and read `references/survey.md` before describing it. To start a plan: `node dist/bin.js init --out plan.json`, then supply an operations JSON file to `apply --plan plan.json --input ops.json --expected-revision 0 --dry-run`. See `workflows/author-plan.md` for the complete safe sequence.
</quick_start>

<routing>
- Create or modify a plan → `workflows/author-plan.md`; read `references/operations.md` before constructing operations.
- Diagnose rejection, inspect a draft, or export technical SVG → `workflows/inspect-render.md`. Read `references/survey.md` before describing what the plan is.
- Deliver a presentation SVG/PNG → `workflows/present-plan.md`; validate first and perform a visual readability gate.
- Review furniture placement after any room/opening re-layout → `workflows/furniture-review.md` (mandatory evidence + affected-zone inventory).
- Generate a read-only evidence packet and fixed-goal checks → `references/review-packet.md`, `scripts/review_packet.py`.
- Resume a revision → fill `templates/revision-checkpoint.json` with real paths/revision/hash and use the last verified gate (template is not an operations array).
- For the exact command/exit/envelope contract → `references/cli-contract.md`.
</routing>

<reference_index>
- `references/cli-contract.md` — actual executable commands, outputs, failures and revision handling.
- `references/survey.md` — how to read `survey` output as a floor plan.
- `references/operations.md` — operation shapes, topology, circulation and corrections.
- `references/diagnostics.md` — diagnostic code meanings and corrections.
- `references/limits.md` — executable geometry and lifecycle limits.
- `references/geometry-pitfalls.md` — detailed topology/opening lessons loaded on demand.
- `references/review-packet.md` — reusable helper inputs, exits and limits.
- `workflows/furniture-review.md` — mandatory evidence and affected-zone furniture review before a revision is presented as done.
</reference_index>

<success_criteria>
- The final plan was read back and validated; `data.valid` is true and any warnings were reported.
- The final revision and output paths come from real CLI output, not assumed increments.
- Requested SVG/PNG files exist and open after `render`; the user gets the real revision and output paths, with limitations disclosed. Source plan bytes remain unchanged by rendering.
</success_criteria>
