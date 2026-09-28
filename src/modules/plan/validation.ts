import { StoreyCirculation } from "./circulation.js";
import { PlanObject, StairOccurrence, WallSegment } from "./domain-objects.js";
import { boundsOverlap, isGridCentimetre } from "./geometry.js";
import type { Diagnostic, HousePlan, Named, Storey } from "./model.js";
import {
  type ConnectingStairRun,
  connectingStairRuns,
  runClimbsBetweenAlignedLandings,
  type StairLanding,
  stairRuns,
  upperLandingOpensIntoVoid,
} from "./stair-runs.js";
import {
  type DerivedFace,
  DerivedTopology,
  pointStrictlyInsideFace,
} from "./topology.js";

const error = (
  code: string,
  message: string,
  location?: Record<string, string>,
  suggestion?: string,
  measured?: Diagnostic["measured"],
): Diagnostic => ({
  code,
  severity: "error",
  message,
  ...(location ? { location } : {}),
  ...(suggestion ? { suggestion } : {}),
  ...(measured ? { measured } : {}),
});
const named = <T extends Named>(
  values: readonly T[],
  name: string,
): T | undefined => values.find((value) => value.name === name);

const validateLevels = (plan: HousePlan): readonly Diagnostic[] => {
  const knownNames = new Set<string>();
  return plan.levels.flatMap((level) => {
    const duplicateName = knownNames.has(level.name);
    knownNames.add(level.name);
    const invalidPosition =
      !isGridCentimetre(level.elevationCm) || !Number.isInteger(level.order);
    return [
      ...(duplicateName
        ? [error("LEVEL_DUPLICATE_NAME", `Duplicate level '${level.name}'`)]
        : []),
      ...(invalidPosition
        ? [
            error(
              "LEVEL_INVALID",
              `Level '${level.name}' has invalid elevation/order`,
            ),
          ]
        : []),
    ];
  });
};

const validateStoreyNames = (storey: Storey): readonly Diagnostic[] => {
  const names = new Set<string>();
  const entities = [
    ...storey.walls,
    ...storey.rooms,
    ...storey.openings,
    ...storey.objects,
    ...storey.stairs,
    ...storey.voids,
    ...storey.annotations,
    ...storey.dimensions,
  ];
  return entities.flatMap((entity) => {
    const duplicate = names.has(entity.name);
    names.add(entity.name);
    return duplicate
      ? [
          error("NAME_DUPLICATE", `Duplicate entity '${entity.name}'`, {
            storeyId: storey.id,
          }),
        ]
      : [];
  });
};

const validateWall = (wall: Storey["walls"][number]): readonly Diagnostic[] => {
  const segment = new WallSegment(wall);
  return [
    ...(!segment.hasValidMeasurements
      ? [
          error(
            "WALL_INVALID_MEASUREMENT",
            `Wall '${wall.name}' has invalid centimetre measurements`,
            { wall: wall.name },
          ),
        ]
      : []),
    ...(!segment.isOrthogonal
      ? [
          error(
            "WALL_NON_ORTHOGONAL",
            `Wall '${wall.name}' must be orthogonal`,
            { wall: wall.name },
          ),
        ]
      : []),
    ...(segment.lengthCm === 0
      ? [
          error(
            "WALL_ZERO_LENGTH",
            `Wall '${wall.name}' has zero length`,
            {
              wall: wall.name,
            },
            undefined,
            { value: segment.lengthCm, unit: "cm", limit: 0 },
          ),
        ]
      : []),
  ];
};

const validateRoomSeeds = (storey: Storey): readonly Diagnostic[] => {
  const topology = new DerivedTopology(storey.walls);
  return storey.rooms.flatMap((room) => {
    if (topology.hasFaceBoundaryAt(room.seed))
      return [
        error(
          "ROOM_SEED_AMBIGUOUS",
          `Room '${room.name}' seed lies on a derived face boundary`,
          { room: room.name },
          "Move the seed inside exactly one closed face.",
        ),
      ];
    if (topology.faceContaining(room.seed)) return [];
    return [
      error(
        "ROOM_FACE_NOT_FOUND",
        `Room '${room.name}' seed has no unique closed face`,
        { room: room.name },
        topology.surroundsFreestandingLoopAt(room.seed)
          ? "The zone around this seed contains a freestanding wall loop; connect that enclosure to a boundary wall so the zone is split."
          : "Close a wall face around the seed or move the seed inside it.",
      ),
    ];
  });
};

