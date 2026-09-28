# Diagnostics

Read `error.diagnostics` for a rejected `apply`, or `meta.diagnostics` from
`validate`, `report`, `survey`, and `render --allow-invalid`.

| Code | Meaning | Typical correction |
| --- | --- | --- |
| `ROOM_FACE_NOT_FOUND` | A room seed is outside a closed derived zone. | Close the boundary walls or move the seed. |
| `ROOM_SEED_AMBIGUOUS` | A seed is exactly on a derived boundary. | Move it strictly inside one face. |
| `ROOM_WITHOUT_DOOR` | A face has no door, physical passage or connecting stair landing. | Add a door on the shared wall or leave a physical gap. |
| `ROOM_NOT_REACHABLE_FROM_ENTRY` | No path of doors, passages and connecting stair runs leads from the room to an exterior entry. | Add the missing door/passage, or pair the stair run and add its upper void. |
| `OPENING_OUTSIDE_WALL` | Offset and width do not fit the host wall. `measured.value` is `offset + width`, `measured.limit` the wall length. | Keep `offset > 0` and `offset + width < wall length`. |
| `OPENING_OVERLAP` | Two openings overlap on one host wall. | Move or resize one opening. |
| `OBJECT_WALL_COLLISION` | An object overlaps physical wall thickness. | Move or resize the object. |
| `DOOR_SWING_OBJECT_COLLISION` | A hinged door swing intersects an object. | Change the hinge/swing or move the object. |
| `DOOR_STAIR_APPROACH_COLLISION` | A stair blocks a door approach. | Move the stair or doorway. |
| `STAIR_RUN_UNPAIRED` | A stair run does not occur exactly twice. | Add its matching occurrence on the other level. |
| `STAIR_RUN_MISMATCH` | Lower occurrence is not `up`, upper is not `down`, or bounds differ. `measured.value` is the summed bounds difference when footprints differ. | Copy the lower `bounds` exactly and fix directions. |
| `WALL_ZERO_LENGTH` | A wall's endpoints coincide. `measured.value` is its length. | Remove the wall or move an endpoint. |
| `STAIR_VOID_MISSING` | The upper stair is not inside a void. | Add or resize the upper-level void. |
