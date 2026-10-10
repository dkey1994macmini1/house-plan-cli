<objective>
Generate one deterministic, read-only evidence packet instead of rewriting bbox, route, appliance and reporting code for each candidate. The helper wraps the existing built HousePlan CLI; it is not a new house-plan command, renderer or optimizer.
</objective>

<usage>
Resolve real paths for REPO, PLAN, CHECKS and NEW_OUTPUT. Run `python3 .agents/skills/house-plan-cli-dk/scripts/review_packet.py --repo REPO --plan PLAN --checks CHECKS --baseline BASELINE --out NEW_OUTPUT` from the owning repository. Omit --baseline if no comparison is needed. Output must not already exist or equal an input; source SHA must stay unchanged. No network/dependency install, stdlib Python3 only. Exit0: requested gates pass; exit2: failed gates with evidence saved; exit1: input/CLI error. No --checks means evidence only, NOT a functional PASS. Build the CLI once when missing/stale.
</usage>

<inputs>
Keep checks beside the task/plan, not in this reusable skill. Schema:
- `level`: exact CLI level name.
- `rooms`, `absent_rooms`: exact strings to require/remove.
- `connections`: list of `{opening, rooms:[sideA, sideB]}`; uses actual surveyed sides, not names alone.
- `window_hosts`: list of `{room, wall}` for verified orientation, not compass labels.
- `private_rooms`: exact names that must have distinct enclosed surveyed faces (full physical boundaries still require inspection).
- `window_facades`: list of `{room,facade}` with N/S/E/W computed from outside-normal and footprint polygons, never host-wall naming. Use this for compass requirements.
- `max_area_m2`: explicit user/baseline design limit for unique face area, not legal usable area.
- `points`: mapping of activity names to `[x_cm,y_cm]`; `origin`: one point name; `body_cm` default80, `grid_cm` default5. Points must lie on the grid; the script refuses silent snapping. For relocated activities record why a new endpoint is equivalent. Never adjust the goal merely to hide a blocked work front.
- `routes`: list of `{from,to,max_m?}`. Limits are task-specific design goals, not regulations. Uniform4-neighbor paths are discrete model lengths. Route evidence includes bends.
- `scenarios`: list of `{name,obstacles:[[x0,y0,x1,y1]],allowed_blocked:[pointNames]?}` for one open appliance front at a time. Specify measured/assumed front direction explicitly; allowed_blocked applies only to its own physically occupied work point, not lost access elsewhere.
All keys are optional except origin when points are present. Set body/goals explicitly for comparisons; the helper never infers a person's position from a room seed.
</inputs>

<outputs>
CLI validation/survey, unique areas/faces/connections, absolute opening segments computed from authored a→b, object bboxes after rotation, source revision/SHA, scenario goals, selected route paths, failed assertions, runtime. Baseline produces area and moved/added/removed-object deltas; baseline travel comparisons need equivalent baseline checks run separately, not merely --baseline. Narrow exterior door end segments compared with wall thickness are review warnings, NOT structural/legal minima. New output only; no plan or baseline edits.
</outputs>

<limits>
- Square-body grid, all door cuts open, zero padding by default; **hinged door leaves/sweeps not modelled**. Run separate swing/leaf checks for hinged-door changes; do not convert them all to sliding symbols to avoid testing.
- Footprint derives from surveyed polygon union, collision from authored thick walls and object AABBs; continuous swept-box checks prevent jumping through thin obstacles between grid nodes. A zoning-only face edge is not automatically a physical partition.
- No finished-door width, human turning, comfort, bed-side operation, cabinet/service access, daylight/acoustics, legal/code/PZT or vehicle maneuver certification. A reachable seed/front point is a tested point, not approval of a whole room.
- No automatic authoring or repairing. Functional findings belong to the parent design decision. Never omit scenarios/future use silently to meet an effort target.
</limits>

<testing>
Run `python3 -m unittest discover -s .agents/skills/house-plan-cli-dk/scripts -p test_review_packet.py`. Exercise real project plans and negative gates without mutation; keep reports local and source hashes unchanged. Fixtures for actual private plans remain in the construction project/scratch, not the reusable skill. A full live-agent turnaround improvement requires later measurement; helper runtime is not an end-to-end speed claim.
</testing>
