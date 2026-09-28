# HousePlan CLI — MVP specification

## Problem Statement

LLM-y potrafią opisać układ domu, lecz nie mają stabilnego, deterministycznego narzędzia do tworzenia i korygowania wymiarowanych planów 2D. Dostępne produkty zwykle są zamkniętymi edytorami albo generatorami obrazów; nie zapewniają agentowi jawnego modelu geometrii, powtarzalnych operacji, transakcyjnych zapisów ani maszynowo czytelnej diagnostyki.

Użytkownik potrzebuje local-first CLI, przez które LLM tworzy wstępny projekt domu. LLM podejmuje decyzje layoutowe; narzędzie wyłącznie wykonuje operacje, chroni geometryczne invariants, raportuje jednoznaczne problemy i renderuje techniczny plan 2D.

## Solution

`house-plan` będzie agent-first, deterministic TypeScript CLI zarządzającym jednym wersjonowanym dokumentem `HousePlan` w JSON. Format publiczny używa centymetrów z krokiem 0,1 cm; geometry kernel normalizuje je wewnętrznie do integer millimetres.

Plan obsługuje wiele niezależnych kondygnacji 2D. Każda kondygnacja zawiera ortogonalne ściany o centerline i grubości, derived faces oznaczane jako pomieszczenia, otwory, generic objects, voids, schody, annotations i dimension lines. Program umożliwia atomowe i batch mutations, walidację oraz deterministic SVG rendering. Nie proponuje, nie optymalizuje i nie naprawia layoutu automatycznie.

## User Stories

1. As an LLM agent, I want to create a named multi-level plan document, so that I can author a building through repeatable CLI calls.
2. As an LLM agent, I want to reference an entity by a unique human-readable name, so that I do not need to retain generated UUIDs in every subsequent call.
3. As an LLM agent, I want the engine to generate stable UUIDs, so that identity remains safe when entities are renamed.
4. As an LLM agent, I want to add levels with explicit elevation and deterministic order, so that plans may contain ground floor, upper floors and basement-like levels without a 3D model.
5. As an LLM agent, I want each storey to own its local geometry, so that changes to one floor cannot silently modify another.
6. As an LLM agent, I want to add orthogonal exterior and interior centerline walls with explicit thickness, so that the plan has measurable geometry.
7. As an LLM agent, I want invalid walls, zero lengths and non-orthogonal geometry rejected, so that downstream calculations remain trustworthy.
8. As an LLM agent, I want intersections and T-junctions resolved in derived topology, so that faces can be found without silently changing my authored source walls.
9. As an LLM agent, I want to declare a room by a name, type and seed point, so that the engine can bind it to exactly one derived closed face.
10. As an LLM agent, I want the engine to report unclosed faces and ambiguous room seeds with measured diagnostics, so that I can make the next correction deliberately.
11. As an LLM agent, I want to add doors and windows to an explicit host wall using width and offset, so that opening placement is exact and reproducible.
12. As an LLM agent, I want overlapping or out-of-bounds openings rejected, so that walls retain valid opening geometry.
13. As an LLM agent, I want doors to express type, hinge side and opening direction, so that the SVG communicates intended circulation.
14. As an LLM agent, I want mathematically detectable door-leaf collisions reported, so that I can correct door orientation or nearby geometry.
15. As an LLM agent, I want to add generic labelled rectangular objects with optional explicit clearance, so that early plans can represent equipment without a furniture catalogue.
16. As an LLM agent, I want box, clearance and door-swing collisions detected, so that I can enforce only rules I explicitly modeled.
17. As an LLM agent, I want to add a simple rectangular stair occurrence and a corresponding void, so that multi-level circulation is represented without 3D stair construction.
18. As an LLM agent, I want matching stair occurrences across two levels checked for identity, direction, order and footprint alignment, so that cross-floor connections are not accidentally inconsistent.
19. As an LLM agent, I want explicit annotations and dimension lines, so that I can add technical notes not inferred by the engine.
20. As an LLM agent, I want automatic wall, opening, room and area dimensions in output, so that the technical SVG is readable without manually drawing every dimension.
21. As an LLM agent, I want `apply` to execute a document of operations all-or-nothing, so that a partial batch never corrupts the plan.
22. As an LLM agent, I want every mutation to require `expectedRevision`, so that a stale agent cannot overwrite newer plan state.
23. As an LLM agent, I want rejected mutations to leave the on-disk plan byte-for-byte unchanged, so that retries are safe.
24. As an LLM agent, I want a stable JSON success envelope and structured failure envelope, so that I can parse every command without prose heuristics.
25. As an LLM agent, I want stable error codes, severities, locations, measurements and suggested corrections, so that I can implement a correction loop.
26. As an LLM agent, I want validation to distinguish hard errors from draft warnings, so that I can iteratively author incomplete geometry while preventing invalid final output.
27. As an LLM agent, I want a deterministic resolved JSON output, so that I can inspect derived faces, dimensions and measurements.
28. As an LLM agent, I want deterministic SVG per level and an all-level manifest, so that repeated rendering of unchanged input produces equivalent artifacts.
29. As a human reviewer, I want `--format text` and useful `--help`, so that I can inspect plans and invoke commands manually.
30. As a maintainer, I want the CLI contract and JSON Schema discoverable from the executable, so that other agents can integrate without source-code reading.

