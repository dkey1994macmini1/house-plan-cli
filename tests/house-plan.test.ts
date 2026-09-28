import { describe, expect, it } from "vitest";
import {
  apply,
  emptyPlan,
  renderSvg,
  resolvePlan,
  surveyPlan,
  validate,
} from "../src/house-plan.js";
import type { Operation } from "../src/modules/plan/model.js";
import { decodeOperations } from "../src/modules/plan/schema.js";
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

const applied = (operations: readonly Operation[]) => {
  const result = apply(emptyPlan(), 0, operations);
  if ("ok" in result) throw new Error(result.error.message);
  return result;
};

const slidingDoor = (level: string, name: string, wall: string, offset = 150) =>
  ({
    kind: "opening.upsert",
    level,
    entity: {
      name,
      wall,
      type: "door",
      variant: "sliding",
      offset,
      width: 90,
    },
  }) as const;

const stairBounds = { x: 100, y: 100, width: 90, height: 200 };

const twoStoreyHouse = ({ withStairs }: { readonly withStairs: boolean }) =>
  [
    { kind: "level.upsert", name: "upper", elevationCm: 280, order: 1 },
    { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
    ...rectangle("ground", "ground-shell", 0, 0, 400, 400),
    {
      kind: "room.upsert",
      level: "ground",
      entity: { name: "hall", type: "circulation", seed: { x: 300, y: 300 } },
    },
    slidingDoor("ground", "entry", "ground-shell-south", 250),
    ...rectangle("upper", "upper-shell", 0, 0, 400, 400),
    {
      kind: "room.upsert",
      level: "upper",
      entity: {
        name: "landing",
        type: "circulation",
        seed: { x: 300, y: 300 },
      },
    },
    ...(withStairs
      ? ([
          {
            kind: "stair.upsert",
            level: "ground",
            entity: {
              name: "stairs-up",
              run: "main",
              direction: "up",
              bounds: stairBounds,
            },
          },
          {
            kind: "stair.upsert",
            level: "upper",
            entity: {
              name: "stairs-down",
              run: "main",
              direction: "down",
              bounds: stairBounds,
            },
          },
          {
            kind: "void.upsert",
            level: "upper",
            entity: { name: "stair-void", bounds: stairBounds },
          },
        ] as const)
      : []),
  ] as readonly Operation[];

describe("HousePlanEngine", () => {
  it("reaches an upper-floor room whose only exit is a paired stair run", () => {
    const result = apply(emptyPlan(), 0, twoStoreyHouse({ withStairs: true }));

    expect(result).not.toHaveProperty("ok");
  });

  it("rejects an upper-floor room when no stair run connects it", () => {
    const result = apply(emptyPlan(), 0, twoStoreyHouse({ withStairs: false }));

    expect(result).toMatchObject({
      ok: false,
      error: {
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "ROOM_NOT_REACHABLE_FROM_ENTRY",
            location: { room: "landing" },
          }),
        ]),
      },
    });
  });

  it("surveys a stair run as a connection between the rooms it joins", () => {
    const plan = applied(twoStoreyHouse({ withStairs: true }));

    const survey = surveyPlan(plan);

    for (const level of survey.levels)
      expect(level.connections).toContainEqual({
        kind: "stair",
        opening: "main",
        widthCm: 90,
        sides: [["ground:hall"], ["upper:landing"]],
      });
  });

  it("reports how far an opening overruns its host wall", () => {
    const plan = applied([
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      ...rectangle("ground", "shell", 0, 0, 400, 300),
    ]);
    const invalid = {
      ...plan,
      storeys: plan.storeys.map((storey) => ({
        ...storey,
        openings: [
          {
            id: "window-id",
            name: "too-wide",
            wall: "shell-south",
            type: "window" as const,
            variant: "fixed",
            offset: 350,
            width: 100,
          },
        ],
      })),
    };

    expect(validate(invalid)).toContainEqual(
      expect.objectContaining({
        code: "OPENING_OUTSIDE_WALL",
        measured: { value: 450, unit: "cm", limit: 400 },
      }),
    );
  });

  it("rejects removal of an entity that does not exist", () => {
    const plan = applied([
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
    ]);

    const result = apply(plan, 1, [
      { kind: "wall.remove", level: "ground", name: "missing" },
    ]);

    expect(result).toMatchObject({ ok: false, error: { type: "not_found" } });
  });

  it("removes a level together with its storey", () => {
    const plan = applied([
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      { kind: "level.upsert", name: "attic", elevationCm: 280, order: 1 },
    ]);

    const result = apply(plan, 1, [{ kind: "level.remove", name: "attic" }]);

    expect(result).not.toHaveProperty("ok");
    if ("ok" in result) return;
    expect(result.levels.map((level) => level.name)).toEqual(["ground"]);
    expect(result.storeys).toHaveLength(1);
  });

  it("keeps an open gap on the concave edge of an L-shaped room walkable", () => {
    const wall = (
      name: string,
      a: { x: number; y: number },
      b: { x: number; y: number },
      kind: "exterior" | "interior" = "exterior",
    ) =>
      ({
        kind: "wall.upsert",
        level: "ground",
        entity: { name, a, b, thickness: 20, kind },
      }) as const;
    const plan = applied([
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      wall("south", { x: 0, y: 0 }, { x: 600, y: 0 }),
      wall("east-lower", { x: 600, y: 0 }, { x: 600, y: 300 }),
      wall("east-upper", { x: 600, y: 300 }, { x: 600, y: 600 }),
      wall("north-right", { x: 600, y: 600 }, { x: 300, y: 600 }),
      wall("north-left", { x: 300, y: 600 }, { x: 0, y: 600 }),
      wall("west", { x: 0, y: 600 }, { x: 0, y: 0 }),
      wall(
        "nook-south-east",
        { x: 600, y: 300 },
        { x: 450, y: 300 },
        "interior",
      ),
      wall(
        "nook-south-west",
        { x: 350, y: 300 },
        { x: 300, y: 300 },
        "interior",
      ),
      wall("nook-west", { x: 300, y: 300 }, { x: 300, y: 600 }, "interior"),
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "living", type: "living", seed: { x: 100, y: 100 } },
      },
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "nook", type: "living", seed: { x: 450, y: 450 } },
      },
      slidingDoor("ground", "entry", "south", 100),
    ]);

    const [ground] = surveyPlan(plan).levels;

    expect(ground?.faces.map((face) => face.rooms)).toEqual([
      ["living"],
      ["nook"],
    ]);
    expect(ground?.connections).toContainEqual({
      kind: "passage",
      widthCm: 100,
      sides: [["living"], ["nook"]],
    });
  });

  it("rejects a room around a freestanding enclosure instead of miscounting its area", () => {
    const plan = applied([
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      ...rectangle("ground", "shell", 0, 0, 600, 400),
      slidingDoor("ground", "entry", "shell-south", 400),
    ]);
    const withCloset = {
      ...plan,
      storeys: plan.storeys.map((storey) => ({
        ...storey,
        walls: [
          ...storey.walls,
          ...rectangle("ground", "closet", 100, 100, 150, 150).map(
            ({ entity }, index) => ({
              ...entity,
              id: `closet-wall-${index}`,
              kind: "interior" as const,
            }),
          ),
        ],
        rooms: [
          {
            id: "living-id",
            name: "living",
            type: "living",
            seed: { x: 500, y: 300 },
          },
          {
            id: "closet-id",
            name: "closet",
            type: "utility",
            seed: { x: 175, y: 175 },
          },
        ],
      })),
    };

    const diagnostics = validate(withCloset);
    const [ground] = surveyPlan(withCloset).levels;

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "ROOM_FACE_NOT_FOUND",
        location: { room: "living" },
        suggestion: expect.stringContaining("freestanding"),
      }),
    );
    expect(ground?.faces).toEqual([
      expect.objectContaining({
        id: "100,100,150,150",
        areaCm2: 22500,
        rooms: ["closet"],
      }),
    ]);
  });

  it("removes a named resource in the transactional apply flow", () => {
    const withLevel = apply(emptyPlan(), 0, [
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
    ]);
    if ("ok" in withLevel) throw new Error(withLevel.error.message);
    const withWall = apply(withLevel, 1, [
      {
        kind: "wall.upsert",
        level: "ground",
        entity: {
          name: "wall",
          a: { x: 0, y: 0 },
          b: { x: 100, y: 0 },
          thickness: 20,
          kind: "exterior",
        },
      },
    ]);
    if ("ok" in withWall) throw new Error(withWall.error.message);

    const result = apply(withWall, 2, [
      { kind: "wall.remove", level: "ground", name: "wall" } as Operation,
    ]);

    expect(result).not.toHaveProperty("ok");
    if ("ok" in result) return;
    expect(result.storeys[0]?.walls).toEqual([]);
  });
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

  it("resolves an L-shaped face using its polygon area and seeded room", () => {
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
          name: "east-lower",
          a: { x: 600, y: 0 },
          b: { x: 600, y: 200 },
          thickness: 20,
          kind: "exterior",
        },
      },
      {
        kind: "wall.upsert",
        level: "ground",
        entity: {
          name: "notch-south",
          a: { x: 600, y: 200 },
          b: { x: 300, y: 200 },
          thickness: 20,
          kind: "exterior",
        },
      },
      {
        kind: "wall.upsert",
        level: "ground",
        entity: {
          name: "notch-west",
          a: { x: 300, y: 200 },
          b: { x: 300, y: 400 },
          thickness: 20,
          kind: "exterior",
        },
      },
      {
        kind: "wall.upsert",
        level: "ground",
        entity: {
          name: "north",
          a: { x: 300, y: 400 },
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
        kind: "room.upsert",
        level: "ground",
        entity: { name: "living", type: "living", seed: { x: 100, y: 300 } },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "entry",
          wall: "notch-south",
          type: "door",
          variant: "single",
          offset: 50,
          width: 90,
        },
      },
    ]);

    expect(resolvePlan(plan).storeys[0]?.rooms).toEqual([
      expect.objectContaining({
        name: "living",
        bounds: { x: 0, y: 0, width: 600, height: 400 },
        areaCm2: 180000,
        perimeterCm: 2000,
        face: [
          { x: 0, y: 0 },
          { x: 600, y: 0 },
          { x: 600, y: 200 },
          { x: 300, y: 200 },
          { x: 300, y: 400 },
          { x: 0, y: 400 },
        ],
      }),
    ]);
    expect(surveyPlan(plan).levels[0]).toMatchObject({
      faceAreaCm2: 180000,
      roomClaimAreaCm2: 180000,
      faces: [
        {
          id: "polygon:0,0;600,0;600,200;300,200;300,400;0,400",
          areaCm2: 180000,
          rooms: ["living"],
        },
      ],
      rooms: [
        {
          name: "living",
          faceId: "polygon:0,0;600,0;600,200;300,200;300,400;0,400",
          areaCm2: 180000,
        },
      ],
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
    ] satisfies readonly Operation[];
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

  it("places a room label fully inside its room and clear of furniture", () => {
    const plan = applied([
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      ...rectangle("ground", "shell", 0, 0, 300, 200),
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "bathroom", type: "bathroom", seed: { x: 250, y: 30 } },
      },
      slidingDoor("ground", "entry", "shell-south", 20),
      {
        kind: "object.upsert",
        level: "ground",
        entity: {
          name: "bathtub",
          label: "Bathtub",
          center: { x: 150, y: 120 },
          width: 170,
          depth: 70,
          rotation: 0,
        },
      },
    ]);
    const [storey] = plan.storeys;
    if (!storey) throw new Error("Expected a ground storey");

    const label = renderSvg(plan, storey).match(
      /<text class="room-label" x="([-\d.]+)" y="([-\d.]+)" font-size="(\d+)"[^>]*>([^<]+)<\/text>/,
    );

    expect(label).not.toBeNull();
    const [, x, svgY, fontSize, text] = label ?? [];
    const halfWidth = ((text?.length ?? 0) * Number(fontSize) * 0.5) / 2;
    const halfHeight = Number(fontSize) / 2;
    const box = {
      left: Number(x) - halfWidth,
      right: Number(x) + halfWidth,
      bottom: -Number(svgY) - halfHeight,
      top: -Number(svgY) + halfHeight,
    };
    const insideWallFaces =
      box.left >= 10 && box.right <= 290 && box.bottom >= 10 && box.top <= 190;
    const clearOfBathtub =
      box.right <= 65 || box.left >= 235 || box.top <= 85 || box.bottom >= 155;
    expect({ insideWallFaces, clearOfBathtub, box }).toMatchObject({
      insideWallFaces: true,
      clearOfBathtub: true,
    });
  });

  it("labels a stair once instead of stacking its void name on top of it", () => {
    const plan = applied(twoStoreyHouse({ withStairs: true }));
    const upper = plan.storeys.find(
      (storey) => storey.stairs[0]?.direction === "down",
    );
    if (!upper) throw new Error("Expected the upper storey");

    const svg = renderSvg(plan, upper);

    expect(svg).toContain("↓ main");
    expect(svg).not.toContain(">stair-void</text>");
    expect(svg).toContain("<title>stair-void</title>");
  });

  it("draws sliding doors as overlapping panels rather than a bare gap", () => {
    const plan = applied([
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      ...rectangle("ground", "shell", 0, 0, 600, 400),
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "living", type: "living", seed: { x: 300, y: 200 } },
      },
      slidingDoor("ground", "terrace", "shell-south", 200),
    ]);
    const [storey] = plan.storeys;
    if (!storey) throw new Error("Expected a ground storey");

    const panels = renderSvg(plan, storey).match(
      /<g class="door-sliding">(.*?)<\/g>/,
    );

    expect((panels?.[1]?.match(/<line /g) ?? []).length).toBe(2);
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
          name: "west-entry",
          wall: "south",
          type: "door",
          variant: "single",
          offset: 100,
          width: 80,
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
      decodeOperations([
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
      ])._tag,
    ).toBe("Left");
  });

  it("rejects stairs occupying the approach to a sliding door without a swing", () => {
    const result = apply(emptyPlan(), 0, [
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      { kind: "level.upsert", name: "upper", elevationCm: 280, order: 1 },
      ...rectangle("ground", "shell", 0, 0, 600, 400),
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "hall", type: "circulation", seed: { x: 300, y: 200 } },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "entry",
          wall: "shell-south",
          type: "door",
          variant: "sliding",
          offset: 250,
          width: 80,
        },
      },
      ...(["ground", "upper"] as const).map((level) => ({
        kind: "stair.upsert" as const,
        level,
        entity: {
          name: `stairs-${level}`,
          run: "stairs",
          direction: level === "ground" ? ("up" as const) : ("down" as const),
          bounds: { x: 250, y: 10, width: 80, height: 90 },
        },
      })),
      {
        kind: "void.upsert",
        level: "upper",
        entity: {
          name: "stair-void",
          bounds: { x: 250, y: 10, width: 80, height: 90 },
        },
      },
    ]);
    expect(result).toMatchObject({
      ok: false,
      error: {
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "DOOR_STAIR_APPROACH_COLLISION",
            location: { opening: "entry", stair: "stairs-ground" },
          }),
        ]),
      },
    });
  });

  it("rejects a furniture footprint that intersects wall thickness", () => {
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
        },
      },
    ]);
    const result = apply(plan, 1, [
      {
        kind: "object.upsert",
        level: "ground",
        entity: {
          name: "wardrobe",
          label: "Wardrobe",
          center: { x: 15, y: 200 },
          width: 20,
          depth: 80,
          rotation: 0,
        },
      },
    ]);
    expect(result).toMatchObject({
      ok: false,
      error: {
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "OBJECT_WALL_COLLISION",
            location: { object: "wardrobe", wall: "shell-west" },
          }),
        ]),
      },
    });
    expect(plan.revision).toBe(1);
  });

  it("uses the rotated footprint and permits exact edge contact", () => {
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
        },
      },
    ]);
    const touching = apply(plan, 1, [
      {
        kind: "object.upsert",
        level: "ground",
        entity: {
          name: "sideboard",
          label: "Sideboard",
          center: { x: 25, y: 200 },
          width: 30,
          depth: 60,
          rotation: 0,
        },
      },
    ]);
    expect("ok" in touching).toBe(false);
    const rotated = apply(plan, 1, [
      {
        kind: "object.upsert",
        level: "ground",
        entity: {
          name: "rotated",
          label: "Rotated",
          center: { x: 50, y: 200 },
          width: 20,
          depth: 100,
          rotation: 90,
        },
      },
    ]);
    expect(rotated).toMatchObject({
      ok: false,
      error: {
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "OBJECT_WALL_COLLISION" }),
        ]),
      },
    });
  });

  it("checks directional clearance after rotating a box", () => {
    const plan = applied([
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      ...rectangle("ground", "shell", 0, 0, 600, 400),
      {
        kind: "object.upsert",
        level: "ground",
        entity: {
          name: "rotated-cabinet",
          label: "Cabinet",
          center: { x: 60, y: 200 },
          width: 100,
          depth: 20,
          rotation: 90,
          clearance: { front: 60, back: 0, left: 0, right: 0 },
        },
      },
    ]);
    expect(validate(plan)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CLEARANCE_WALL_COLLISION",
          location: { object: "rotated-cabinet", wall: "shell-west" },
        }),
      ]),
    );
  });

  it("rejects rooms with local doors but no path to an exterior entry", () => {
    const result = apply(emptyPlan(), 0, [
      { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
      ...rectangle("ground", "shell", 0, 0, 900, 400),
      ...[300, 600].map((x) => ({
        kind: "wall.upsert" as const,
        level: "ground",
        entity: {
          name: `divider-${x}`,
          a: { x, y: 0 },
          b: { x, y: 400 },
          thickness: 12,
          kind: "interior" as const,
        },
      })),
      ...[150, 450, 750].map((x) => ({
        kind: "room.upsert" as const,
        level: "ground",
        entity: { name: `room-${x}`, type: "living", seed: { x, y: 200 } },
      })),
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "entry",
          wall: "shell-south",
          type: "door",
          variant: "single",
          offset: 80,
          width: 80,
        },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "isolated-connection",
          wall: "divider-600",
          type: "door",
          variant: "single",
          offset: 150,
          width: 80,
        },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "window-only",
          wall: "shell-north",
          type: "window",
          variant: "fixed",
          offset: 80,
          width: 100,
        },
      },
    ]);
    expect(result).toMatchObject({
      ok: false,
      error: {
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "ROOM_NOT_REACHABLE_FROM_ENTRY",
            location: { room: "room-450" },
          }),
          expect.objectContaining({
            code: "ROOM_NOT_REACHABLE_FROM_ENTRY",
            location: { room: "room-750" },
          }),
        ]),
      },
    });
  });

  it("does not use an exterior window as a room entrance", () => {
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
        kind: "room.upsert",
        level: "ground",
        entity: { name: "entry-room", type: "hall", seed: { x: 150, y: 200 } },
      },
      {
        kind: "room.upsert",
        level: "ground",
        entity: {
          name: "window-room",
          type: "bedroom",
          seed: { x: 450, y: 200 },
        },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "entry",
          wall: "shell-south",
          type: "door",
          variant: "single",
          offset: 100,
          width: 80,
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
          offset: 100,
          width: 100,
        },
      },
    ]);
    expect(result).toMatchObject({
      ok: false,
      error: {
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "ROOM_WITHOUT_DOOR",
            location: { room: "window-room" },
          }),
          expect.objectContaining({
            code: "ROOM_NOT_REACHABLE_FROM_ENTRY",
            location: { room: "window-room" },
          }),
        ]),
      },
    });
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
