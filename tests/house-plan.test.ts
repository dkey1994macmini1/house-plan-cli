import { describe, expect, it } from "vitest";
import {
  apply,
  emptyPlan,
  renderSvg,
  resolvePlan,
  validate,
} from "../src/house-plan.js";
import { hasGridMeasurements } from "../src/modules/plan/schema.js";
import { renderStairsLayer } from "../src/modules/render/circulation-layer.js";

const rectangle = (
  level: string,
  prefix: string,
  x: number,
  y: number,
  width: number,
  height: number,
) =>
  [
    {
      kind: "wall.upsert",
      level,
      entity: {
        name: `${prefix}-south`,
        a: { x, y },
        b: { x: x + width, y },
        thickness: 20,
        kind: "exterior",
      },
    },
    {
      kind: "wall.upsert",
      level,
      entity: {
        name: `${prefix}-east`,
        a: { x: x + width, y },
        b: { x: x + width, y: y + height },
        thickness: 20,
        kind: "exterior",
      },
    },
    {
      kind: "wall.upsert",
      level,
      entity: {
        name: `${prefix}-north`,
        a: { x: x + width, y: y + height },
        b: { x, y: y + height },
        thickness: 20,
        kind: "exterior",
      },
    },
    {
      kind: "wall.upsert",
      level,
      entity: {
        name: `${prefix}-west`,
        a: { x, y: y + height },
        b: { x, y },
        thickness: 20,
        kind: "exterior",
      },
    },
  ] as const;

const applied = (operations: readonly Record<string, unknown>[]) => {
  const result = apply(emptyPlan(), 0, operations);
  if ("ok" in result) throw new Error(result.error.message);
  return result;
};