## Implementation Decisions

### Product boundaries

- The package and executable are named `house-plan`; the document model is `HousePlan`.
- The tool is local-first and stores one authoritative `plan.json` document. It has no database, network API or credentials.
- The tool is a geometry execution and validation engine, not a layout generator. It never proposes room placement, optimizes the design, silently snaps, clamps, resizes or relocates user geometry.
- A plan is conceptual only. The tool does not claim legal/code compliance and includes no jurisdictional rule packs in the MVP.

### Technical stack

- Runtime: `effect@3.22.x`, `@effect/cli@0.77.x`, `@effect/platform-node`.
- Effect Schema is the source of truth for domain input/output schemas and emitted JSON Schema.
- Testing uses `vitest@3.2.7` and `@effect/vitest@0.30.x`, which are compatible with Effect v3. `node:child_process` remains the real-process boundary for CLI integration tests; `node:fs` owns persistence fixtures.
- SVG is emitted as deterministic XML by the renderer. PDF is deferred.
- Do not use floating decimal, polygon-clipping, robust-predicate or browser automation in the MVP.

### Data and coordinate conventions

- Public JSON accepts and persists dimensions in centimetres, with a maximum resolution of `0.1 cm`.
- Geometry kernel uses branded integer millimetres internally. Non-finite or non-grid values fail schema validation.
- Coordinates use a mathematical axis: positive X right and positive Y up. The renderer performs any SVG Y inversion only at output boundary.
- UUIDs are generated by the engine. Every entity has a required, unique `name` within its applicable namespace; commands accept a UUID or name but reject ambiguity.
- `revision` increments exactly once after any successful mutation. Mutations require `expectedRevision`.

### Multi-level document model

- `HousePlan` owns an ordered `levels` collection and a storey for every level.
- A level has `id`, unique `name`, `elevationCm` and deterministic `order`.
- Walls, rooms, openings, objects, voids, stairs, annotations and dimension lines are storey-local.
- The engine renders each storey independently; all-level rendering produces a manifest and one SVG per level.
- Level elevation is an ordering/reference property only. The MVP does not model 3D placement, slab construction, ceiling height, steps, headroom or floor-to-floor code rules.

### Geometry model and derived topology

