# Furniture Review Workflow

<required_reading>
Read references/review-packet.md and references/operations.md for the affected openings. Use the latest task delta and source-SHA evidence; full research references are conditional.
</required_reading>

<process>

> MANDATORY evidence review after a change to rooms, walls, doors, windows or furniture obstacles. A local correction uses an affected-zone inventory delta plus a full fixed-goal route rerun; a new arrangement requires all object reasons. Independent subagents are optional, not part of every revision's critical path. `valid=true` proves hard geometry only.

## Why this exists

Real failure (2026-09-29, r4→r5 house A): rooms in the private wing were rotated, but furniture coordinates were carried over unreviewed. The wardrobe at the entrance ended 40 cm from the entry door threshold, right in the walking line (needed ≥90 cm). The CLI could not flag it — nothing physically collided. The plan rendered clean, the survey was valid, and the mistake surfaced only when the user looked at the drawing.

Rule: **every object position must be justified at the moment it is authored or re-verified, not inherited from a previous revision.**

## Step 1 — Mandatory inventory (do this yourself, before subagents)

Generate bboxes and connection evidence with `scripts/review_packet.py`; reuse source-SHA-linked reasons for unchanged objects and re-verify objects in affected neighborhoods. Record moved/new/removed objects with reason and disposition; do not regenerate all prose for a chair label. Re-run the full unchanged set of route goals after each obstacle change. For a new whole-house arrangement, list every object from the plan JSON and write one line per object:

```
object | position | why it stands HERE | what changed in this revision near it | verdict: keep / move / review
```

Do the inventory from the JSON bbox dump, not from the render: compute each object's footprint in Python (center ± half of width/depth with the rot 90/180/270 swap applied) and read positions off that table. Eyeballing the SVG re-introduces the exact orientation errors the reviewer pass is designed to catch.

Check each object against:

1. **Doors** — leaf swing arc, threshold clearance in the walking direction, ≥90 cm passage between the door and the nearest object on the entry path. An object that faces an entry door head-on is a defect unless deliberate (e.g. console table).
2. **Windows** — the furniture must not block daylight the room needs for its stated function (desk under a window is usually right; wardrobe across a window is wrong; a window hidden behind a tall object is wrong unless flagged).
3. **Walking flows** — walk the daily routes through the plan: entry → kitchen (with shopping), entry → private wing, salon → terrace, each bedroom → its bathroom, kitchen → table serving, guest → WC, plus any garage → mudroom route if the plan has one. State the clearance for the tightest point of each route.
4. **Function of the room** — each object supports the stated activity (sleeping, working, cooking, training, storage). An object whose reason vanished with the re-layout must be moved or removed in the same revision.
5. **Seating at the table / island** — chairs counted, spacing, whether a seated person blocks a route.
6. **Appliance/fixture completeness** — a bathroom or kitchen whose model has no WC/umywalka/pralka objects is not "fine": check the program for fixtures the plan omits, and add them as objects (with their real footprint) rather than claiming the room is done around a missing fixture. If a fixture genuinely cannot fit, surface that as an explicit program-level finding, not a quietly missed object.

If any verdict is not `keep`, fix the position in this revision — do not defer it to "do testu" if you can decide it now with the information you have.

## Step 2 — Optional bounded independent review

The parent numeric/affected-zone review is the default and remains mandatory. Use `scripts/review_packet.py` with fixed task goals before delegation. Do not fan out three reviewers after every minor change: if the parent gate fails, fix the layout first. If one named uncertainty remains, send one bounded reviewer (specific zone + source hash + compact coordinates, max3 substantive findings). Broad multi-angle review is reserved for explicit user requests or a justified full-house audit. Respect requests for minimal/no delegation. An interrupted review is not PASS; continue parent-only instead of restarting the same fan-out.

If an explicitly requested full review warrants three reviewers, give each the SAME context: plan SVG render path, plan JSON path, level name, and this instruction: "report findings as a list, each with exact object name, room, estimated coordinates, and one-line fix; do not propose wall/room changes, only furniture and openings."

