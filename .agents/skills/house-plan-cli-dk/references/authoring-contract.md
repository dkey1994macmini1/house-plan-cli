<overview>
Read before constructing operations. Keep geometry/schema details out of the router; use `references/geometry-pitfalls.md` for topology/opening changes and failures.
</overview>

<schema_facts>
- Storey-local wall/room/opening/object/site/annotation/dimension upserts require `level` + `entity`. Storey-local removes require `level` + `name`; `level.remove` takes only `name`.
- Wall `kind`: `"exterior" | "interior" | "virtual"`. Physical walls (`exterior`/`interior`) require `thickness > 0`; `virtual` walls default to `thickness: 0`, split open-plan zones into distinct faces for room areas/labels, act as open passages in circulation, cannot host openings, and do not collide with objects.
- Site elements (`site.upsert` / `site.remove`): `variant` is `"terrace" | "porch" | "driveway" | "eaves" | "column" | "entry_arrow"`. Provide rectangular `bounds` or polygon `points` (≥3 points, e.g. for an L-shaped terrace or roof eaves outline), plus optional `direction` (`north`/`south`/`east`/`west`) for `entry_arrow`.
- Object `kind` (optional on `object.upsert`): `"car" | "bed_double" | "bed_single" | "sofa_corner" | "dining_set" | "desk" | "bathtub" | "shower" | "toilet" | "sink" | "double_sink" | "kitchen_island"`. When `kind` is set and `label` is `""`, the renderer draws the clean architectural symbol without an `O#` legend key.
- Door variants: `single`, `double`, `sliding`. Window variants: `fixed`, `casement`, `tilt-turn`, `sliding`.
- `hinge` (`left`/`right`) and `swing` (`in`/`out`) are required for `single`/`double` doors, rejected for sliding doors and all windows. `offset` starts at the wall's AUTHORED a→b start.
- Room `type` is free text; known-good values: bedroom, bathroom, kitchen, circulation, dining, living, porch, utility, garage.
- Public coordinates/dimensions are cm on a 0.1 cm grid, X right, Y up. Never silently snap/resize/repair geometry.
</schema_facts>

<geometry>
`references/geometry-pitfalls.md` is the single home of closed-face, stair/void, door/gap access, authored-direction swing, sliding garage-door and open-plan shared-face lessons. Read it before changing topology/openings, not after repeatedly failing apply.
</geometry>

<bounded_work>
- State one revision goal and acceptance gates. Do not redesign unrelated rooms or CLI tooling without a new requirement.
- Reuse a verified build until executable sources change. JSON-only edits need no rebuild.
- Start with survey; use report for required authored coordinates only. Project large JSON into relevant rooms/openings/diagnostics with code; leave full results on disk.
- Keep one numbered operations batch per intended revision; patch that batch for diagnostic corrections instead of resending whole plans or rereading unrelated history.
- Repeated failure without changed evidence means stop that strategy and name the blocker. After roughly 20–30 tool calls, compare progress to the original goal; this is not an automatic abort/reset.
- Delegate bounded questions with paths, deliverable and stop condition, not open-ended whole-house research unless requested.
- At a completed stage save the real revision checkpoint and a short handoff: chosen plan/revision, decisions, open issues, next gate. Start a fresh session at genuine stage/topic boundaries, not in the middle of warm-context work.
</bounded_work>
