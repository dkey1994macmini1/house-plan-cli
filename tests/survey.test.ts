import { describe, expect, it } from "vitest";
import { apply, emptyPlan, surveyPlan } from "../src/house-plan.js";
import type { HousePlan, Operation } from "../src/modules/plan/model.js";

const applied = (operations: readonly Operation[]): HousePlan => {
  const result = apply(emptyPlan(), 0, operations);
  if ("ok" in result) throw new Error(result.error.message);
  return result;
};

const level = {
  kind: "level.upsert",
  name: "ground",
  elevationCm: 0,
  order: 0,
} as const;

const shell = (width: number, height: number): readonly Operation[] => [
  {
    kind: "wall.upsert",
    level: "ground",
    entity: {
      name: "south",
      a: { x: 0, y: 0 },
      b: { x: width, y: 0 },
      thickness: 20,
      kind: "exterior",
    },
  },
  {
    kind: "wall.upsert",
    level: "ground",
    entity: {
      name: "east",
      a: { x: width, y: 0 },
      b: { x: width, y: height },
      thickness: 20,
      kind: "exterior",
    },
  },
  {
    kind: "wall.upsert",
    level: "ground",
    entity: {
      name: "north",
      a: { x: width, y: height },
      b: { x: 0, y: height },
      thickness: 20,
      kind: "exterior",
    },
  },
  {
    kind: "wall.upsert",
    level: "ground",
    entity: {
      name: "west",
      a: { x: 0, y: height },
      b: { x: 0, y: 0 },
      thickness: 20,
      kind: "exterior",
    },
  },
];