describe("HousePlanEngine", () => {
  it("derives exactly one closed face and its measurements from authored walls", () => {
    const plan = applied([
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      ...rectangle("ground", "shell", 0, 0, 600, 400),
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "living", type: "living", seed: { x: 300, y: 200 } },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "entry",
          wall: "shell-south",
          type: "door",
          variant: "single",
          offset: 250,
          width: 90,
          hinge: "left",
          swing: "in",
        },
      },
    ]);
    const resolved = resolvePlan(plan);
    expect(resolved.storeys[0]?.rooms[0]).toMatchObject({
      name: "living",
      areaCm2: 240000,
      perimeterCm: 2000,
      bounds: { x: 0, y: 0, width: 600, height: 400 },
    });
  });

  it("rejects a room whose seed has no unique derived closed face without changing the source", () => {
    const operations = [
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "living", type: "living", seed: { x: 10, y: 10 } },
      },
    ];
    const result = apply(emptyPlan(), 0, operations);
    expect(result).toMatchObject({
      ok: false,
      error: {
        type: "invalid_input",
        diagnostics: [{ code: "ROOM_FACE_NOT_FOUND" }],
      },
    });
    expect(emptyPlan()).toEqual({
      schemaVersion: 1,
      revision: 0,
      levels: [],
      storeys: [],
    });
  });

  it("rejects overlapping openings on one wall atomically", () => {
    const result = apply(emptyPlan(), 0, [
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      ...rectangle("ground", "shell", 0, 0, 600, 400),
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "door-a",
          wall: "shell-south",
          type: "door",
          variant: "single",
          offset: 100,
          width: 100,
          hinge: "left",
          swing: "in",
        },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "door-b",
          wall: "shell-south",
          type: "door",
          variant: "single",
          offset: 150,
          width: 100,
          hinge: "right",
          swing: "out",
        },
      },
    ]);
    expect(result).toMatchObject({
      ok: false,
      error: { diagnostics: [{ code: "OPENING_OVERLAP" }] },
    });
  });

  it("validates paired cross-level stairs and upper void containment", () => {
    const plan = applied([
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      { kind: "level.upsert", name: "upper", elevationCm: 280, order: 1 },
      {
        kind: "stair.upsert",
        level: "ground",
        entity: {
          name: "up",
          run: "main",
          direction: "up",
          bounds: { x: 0, y: 0, width: 100, height: 200 },
        },
      },
      {
        kind: "stair.upsert",
        level: "upper",
        entity: {
          name: "down",
          run: "main",
          direction: "down",
          bounds: { x: 0, y: 0, width: 100, height: 200 },
        },
      },
      {
        kind: "void.upsert",
        level: "upper",
        entity: {
          name: "stair-void",
          bounds: { x: -10, y: -10, width: 120, height: 220 },
        },
      },
    ]);
    expect(validate(plan).filter((d) => d.severity === "error")).toEqual([]);
  });

  it("renders technical layers for walls, openings, dimensions, annotations and swings deterministically", () => {
    const plan = applied([
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      ...rectangle("ground", "shell", 0, 0, 600, 400),
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "living", type: "living", seed: { x: 300, y: 200 } },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "door",
          wall: "shell-south",
          type: "door",
          variant: "single",
          offset: 100,
          width: 90,
          hinge: "left",
          swing: "in",
        },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "window",
          wall: "shell-north",
          type: "window",
          variant: "fixed",
          offset: 200,
          width: 120,
        },
      },
      {
        kind: "annotation.upsert",
        level: "ground",
        entity: { name: "note", text: "Concept only", at: { x: 20, y: 20 } },
      },
      {
        kind: "dimension.upsert",
        level: "ground",
        entity: {
          name: "width",
          a: { x: 0, y: 0 },
          b: { x: 600, y: 0 },
          offset: -60,
        },
      },
    ]);
    const [storey] = plan.storeys;
    if (!storey) throw new Error("Expected a ground storey");
    const svg = renderSvg(plan, storey);
    expect(svg).toContain('id="openings"');
    expect(svg).toContain('id="dimensions"');
    expect(svg).toContain('id="annotations"');
    expect(svg).toContain('class="door-swing"');
    expect(svg).toContain('class="door-leaf"');
    expect(svg).toContain('class="window"');
    expect(renderSvg(plan, storey)).toBe(svg);
  });

  it("renders stair treads instead of an empty circulation rectangle", () => {
    const svg = renderStairsLayer([
      {
        id: "stairs",
        name: "up",
        run: "main",
        direction: "up",
        bounds: { x: 0, y: 0, width: 100, height: 200 },
      },
    ]);
    expect((svg.match(/<line /g) ?? []).length).toBe(9);
    expect(svg).toContain("↑ main");
  });

  it("reports authored clearance overlap as a warning without mutating geometry", () => {
    const plan = applied([
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      {
        kind: "object.upsert",
        level: "ground",
        entity: {
          name: "table",
          label: "Table",
          center: { x: 100, y: 100 },
          width: 80,
          depth: 80,
          rotation: 0,
          clearance: { front: 100, back: 0, left: 0, right: 0 },
        },
      },
      {
        kind: "object.upsert",
        level: "ground",
        entity: {
          name: "chair",
          label: "Chair",
          center: { x: 100, y: 190 },
          width: 40,
          depth: 40,
          rotation: 0,
        },
      },
    ]);
    expect(validate(plan)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CLEARANCE_OBJECT_COLLISION",
          severity: "warning",
        }),
      ]),
    );
  });

  it("resolves two adjacent rooms to distinct derived faces", () => {
    const plan = applied([
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      {
        kind: "wall.upsert",
        level: "ground",
        entity: {
          name: "south",
          a: { x: 0, y: 0 },
          b: { x: 600, y: 0 },
          thickness: 20,
          kind: "exterior",
        },
      },
      {
        kind: "wall.upsert",
        level: "ground",
        entity: {
          name: "north",
          a: { x: 600, y: 400 },
          b: { x: 0, y: 400 },
          thickness: 20,
          kind: "exterior",
        },
      },
      {
        kind: "wall.upsert",
        level: "ground",
        entity: {
          name: "west",
          a: { x: 0, y: 400 },
          b: { x: 0, y: 0 },
          thickness: 20,
          kind: "exterior",
        },
      },
      {
        kind: "wall.upsert",
        level: "ground",
        entity: {
          name: "east",
          a: { x: 600, y: 0 },
          b: { x: 600, y: 400 },
          thickness: 20,
          kind: "exterior",
        },
      },
      {
        kind: "wall.upsert",
        level: "ground",
        entity: {
          name: "divider",
          a: { x: 300, y: 0 },
          b: { x: 300, y: 400 },
          thickness: 12,
          kind: "interior",
        },
      },
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "west-room", type: "living", seed: { x: 150, y: 200 } },
      },
      {
        kind: "room.upsert",
        level: "ground",
        entity: {
          name: "east-room",
          type: "kitchen",
          seed: { x: 450, y: 200 },
        },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "connecting-door",
          wall: "divider",
          type: "door",
          variant: "single",
          offset: 150,
          width: 80,
          hinge: "left",
          swing: "in",
        },
      },
    ]);
    const [storey] = resolvePlan(plan).storeys;
    expect(storey?.rooms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "west-room",
          bounds: { x: 0, y: 0, width: 300, height: 400 },
          areaCm2: 120000,
        }),
        expect.objectContaining({
          name: "east-room",
          bounds: { x: 300, y: 0, width: 300, height: 400 },
          areaCm2: 120000,
        }),
      ]),
    );
  });

  it("rejects measurements outside the public 0.1 cm grid at input boundary", () => {
    expect(
      hasGridMeasurements([
        {
          kind: "wall.upsert",
          level: "ground",
          entity: {
            name: "wall",
            a: { x: 0, y: 0 },
            b: { x: 12.34, y: 0 },
            thickness: 20,
            kind: "exterior",
          },
        },
      ]),
    ).toBe(false);
  });

  it("rejects a room seed placed on a shared derived face boundary", () => {
    const result = apply(emptyPlan(), 0, [
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      ...rectangle("ground", "shell", 0, 0, 600, 400),
      {
        kind: "wall.upsert",
        level: "ground",
        entity: {
          name: "divider",
          a: { x: 300, y: 0 },
          b: { x: 300, y: 400 },
          thickness: 12,
          kind: "interior",
        },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "shell-door",
          wall: "shell-south",
          type: "door",
          variant: "single",
          offset: 200,
          width: 90,
          hinge: "left",
          swing: "in",
        },
      },
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "ambiguous", type: "living", seed: { x: 300, y: 200 } },
      },
    ]);
    expect(result).toMatchObject({
      ok: false,
      error: {
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "ROOM_SEED_AMBIGUOUS" }),
        ]),
      },
    });
  });
});