- **Reviewer A — circulation & flow**: walks every daily route on the render; checks swings vs furniture, clearance widths, entry-zone logic, table/island service paths, guest routes not crossing private rooms.
- **Reviewer B — ergonomics**: reach of fronts/appliances/closets, standing space at counters (min 100–120 cm in front of fronts), bed/biurko clearances, wardrobe depth and door conflicts, shower/tub access.
- **Reviewer C — light & sightlines**: furniture vs windows (blocking, glare for screens), door sightlines (what a guest sees on entry — should be the commons, not a bathroom), terrace doors, position of storage in dark corners vs light zones.

Rules for the parent agent:

- Reviews are SELF-REPORTS. Verify each finding against the plan coordinates before acting — never apply a suggestion by faith.
- Require overlap in BOTH axes before treating a projected gap as a bottleneck. Dining chairs far south of a kitchen counter are not island seating; subtracting only their X coordinates invents a collision. Likewise, test a proposed partition against the parked car and every adjacent connected face before calling a garage re-zoned.
- Keep baseline clear dimensions, wall-axis areas, and proposed dimensions separate. Never convert a stated goal for one office into an unapproved minimum for both, or mistake a explicitly labelled wall-axis area for a calculation error.
- Distinguish a missing modeled appliance, a failed verified layout, and a specialist unknown. Do not call a whole kitchen functional without its sink/refrigerator/cooktop/dishwasher and front operation, but do not declare zero daylight or compulsory mechanical ventilation from absence of a local window. Apply daylight heuristics only inside their single-/multi-sided glazing, head-height, reflectance and climate scope.
- Treat foreign clearance guidance as a benchmark with its original measurement endpoints, not a Polish legal PASS/FAIL. Distinguish clearance from table edge, space behind a chair, work aisle, and finished doorway opening.
- For numerical route probes, include exact opening centers and test continuous swept edges; a coarse grid can falsely fail a corridor equal to the modeled body width. Exercise entrance→private wing and living→guest WC, not just entrance→living. Label the body model and open-door state; BFS on unequal grid edges does not prove shortest metric distance. Test a door fix against every relevant destination so solving northbound access does not silently block the living route.
- **Image-based reviews misread orientation.** Reviewers (and vision models) reading the SVG/PNG confuse east/west (axes may appear flipped), door hinge sides, and swing directions. Mitigation that works (proven 2026-09-29, 3 reviews on r5): (1) give every reviewer the computed bounding boxes from plan JSON — a Python snippet dumping each object as `name [x0..x1, y0..y1] rot=N` plus a computed opening/sweep table — alongside the render; (2) DEMAND each finding cite numbers, not appearance: a finding is void unless the collision/misposition is confirmed from coordinates; (3) treat a reviewer's correction of YOUR OWN brief as signal, not noise (they read real JSON values — e.g. they fixed an assumed window position from the plan). Documented reviewer error modes: misidentified swing leaf (blamed a bed for a door that opens away), misread furniture wall side on render, invented window positions not in the plan.
- Consolidate findings into one list, dedupe, then fix in a single `apply` batch (furniture moves need only `object.upsert`; batch them together with any opening tweaks).
- After applying fixes: re-run `validate`, re-render, and confirm each finding is actually resolved on the new render (visual check via PNG thumbnail of the SVG, e.g. `qlmanage -t`) — but treat the render check as a geometry sanity pass only; if the vision model "sees" a conflict that the coordinates disprove, the coordinates win.

## Step 3 — Report format

To the user, report: inventory count, findings found (count), findings fixed (count), findings accepted as-is with reason, and remaining open questions. Never present the revision as "done" while any finding is unfixed without an explicit reason.

## What NOT to do

- Do not satisfy an arrival-route requirement by turning a pantry, office, bathroom or dirty garage into compulsory circulation unless residents explicitly chose that program change. Preserve room roles and verify the route against actual work zones, not renamed labels.

- Do not move furniture to satisfy a reviewer without checking the plan's own brief (the household's stated priorities outrank generic best practice).
- Do not use the review to change the room program — that is a user decision.
- Do not skip Step 1 because Step 2 exists: the subagents see the render, not your reasoning; your inventory is the record of intent.
</process>

<success_criteria>
- SHA-linked inventory/delta and actual connection/facade evidence exist.
- Fixed same-body route goals and relevant open fronts rerun; no goal silently moved/dropped.
- All findings reconciled with coordinates; optional reviewer claims are not accepted by faith.
- Final artifact is readable, sources preserved and unknown/failed gates explicitly reported.
</success_criteria>