describe("plan survey", () => {
  it("reads an empty plan as no levels", () => {
    expect(surveyPlan(emptyPlan())).toEqual({ revision: 0, levels: [] });
  });

  it("reads separate rooms, the door between them, a window, and an exterior door", () => {
    const plan = applied([
      level,
      ...shell(600, 400),
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
        entity: { name: "living", type: "living", seed: { x: 100, y: 200 } },
      },
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "kitchen", type: "kitchen", seed: { x: 450, y: 200 } },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "between",
          wall: "divider",
          type: "door",
          variant: "single",
          offset: 155,
          width: 90,
          hinge: "left",
          swing: "in",
        },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "entry",
          wall: "south",
          type: "door",
          variant: "single",
          offset: 400,
          width: 90,
          hinge: "left",
          swing: "in",
        },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "living-window",
          wall: "west",
          type: "window",
          variant: "fixed",
          offset: 100,
          width: 80,
        },
      },
      {
        kind: "object.upsert",
        level: "ground",
        entity: {
          name: "sofa",
          label: "Sofa",
          center: { x: 100, y: 100 },
          width: 80,
          depth: 40,
          rotation: 0,
        },
      },
      {
        kind: "object.upsert",
        level: "ground",
        entity: {
          name: "stray",
          label: "Stray",
          center: { x: -80, y: -80 },
          width: 20,
          depth: 20,
          rotation: 0,
        },
      },
    ]);

    expect(surveyPlan(plan)).toMatchObject({
      revision: 1,
      levels: [
        {
          name: "ground",
          elevationCm: 0,
          order: 0,
          bounds: { x: 0, y: 0, width: 600, height: 400 },
          faceAreaCm2: 240000,
          roomClaimAreaCm2: 240000,
          faces: [
            {
              id: "0,0,300,400",
              areaCm2: 120000,
              rooms: ["living"],
            },
            {
              id: "300,0,300,400",
              areaCm2: 120000,
              rooms: ["kitchen"],
            },
          ],
          rooms: [
            {
              name: "kitchen",
              type: "kitchen",
              faceId: "300,0,300,400",
              widthCm: 300,
              depthCm: 400,
              areaCm2: 120000,
              exteriorDoors: [
                {
                  name: "entry",
                  widthCm: 90,
                  wall: "south",
                  variant: "single",
                },
              ],
              windows: [],
              objects: [],
            },
            {
              name: "living",
              type: "living",
              faceId: "0,0,300,400",
              widthCm: 300,
              depthCm: 400,
              areaCm2: 120000,
              exteriorDoors: [],
              windows: [
                {
                  name: "living-window",
                  widthCm: 80,
                  wall: "west",
                  variant: "fixed",
                },
              ],
              objects: [
                {
                  name: "sofa",
                  label: "Sofa",
                  widthCm: 80,
                  depthCm: 40,
                  rotation: 0,
                },
              ],
            },
          ],
          connections: [
            {
              kind: "door",
              widthCm: 90,
              opening: "between",
              sides: [["kitchen"], ["living"]],
            },
            {
              kind: "door",
              widthCm: 90,
              opening: "entry",
              sides: [["kitchen"], ["outside"]],
            },
          ],
          objectsOutsideRooms: [
            {
              name: "stray",
              label: "Stray",
              widthCm: 20,
              depthCm: 20,
              rotation: 0,
            },
          ],
          stairs: [],
          voids: [],
        },
      ],
    });
  });

  it("counts a shared face once and lists both room names on it", () => {
    const plan = applied([
      level,
      ...shell(600, 400),
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "dining", type: "dining", seed: { x: 200, y: 100 } },
      },
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "kitchen", type: "kitchen", seed: { x: 400, y: 300 } },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "entry",
          wall: "south",
          type: "door",
          variant: "single",
          offset: 250,
          width: 90,
          hinge: "left",
          swing: "in",
        },
      },
      {
        kind: "object.upsert",
        level: "ground",
        entity: {
          name: "table",
          label: "Table",
          center: { x: 300, y: 200 },
          width: 80,
          depth: 80,
          rotation: 0,
        },
      },
    ]);

    const ground = surveyPlan(plan).levels[0];
    expect(ground).toMatchObject({
      faceAreaCm2: 240000,
      roomClaimAreaCm2: 480000,
      faces: [
        {
          id: "0,0,600,400",
          areaCm2: 240000,
          rooms: ["dining", "kitchen"],
        },
      ],
    });
    expect(
      ground?.rooms.map((room) => room.objects.map((object) => object.name)),
    ).toEqual([["table"], ["table"]]);
  });

  it("reports the uncovered length of an open passage", () => {
    const plan = applied([
      level,
      ...shell(900, 600),
      {
        kind: "wall.upsert",
        level: "ground",
        entity: {
          name: "stub",
          a: { x: 450, y: 0 },
          b: { x: 450, y: 100 },
          thickness: 12,
          kind: "interior",
        },
      },
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "east-room", type: "living", seed: { x: 700, y: 300 } },
      },
      {
        kind: "room.upsert",
        level: "ground",
        entity: { name: "west-room", type: "living", seed: { x: 200, y: 300 } },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "entry",
          wall: "east",
          type: "door",
          variant: "single",
          offset: 200,
          width: 90,
          hinge: "left",
          swing: "in",
        },
      },
    ]);

    expect(surveyPlan(plan).levels[0]?.connections).toEqual([
      {
        kind: "door",
        widthCm: 90,
        opening: "entry",
        sides: [["east-room"], ["outside"]],
      },
      {
        kind: "passage",
        widthCm: 500,
        sides: [["east-room"], ["west-room"]],
      },
    ]);
  });

  it("keeps a room whose seed is outside every face", () => {
    const plan = applied([
      level,
      ...shell(600, 400),
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
          wall: "south",
          type: "door",
          variant: "single",
          offset: 250,
          width: 90,
          hinge: "left",
          swing: "in",
        },
      },
    ]);
    const storey = plan.storeys[0];
    if (!storey) throw new Error("expected a storey");
    const broken: HousePlan = {
      ...plan,
      storeys: [
        {
          ...storey,
          rooms: storey.rooms.map((room) =>
            room.name === "living"
              ? { ...room, seed: { x: -10, y: -10 } }
              : room,
          ),
        },
      ],
    };

    expect(surveyPlan(broken).levels[0]).toMatchObject({
      faceAreaCm2: 240000,
      roomClaimAreaCm2: 0,
      faces: [{ id: "0,0,600,400", rooms: [] }],
      rooms: [
        {
          name: "living",
          faceId: null,
          widthCm: null,
          depthCm: null,
          areaCm2: null,
        },
      ],
    });
  });
});