- A wall is source geometry with centerline endpoints, thickness and `kind: exterior | interior`.
- Source walls must be horizontal or vertical and have non-zero length.
- The engine derives a split wall graph at valid intersections and T-junctions. It does not materialize split segments back into the source document.
- A small bespoke orthogonal geometry kernel owns segment intersection, containment, collision and face extraction. General polygon boolean geometry is out of scope.
- A room has a name, semantic type and seed point. It resolves to exactly one derived rectangular zoning face; its polygon, dimensions, area and perimeter are derived data.
- An incomplete *interior* wall can delimit two open-plan zones: for face derivation alone, a free endpoint extends on its own axis to the nearest perpendicular authored wall. This virtual extension is neither persisted nor rendered as a physical wall; the uncovered boundary remains a pass-through. A room seed still must lie strictly inside one zone. This is not general non-rectangular face extraction or silent repair of authored geometry.
- A room is reachable only if its derived face belongs to a walkable path from an exterior entry door (`type: door` hosted on `kind: exterior` with one adjacent face and outside on the other side), across hosted interior doors or uncovered portions of shared physical boundaries. Windows never form circulation edges; an opening elsewhere on the same long wall does not count as this room's door. Unlabelled derived faces may carry a path between named rooms. The typed diagnostics are `ROOM_WITHOUT_DOOR` when a face has no physical exit and `ROOM_NOT_REACHABLE_FROM_ENTRY` when it has no path to an exterior door; an isolated room may receive both. This MVP checks reachability within each storey; matched stair runs are validated separately and do not infer cross-storey reachability to a ground-floor entry.
- Dangling endpoints can remain in the authored wall graph (for intentional passages). Topology reports them; missing or ambiguous room faces remain validation errors.

### Openings and objects

- Door/window openings require a host wall, offset from canonical wall start, explicit width and an opening type.
- Doors support `single`, `double` and `sliding`; hinged doors add side and in/out swing direction. Windows support `fixed`, `casement`, `tilt-turn` and `sliding`.
- Openings that exceed host wall boundaries or overlap are hard errors. No clamping is performed.
- Generic `object` is an orthogonal rectangle with label, center, width, depth and rotation limited to 0/90/180/270 degrees. It renders as a box with an X and label.
- Explicit directional clearance rectangles are optional and rotate with their object. Any non-zero overlap of a box with a wall's occupied thickness (including its end caps) is a hard `OBJECT_WALL_COLLISION`; exact zero-area contact at the wall boundary is allowed. `CLEARANCE_WALL_COLLISION` is a warning; object/object, other-clearance and door-swing collisions retain their own defined severities.
- Stairs are a specialised rectangle with `direction: up | down`; they have no step count or 3D geometry.
- A stair run has a single identity shared by exactly two storeys. Lower occurrence is `up`, upper occurrence `down`; their footprints must align within the plan tolerance. A void on the upper level must contain the stair footprint.

### Validation and diagnostics

- Validation has only deterministic geometry and explicit-clearance rules. It does not infer semantic furniture clearance from labels.
- Every diagnostic includes stable `code`, `severity`, message, safe location, and measured values where applicable. Suggested fixes are advisory, never applied.
- Errors block mutations and final-required rendering. Warnings allow draft rendering, optionally as a diagnostics layer.
- Diagnostic order is deterministic.
- The engine reports derived per-room and per-level data including area, perimeter, bounding dimensions, wall/opening lengths and plan bounds.

### CLI contract

- JSON is the default output. `--format text` is human-oriented output only.
- Successful commands write exactly one stable envelope to stdout with `ok`, `type`, `schemaVersion`, `data` and `meta`.
- Failing commands write no stdout and exactly one structured error envelope to stderr.
- Exit codes: `0` success, `2` invalid input/geometry, `5` not found or revision/name conflict, `1` unclassified internal failure. Codes `3` and `4` are reserved for future auth and retryable network behavior.
- Root and subcommands provide help, examples and machine-readable command/schema discovery.
- Command grammar includes plan initialization, level/storey resource operations, wall/opening/room/object/stair/void/annotation/dimension operations, `apply`, `validate`, `render`, `report`, `commands` and `schema`.
- `apply --input operations.json` is the preferred agent workflow; it supports `expectedRevision` and `--dry-run` and is transactional.
- Single-resource commands use the same command engine and model rules as batch apply.

