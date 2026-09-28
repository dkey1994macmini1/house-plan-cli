---
name: house-plan-cli-dk
description: Use when an agent needs to create, edit, validate, inspect, survey, or render a 2D house plan with the house-plan CLI.
---

<objective>
Operate the repository's `house-plan` executable to turn explicit layout decisions into a versioned HousePlan JSON and SVG previews. The CLI checks geometry; the agent, not the CLI, decides the layout and corrections.
</objective>

<essential_principles>
- Work from the repository root. Use `pnpm cli <command>` in development (or the built `house-plan <command>` after installation). `pnpm cli` prints pnpm banners in addition to the CLI's JSON; for clean machine parsing use `node dist/bin.js <command>` after `pnpm build`. Never parse pnpm's combined output as one JSON document.
- Treat the plan JSON as the source of truth; SVG is derived. Public coordinates and dimensions are centimetres on a 0.1 cm grid, X right, Y up. Do not silently snap, resize, or repair authored geometry.
- All changes go through `apply --input` with a JSON **array** of operations and `--expected-revision`; batch related edits because validation checks the resulting plan as a whole. `--dry-run` does not persist or advance the on-disk revision; inspect its diagnostics before the real apply.
- Read the current revision immediately before a write. On exit 5 `revision_conflict`, reread the plan and re-evaluate the intended edits; never blindly replay with a new number. On any failed write, inspect stderr's structured `error` and correct the input; do not assume partial success.
- Only claim a valid plan when `validate` returns `data.valid === true`; its exit 0 alone is not proof. Render only after validation. Neither validity nor SVG certifies building-code compliance.
- Understand a plan with `survey`, not by reconstructing it from `report`. `survey` is the spatial reading (rooms, unique face area, connections). `report` is the full resolved geometry. Sum `faceAreaCm2`, never `roomClaimAreaCm2`, when two rooms share a `faceId`.
- Do not claim this CLI supports `--json`, `--format text`, stdin `-`, single-resource commands, deletion, PDF, layout generation or auto-fixes: these are not implemented in the current executable. Check `commands` and `schema` again when upgrading the repo.
</essential_principles>

<schema_facts>
- Every storey-local operation (wall/room/opening/object/annotation/dimension upsert) requires a `level` field in addition to `entity`; omitting it fails schema validation with `is missing`.
- Openings: `variant` accepts `single`, `sliding`, `fixed`, `casement`; `hinge` (`left`/`right`) and `swing` (`in`/`out`) apply only to hinged doors. `offset` is measured from the wall's canonical start in the AUTHORED a→b direction.
- Room `type` is a free string; known-good values include bedroom, bathroom, kitchen, circulation, dining, living, porch, utility, garage.
</schema_facts>

<lessons>
- Faces are closed rectangles derived from wall segments: every room zone must be fully enclosed by wall centerlines (a dangling horizontal wall endpoint only virtually extends to the nearest perpendicular wall for zoning). A corridor whose boundary wall stops short leaves ROOM_FACE_NOT_FOUND; extend the wall or add a perpendicular closing wall.
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
- Diagnose rejection, inspect a draft, or export SVG → `workflows/inspect-render.md`. Read `references/survey.md` before describing what the plan is.
- For the exact command/exit/envelope contract → `references/cli-contract.md`.
</routing>

<reference_index>
- `references/cli-contract.md` — actual executable commands, outputs, failures and revision handling.
- `references/survey.md` — how to read `survey` output as a floor plan.
- `references/operations.md` — operation shapes, topology, circulation and corrections.
</reference_index>

<success_criteria>
- The final plan was read back and validated; `data.valid` is true and any warnings were reported.
- The final revision and output paths come from real CLI output, not assumed increments.
- Requested SVG files exist after `render`; the user gets the plan path and render path(s), with limitations disclosed.
</success_criteria>
