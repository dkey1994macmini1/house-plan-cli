# Limits

- Walls are orthogonal. Derived faces are orthogonal polygons, including L and T shapes. Curves and diagonal walls are unsupported.
- A closed wall loop that floats inside a room without touching its boundary (a freestanding closet or courtyard) keeps its own face, but the zone around it is not derived: its room gets `ROOM_FACE_NOT_FOUND` with a hint. Connect the enclosure to a boundary wall so the surrounding zone splits into faces.
- Openings must satisfy `offset > 0` and `offset + width < wall length`; they cannot touch a wall endpoint.
- Entity names are unique across every collection in one storey.
- `*.remove` operations remove a named storey-local entity. Put dependent removals in the same batch; no cascading removal exists.
- A stair run connects levels only when it occurs on exactly two levels (lower `up`, upper `down`, identical bounds) and the upper occurrence sits inside a void. The face containing the stair's center counts as having an exit on both levels.
- `render --allow-invalid` creates a draft SVG with validation diagnostics. It is not proof of a valid plan or compliance.