### Persistence

- A write reads the current plan, validates `expectedRevision`, applies the mutation in memory, validates the result, writes a temporary sibling file and atomically renames it into place.
- Rejected operations do not mutate the plan. One document means an advisory lock is not required in MVP; optimistic revision conflict protection is mandatory.

## Testing Decisions

### Test framework

- Unit and integration tests use Vitest with `describe`/`it` behavior tests and Given/When/Then sections.
- Effect-specific tests use `@effect/vitest` where its effect-aware helpers improve typed test setup; process tests remain ordinary async Vitest tests that spawn the installed executable.
- The chosen versions are pinned to the Effect v3 compatibility range: `vitest@3.2.7` and `@effect/vitest@0.30.x`.

### Test seams

1. `HousePlanEngine.apply()` is the highest mutation seam. Test observable accepted/rejected operations, resulting revision and unchanged state after failure.
2. `HousePlanEngine.validate()` is the highest validation seam. Test stable diagnostics and derived resolved geometry, never private graph implementation.
3. The real executable, spawned as a subprocess, is the CLI seam. Test parser behavior, JSON/stdout/stderr separation, exit codes, help, schema discovery, non-interactive operation and atomic persistence.
4. Renderer tests assert deterministic SVG strings and semantic layer content from a resolved plan; they do not snapshot private drawing helpers.

### Required behavior coverage

- Schema round trips for each public entity and JSON Schema emission.
- Integer-mm normalisation from 0.1 cm public values.
- Orthogonal wall rules, intersections, T-junctions, overlapping walls, dangling walls and closed-face discovery.
- Room seed resolution, derived area/perimeter and ambiguous/missing face diagnostics.
- Opening placement, overlap, wall-boundary errors, door-swing collisions and window types.
- Generic object, rotation, clearance and object/wall/door collision behavior.
- Cross-level ordering, level-local references, stair pairing, stair direction, footprint alignment and void containment.
- Transactionality, expectedRevision conflicts, dry run and failed-write byte preservation.
- Repeated runs yield identical resolved JSON, diagnostic order and SVG output.
- Root/subcommand help, success and failure envelopes, documented exit codes, stdin/batch path and TTY-less invocation.

### Fixtures

- A valid two-level small-house fixture containing exterior/interior walls, multiple rooms, doors, windows, generic objects, explicit clearance, stair/void pair, annotations and dimensions.
- Invalid fixtures targeted to each diagnostic category.
- CLI fixture scripts that construct, validate, render and reject invalid edits entirely through the executable.

## Out of Scope

- Layout generation, optimisation, room adjacency suggestion or automatic correction.
- Full CAD/BIM/IFC/DXF import/export, curved/non-orthogonal walls and general polygon editing.
- 3D views, elevations, sections, roofs, structural model, materials or lighting.
- Building-law, code-compliance or country-specific rules.
- Electrical, plumbing, HVAC and detailed fixtures/furniture catalogues.
- Step-level stairs, actual riser calculations, headroom, elevators, multi-storey rooms and construction details.
- PDF output, web UI/editor, collaboration, cloud sync, database, auth and network API.

## Further Notes

- Earlier research is located in `docs/research/2026-09-28-2d-floorplan-tools.md`.
- Research evidence supports the selected multi-level concept: Autodesk OAS offers an LLM-friendly 2D JSON approach; Sweet Home 3D models levels explicitly; Schematex validates shared stair identity across floor plates; Floor Plan Creator treats stair openings/voids as explicit geometry.
- The specification deliberately treats close-but-not-connected geometry as diagnostics rather than snapping, preserving LLM control and full determinism.
- This directory is not yet a Git repository and has no configured issue tracker. This spec is published locally; it must be added to the repository and referenced from an issue/PR once repository initialization begins.