const validateRoomAccess = (
  storey: Storey,
  connectingStairIds: ReadonlySet<string>,
): readonly Diagnostic[] => {
  const circulation = new StoreyCirculation(storey);
  const holdsConnectingStair = (face: DerivedFace): boolean =>
    storey.stairs.some(
      (stair) =>
        connectingStairIds.has(stair.id) &&
        pointStrictlyInsideFace(face, new StairOccurrence(stair).center),
    );
  return storey.rooms.flatMap((room) => {
    const face = circulation.faceForRoom(room);
    if (!face) return [];
    return [
      ...(!circulation.hasExit(face) && !holdsConnectingStair(face)
        ? [
            error(
              "ROOM_WITHOUT_DOOR",
              `Room '${room.name}' has no physical door or pass-through`,
              { room: room.name },
              "Add a door on its actual shared boundary or a physical passage to an adjacent zone.",
            ),
          ]
        : []),
    ];
  });
};

const nodeId = (storeyId: string, face: number): string =>
  `${storeyId}:${face}`;

const validateBuildingReachability = (
  plan: HousePlan,
  connectingRuns: readonly ConnectingStairRun[],
): readonly Diagnostic[] => {
  const outside = "outside";
  const graph = new Map<string, Set<string>>([[outside, new Set()]]);
  const connect = (left: string, right: string): void => {
    graph.get(left)?.add(right);
    graph.get(right)?.add(left);
  };
  const circulations = new Map(
    plan.storeys.map((storey) => [storey.id, new StoreyCirculation(storey)]),
  );
  for (const storey of plan.storeys) {
    const circulation = circulations.get(storey.id);
    if (!circulation) continue;
    circulation.faces.forEach((_, index) => {
      graph.set(nodeId(storey.id, index), new Set());
    });
    for (const access of circulation.accesses()) {
      const [left, right] = access.sides;
      connect(
        left === "outside" ? outside : nodeId(storey.id, left),
        right === "outside" ? outside : nodeId(storey.id, right),
      );
    }
  }
  const landingFace = (landing: StairLanding): number => {
    const center = new StairOccurrence(landing.stair).center;
    return (
      circulations
        .get(landing.storey.id)
        ?.faces.findIndex((face) => pointStrictlyInsideFace(face, center)) ?? -1
    );
  };
  for (const { lower, upper } of connectingRuns) {
    const lowerFace = landingFace(lower);
    const upperFace = landingFace(upper);
    if (lowerFace >= 0 && upperFace >= 0)
      connect(
        nodeId(lower.storey.id, lowerFace),
        nodeId(upper.storey.id, upperFace),
      );
  }
  const visited = new Set([outside]);
  const queue = [outside];
  for (const current of queue) {
    for (const neighbor of graph.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return plan.storeys.flatMap((storey) => {
    const circulation = circulations.get(storey.id);
    if (!circulation) return [];
    return storey.rooms.flatMap((room) => {
      const face = circulation.faceForRoom(room);
      const index = face ? circulation.faces.indexOf(face) : -1;
      return index >= 0 && !visited.has(nodeId(storey.id, index))
        ? [
            error(
              "ROOM_NOT_REACHABLE_FROM_ENTRY",
              `Room '${room.name}' has no walkable path to an exterior entry door`,
              { room: room.name },
              "Connect this room through doors, passages, or a valid paired stair run.",
            ),
          ]
        : [];
    });
  });
};

const openingCrossesWallJunction = (
  opening: Storey["openings"][number],
  host: Storey["walls"][number],
  walls: readonly Storey["walls"][number][],
): boolean => {
  const hostSegment = new WallSegment(host);
  const { start, end } = hostSegment.openingEndpoints(opening);
  const horizontal = host.a.y === host.b.y;
  const withinOpening = (point: { x: number; y: number }): boolean =>
    horizontal
      ? point.y === host.a.y &&
        point.x > Math.min(start.x, end.x) &&
        point.x < Math.max(start.x, end.x)
      : point.x === host.a.x &&
        point.y > Math.min(start.y, end.y) &&
        point.y < Math.max(start.y, end.y);
  return walls
    .filter((wall) => wall.id !== host.id)
    .flatMap((wall) => [wall.a, wall.b])
    .some(withinOpening);
};

const validateOpeningPlacement = (storey: Storey): readonly Diagnostic[] =>
  storey.openings.flatMap((opening) => {
    const host = named(storey.walls, opening.wall);
    if (!host)
      return [
        error(
          "OPENING_WALL_NOT_FOUND",
          `Opening '${opening.name}' references '${opening.wall}'`,
          { opening: opening.name },
        ),
      ];
    const hostWall = new WallSegment(host);
    const invalidMeasurement =
      !isGridCentimetre(opening.offset) || !isGridCentimetre(opening.width);
    return [
      ...(invalidMeasurement || !hostWall.containsOpening(opening)
        ? [
            error(
              "OPENING_OUTSIDE_WALL",
              `Opening '${opening.name}' does not fit '${host.name}'`,
              { opening: opening.name, wall: host.name },
              "Keep offset > 0 and offset + width below the host wall length.",
              invalidMeasurement
                ? undefined
                : {
                    value: opening.offset + opening.width,
                    unit: "cm",
                    limit: hostWall.lengthCm,
                  },
            ),
          ]
        : []),
      ...(openingCrossesWallJunction(opening, host, storey.walls)
        ? [
            error(
              "OPENING_CROSSES_WALL_JUNCTION",
              `Opening '${opening.name}' crosses a junction on '${host.name}'`,
              { opening: opening.name, wall: host.name },
              "Move the opening between wall junctions.",
            ),
          ]
        : []),
    ];
  });

const validateOpeningCollisions = (storey: Storey): readonly Diagnostic[] =>
  storey.openings.flatMap((opening, index) =>
    storey.openings.slice(index + 1).flatMap((other) => {
      const host = named(storey.walls, opening.wall);
      return host && new WallSegment(host).overlaps(opening, other)
        ? [
            error(
              "OPENING_OVERLAP",
              `Openings '${opening.name}' and '${other.name}' overlap`,
              { opening: opening.name },
            ),
          ]
        : [];
    }),
  );

const validateObjects = (storey: Storey): readonly Diagnostic[] =>
  storey.objects.flatMap((object, index) => {
    const subject = new PlanObject(object);
    const ownDiagnostics =
      !subject.hasValidBounds || !subject.hasValidClearance
        ? [
            error(
              "OBJECT_INVALID",
              `Object '${object.name}' has invalid bounds or clearance`,
              { object: object.name },
            ),
          ]
        : [];
    const collisionDiagnostics = storey.objects
      .slice(index + 1)
      .flatMap((other) => {
        const counterpart = new PlanObject(other);
        return [
          ...(subject.collidesWith(counterpart)
            ? [
                {
                  code: "OBJECT_COLLIDES",
                  severity: "warning" as const,
                  message: `Objects '${object.name}' and '${other.name}' overlap`,
                  location: { object: object.name },
                },
              ]
            : []),
          ...(subject.clearanceOverlaps(counterpart.bounds) ||
          counterpart.clearanceOverlaps(subject.bounds)
            ? [
                {
                  code: "CLEARANCE_OBJECT_COLLISION",
                  severity: "warning" as const,
                  message: `Clearance of '${object.name}' or '${other.name}' overlaps an object`,
                  location: { object: object.name },
                },
              ]
            : []),
        ];
      });
    const wallDiagnostics = storey.walls.flatMap((wall) => {
      const host = new WallSegment(wall);
      return [
        ...(host.intersects(subject.bounds)
          ? [
              error(
                "OBJECT_WALL_COLLISION",
                `Object '${object.name}' intersects wall '${wall.name}'`,
                { object: object.name, wall: wall.name },
                "Move or resize the object so its footprint clears the wall thickness.",
              ),
            ]
          : []),
        ...(subject.clearanceBounds && host.intersects(subject.clearanceBounds)
          ? [
              {
                code: "CLEARANCE_WALL_COLLISION",
                severity: "warning" as const,
                message: `Clearance of '${object.name}' overlaps wall '${wall.name}'`,
                location: { object: object.name, wall: wall.name },
              },
            ]
          : []),
      ];
    });
    return [...ownDiagnostics, ...wallDiagnostics, ...collisionDiagnostics];
  });

const validateDoorSwingCollisions = (storey: Storey): readonly Diagnostic[] =>
  storey.openings.flatMap((opening) => {
    const host = named(storey.walls, opening.wall);
    if (!host) return [];
    const swing = new WallSegment(host).doorSwingBounds(opening);
    if (!swing) return [];
    return storey.objects.flatMap((object) => {
      const subject = new PlanObject(object);
      return [
        ...(boundsOverlap(swing, subject.bounds)
          ? [
              error(
                "DOOR_SWING_OBJECT_COLLISION",
                `Door '${opening.name}' swing collides with object '${object.name}'`,
                { opening: opening.name, object: object.name },
                "Move the object or change the door hinge/swing direction.",
              ),
            ]
          : []),
        ...(subject.clearanceOverlaps(swing)
          ? [
              {
                code: "DOOR_SWING_CLEARANCE_COLLISION",
                severity: "warning" as const,
                message: `Door '${opening.name}' swing overlaps clearance of '${object.name}'`,
                location: { opening: opening.name, object: object.name },
              },
            ]
          : []),
      ];
    });
  });

const validateDoorStairApproaches = (storey: Storey): readonly Diagnostic[] =>
  storey.openings.flatMap((opening) => {
    const host = named(storey.walls, opening.wall);
    if (!host) return [];
    const approach = new WallSegment(host).doorApproachBounds(opening);
    if (!approach) return [];
    return storey.stairs.flatMap((stair) =>
      new StairOccurrence(stair).obstructsDoorApproach(approach)
        ? [
            error(
              "DOOR_STAIR_APPROACH_COLLISION",
              `Stair '${stair.name}' obstructs the approach to door '${opening.name}'`,
              { opening: opening.name, stair: stair.name },
              "Move the stair footprint or doorway so both sides of the threshold have unobstructed depth equal to the door width.",
            ),
          ]
        : [],
    );
  });

const validateStairRuns = (plan: HousePlan): readonly Diagnostic[] =>
  stairRuns(plan).flatMap(({ run, landings }) => {
    const [lower, upper] = landings;
    if (!lower || !upper || landings.length !== 2)
      return [
        error(
          "STAIR_RUN_UNPAIRED",
          `Stair run '${run}' must occur exactly twice`,
          { stair: (lower ?? upper)?.stair.name ?? run },
        ),
      ];
    const footprintOffsetCm = new StairOccurrence(
      lower.stair,
    ).footprintOffsetCm(new StairOccurrence(upper.stair));
    return [
      ...(!runClimbsBetweenAlignedLandings(lower, upper)
        ? [
            error(
              "STAIR_RUN_MISMATCH",
              `Stair run '${run}' has invalid direction or footprint`,
              { stair: lower.stair.name },
              undefined,
              footprintOffsetCm > 0
                ? { value: footprintOffsetCm, unit: "cm", limit: 0 }
                : undefined,
            ),
          ]
        : []),
      ...(!upperLandingOpensIntoVoid(upper)
        ? [
            error(
              "STAIR_VOID_MISSING",
              `Upper stair '${upper.stair.name}' is not contained by a void`,
              { stair: upper.stair.name },
            ),
          ]
        : []),
    ];
  });

export const validate = (plan: HousePlan): readonly Diagnostic[] => {
  const connectingRuns = connectingStairRuns(plan);
  const connectingStairIds = new Set(
    connectingRuns.flatMap(({ lower, upper }) => [
      lower.stair.id,
      upper.stair.id,
    ]),
  );
  return [
    ...validateLevels(plan),
    ...plan.storeys.flatMap((storey) => [
      ...validateStoreyNames(storey),
      ...storey.walls.flatMap(validateWall),
      ...validateRoomSeeds(storey),
      ...validateRoomAccess(storey, connectingStairIds),
      ...validateOpeningPlacement(storey),
      ...validateOpeningCollisions(storey),
      ...validateObjects(storey),
      ...validateDoorSwingCollisions(storey),
      ...validateDoorStairApproaches(storey),
    ]),
    ...validateStairRuns(plan),
    ...validateBuildingReachability(plan, connectingRuns),
  ].toSorted(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );
};
