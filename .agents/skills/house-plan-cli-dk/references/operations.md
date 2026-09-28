<operation_contract>
`schema` is authoritative for exact required fields and types. `apply --input` reads a JSON array, not an object or newline-delimited stream. Each non-level operation has `kind`, `level` (existing level name), and `entity`. Names identify upserts within the entity collection of one storey; engine-assigned IDs are generated or retained for same-name upserts. Refer to `examples/reference-ground-floor-ops.json` for a complete accepted multi-level batch (not a general layout template).

| `kind` | Required fields beyond `kind` / `level` | Geometry note |
|---|---|---|
| `level.upsert` | `name`, `elevationCm`, `order` (no `level`/`entity`) | Define levels before their storey-local entities in the same batch. |
| `level.remove` | `name` (no `level`/`entity`) | Removes the level and its storey. |
| `wall.upsert` | `entity: {name,a:{x,y},b:{x,y},thickness,kind:"exterior"|"interior"}` | Horizontal/vertical centerline; nonzero length. |
| `room.upsert` | `entity: {name,type,seed:{x,y}}` | Seed strictly inside one derived zone; bounds/area are derived, not authored. |
| `opening.upsert` | `entity: {name,wall,type:"door"|"window",variant,offset,width}` | Offset from host wall's canonical start. Hinged doors also use `hinge` and `swing`; see reference fixture for valid forms. |
| `object.upsert` | `entity: {name,label,center:{x,y},width,depth,rotation}` | Rotation 0/90/180/270. Optional `clearance:{front,left,right,back}`. |
| `stair.upsert` | `entity: {name,run,direction:"up"|"down",bounds:{x,y,width,height}}` | Pair runs across two levels with aligned bounds. |
| `void.upsert` | `entity: {name,bounds:{x,y,width,height}}` | Upper-level void contains stair footprint. |
| `annotation.upsert` | `entity: {name,text,at:{x,y}}` | Explicit text at a point. |
| `dimension.upsert` | `entity: {name,a:{x,y},b:{x,y},offset}` | Explicit dimension line. |
| `wall.remove` / `room.remove` / `opening.remove` / `object.remove` / `stair.remove` / `void.remove` / `annotation.remove` / `dimension.remove` | `level`, `name` | Removes one named storey-local entity. Dependent entities are not removed automatically. |

All coordinates and dimensions in public JSON use centimetres (0.1 cm resolution); do not submit millimetres. `bounds` is origin + width/height; objects use center + width/depth instead. Positive X right and Y up. The renderer inverts Y for SVG. Build the complete operations document to satisfy cross-entity constraints, then preview before writing; adding one room to a still-open shell can fail validation. Use explicit `*.remove` operations; do not edit saved plan JSON by hand to bypass validation.

## Hinged-door orientation

`offset` is always measured from authored wall endpoint `a`. The open leaf's side is
determined by the authored a→b direction and `swing`; reverse-authored walls reverse
the apparent result. Use `survey`/`render` after a dry run rather than guessing.

| Wall a→b | `in` opens | `out` opens |
| --- | --- | --- |
| left → right | north | south |
| right → left | south | north |
| bottom → top | west | east |
| top → bottom | east | west |
</operation_contract>

<geometry_and_access>
- Source wall centerlines remain as authored; intersections and T-junctions produce derived topology. For rectangular zoning only, a free interior wall endpoint can virtually extend to a perpendicular authored wall. This extension does not appear in the saved walls or SVG; the uncovered physical gap can be an open passage.
- Rooms must resolve to unique derived faces. Circulation from an exterior entry door uses interior doors or physical open passages; a window does not provide access. Reachability is checked per storey; paired stairs do not establish cross-storey reachability.
- A generic object's occupied box crossing wall thickness is a hard `OBJECT_WALL_COLLISION`; door-stair rectangular approach obstruction is hard `DOOR_STAIR_APPROACH_COLLISION`. `CLEARANCE_WALL_COLLISION` is a warning. Other diagnostic codes and severities should be read from the current CLI response rather than guessed.
- An invalid batch can contain a mixture of interacting failures: use `error.diagnostics[].location`, `measured`, `suggestion`, correct the authored operations, and preview again. Do not suppress errors by calling render directly.
</geometry_and_access>

<minimal_operation_example>
For a new plan, this valid batch establishes a level without pretending to define a finished room or a building:
```json
[
  {"kind":"level.upsert","name":"ground","elevationCm":0,"order":0}
]
```
For an actual floor plan, author walls, room seeds, openings and any paired stairs together as necessary; derive details from `schema` and the reference fixture. Do not claim a bare level is a complete house design.
</minimal_operation_example>
