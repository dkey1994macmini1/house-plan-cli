<overview>
`survey --plan FILE` prints one JSON envelope, type `plan.survey`. It does not write the plan. Use it to state what the floor plan is. Use `report` only when an edit needs authored wall coordinates.
</overview>

<patterns>
## Envelope

`data.revision` is the on-disk revision. `data.valid` is false when any diagnostic has severity `error`; exit 0 still happens, so read the flag. Diagnostics stay in `meta.diagnostics`.

Each `data.levels[]` entry is one storey, ordered by `order`.

| Field | Meaning |
|---|---|
| `bounds` | Footprint of derived faces, centimetres. `width` is the X extent, `height` is the Y extent. An L-shaped plan's box is larger than its floor area. |
| `faceAreaCm2` | Sum of derived faces, each face once. This is the floor area. |
| `roomClaimAreaCm2` | Sum of per-room areas. Larger than `faceAreaCm2` when two room seeds share a face. |
| `faces[]` | One closed orthogonal polygon. A rectangle's `id` is `x,y,width,height`; an L/T face's `id` is `polygon:x,y;x,y;…` and it also carries `vertices`. `bounds` is the bounding box, `areaCm2` the true polygon area. `rooms` lists every seed inside it. |
| `rooms[]` | Name, type, `faceId`, `widthCm` (X), `depthCm` (Y), `areaCm2`. `exteriorDoors` and `windows` touch that face. `objects` are those whose center is strictly inside the same face. |
| `connections[]` | `kind` `door`, `passage` or `stair`. `widthCm` is the door width, the uncovered gap, or the stair width. `sides` is two sorted lists: room names on each side, `"outside"` for an exterior door, or `face:<id>` when that side has no room. A `stair` connection names its run in `opening`, appears on both levels it joins, and labels sides `level:room` (or `level:face:<id>`). |
| `objectsOutsideRooms` | Objects whose center is not inside any face. |
| `stairs` / `voids` | Authored footprints on this storey. Only runs listed as `stair` connections carry circulation between levels. |

A room with `faceId: null` has no closed face. Its area fields are null and it is absent from `faces[].rooms`.
</patterns>

<guidelines>
## How to describe the plan

- Quote `faceAreaCm2` divided by 10000 as square metres. Do not add up `rooms[].areaCm2` when any `faces[].rooms` has more than one name: those rooms are one zone and `roomClaimAreaCm2` counts it twice.
- A connection is one opening or one gap. Rooms listed on the same side share the zone; they are not extra doors.
- Windows are daylight on the room. They are not connections. Interior doors appear only under `connections`.
- `data.valid: true` means the geometry checks passed. It does not mean the brief is met, that labels match separate rooms, or that the plan satisfies building code.
- Dimensions in this reading are centimetres, areas square centimetres. Operations you write later stay in centimetres too.
</guidelines>

<examples>
## Shared face

`faces: [{ "id": "1900,0,400,800", "rooms": ["Dining", "Kitchen"] }]` with both rooms reporting the same `areaCm2` means one open zone. Say that, and use `faceAreaCm2` for the storey total.

## Door

`{ "kind": "door", "opening": "entry", "widthCm": 90, "sides": [["kitchen"], ["outside"]] }` is the exterior entry into kitchen.

## Passage

`{ "kind": "passage", "widthCm": 500, "sides": [["east-room"], ["west-room"]] }` is an uncovered gap of 500 cm between those rooms. The drawn wall is shorter than the zone boundary; the gap is the walkable opening.

## Stair

`{ "kind": "stair", "opening": "main", "widthCm": 90, "sides": [["ground:hall"], ["upper:landing"]] }` is the `main` run climbing from the ground-floor hall to the upper landing. It is how upper rooms reach the exterior entry.
</examples>
