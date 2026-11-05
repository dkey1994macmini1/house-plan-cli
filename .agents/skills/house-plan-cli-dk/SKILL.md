---
name: house-plan-cli-dk
description: Use when creating, editing or reviewing house-plan CLI plans — schema, geometry, openings and render mechanics; design decisions and program gates belong to house-plan-agent-workflow.
---

<objective>
Use the repository's house-plan CLI for versioned HousePlan JSON and derived SVG/PNG. The CLI checks hard geometry; the agent decides layout and remains responsible for circulation, clearances and furniture rationale.
</objective>

<essential_principles>
- Work at the repo root and invoke `node dist/bin.js <command>`; `pnpm cli` adds banners. Build only when dist is missing/stale or executable sources changed, not for plan-only edits.
- The plan JSON is authoritative; SVG/PNG are derived. Coordinates are cm on a 0.1 cm grid (X right, Y up). Never silently snap or repair geometry. `init` must not overwrite an existing plan.
- Every plan edit uses `apply --input` with an operations ARRAY and the freshly read `--expected-revision` (or `transform --mode reflect-x|reflect-y|reflect-diagonal|rotate-90|rotate-180|rotate-270|translate` for whole-plan reflections/rotations/translations — never write ad-hoc JS/Python scripts to mirror or rotate a plan). Batch related edits; inspect `--dry-run` first (no persistence/revision advance; `data.survey` is included directly in both `plan.dry_run` and `plan.applied`). On revision_conflict/exit 5 reread and re-evaluate, never blindly replay. On any failed write inspect structured stderr; do not assume partial success.
- Before rendering require `validate.data.valid === true`, not exit 0 alone; report warnings. Validity is not building-code certification. Read the persisted revision/entities after apply.
- Understand spatial layout with `survey`; use `report` only for required authored coordinates. For a shared face sum `faceAreaCm2` (or `netFaceAreaCm2` for net usable area in the clear of walls), not each room's `roomClaimAreaCm2`. When reproducing a catalog floor plan with net room areas, compare per-room `netAreaCm2` and render with `--area-mode net`. Read `references/survey.md` before describing a plan.
- For open-plan zones (living/kitchen/dining/hall/corridor) that need separate room areas without physical partitions, author virtual boundaries (`wall.upsert` with `kind: "virtual"`) instead of fake partition walls and fake doors. For exterior features (terraces, porches, driveways, roof eaves, columns, entry arrows), use `site.upsert` (`variant: "terrace" | "porch" | "driveway" | "eaves" | "column" | "entry_arrow"`) instead of enclosing terraces with fake exterior walls.
- Justify furniture from doors/windows/daylight/view/flow/reach, not inherited coordinates. Use optional `object.upsert` `kind` (`car`, `bed_double`, `bed_single`, `sofa_corner`, `dining_set`, `desk`, `bathtub`, `shower`, `toilet`, `sink`, `double_sink`, `kitchen_island`) for 2D architectural symbols. After room/wall/opening re-layout run `workflows/furniture-review.md`. Hard block/wall/door-sweep checks do not certify circulation, front clearances or furniture usefulness.
- User-facing render: `--style presentation --format png --width 2400` (add `--area-mode net` when presenting net floor areas, and `--visualize-out <store-root>/visualizations/<slug>.html` in Cursor IDE so the normalized SVG fragment is written directly to disk in <5 ms without streaming SVG tokens through the LLM `Write` tool), then inspect the fresh PNG using `workflows/present-plan.md`. Green tests do not detect label/header collisions. Keep geometry in the CLI renderer, not a Pillow reimplementation; use bounded labels/keyed legends.
- Do not invent `--json`, `--format text`, stdin `-`, single-resource commands, PDF, automatic layout generation or auto-fixes. Recheck `commands`/`schema` on an executable upgrade.
</essential_principles>

<quick_start>
Read `references/cli-contract.md` and the matching workflow. Query `commands`/`schema` for an unknown or changed executable contract. Reuse the known-good build/source paths; return compact relevant data, not full repeated reports.
</quick_start>

<routing>
- Create/modify → `workflows/author-plan.md`; read `references/authoring-contract.md` and `references/operations.md` BEFORE constructing operations. Topology/opening changes or failures → also `references/geometry-pitfalls.md`. When the design is settled, commit the whole mechanical cycle in one call with `scripts/stage_commit.py`.
- Inspect/diagnose/technical SVG → `workflows/inspect-render.md`.
- Presentation SVG/PNG → `workflows/present-plan.md` with validation and visual gate.
- Furniture after re-layout → `workflows/furniture-review.md` (mandatory).
- Read-only evidence packet/fixed-goal checks → `references/review-packet.md`, `scripts/review_packet.py`.
- Resume/finish a stage → `templates/revision-checkpoint.json` with actual paths/revision/hash plus a short handoff. The template is NOT an operations array. A closed stage prefers a fresh session that loads the handoff: a long-running session re-sends its whole history on every call (the top token cost in the 2026-10 audit).
</routing>

<reference_index>
- `references/cli-contract.md` — commands, envelopes, exits/revisions.
- `references/authoring-contract.md` — schema details and bounded revision workflow.
- `references/operations.md`, `references/diagnostics.md`, `references/limits.md` — shapes, errors and limits.
- `references/survey.md` — spatial reading.
- `references/geometry-pitfalls.md` — topology/opening lessons, loaded when relevant.
- `references/review-packet.md` — helper inputs/outputs.
</reference_index>

<success_criteria>
The intended plan/revision was read back; `validate.data.valid` is true and warnings are disclosed. Per-room `areaCm2` (or `netAreaCm2` when matching catalog net areas) vs catalog card checked on the FIRST survey after apply (±0,5 m² gate; evals.md Behavior 1) — never claimed finished on total-valid alone. Requested renders exist, were visually checked and were delivered with actual output paths. Rendering did not change source plan bytes. Report incomplete/invalid drafts honestly.
</success_criteria>
