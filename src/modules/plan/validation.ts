import { PlanObject, StairOccurrence, WallSegment } from "./domain-objects.js";
import { boundsOverlap, isGridCentimetre } from "./geometry.js";
import type { Diagnostic, HousePlan, Named, Storey } from "./model.js";
import { DerivedTopology } from "./topology.js";

const error = (
  code: string,
  message: string,
  location?: Record<string, string>,
  suggestion?: string,
): Diagnostic => ({
  code,
  severity: "error",
  message,
  ...(location ? { location } : {}),
  ...(suggestion ? { suggestion } : {}),
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
          error("WALL_ZERO_LENGTH", `Wall '${wall.name}' has zero length`, {
            wall: wall.name,
          }),
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
    return topology.faceContaining(room.seed)
      ? []
      : [
          error(
            "ROOM_FACE_NOT_FOUND",
            `Room '${room.name}' seed has no unique closed face`,
            { room: room.name },
            "Close a wall face around the seed or move the seed inside it.",
          ),
        ];
  });
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
    return invalidMeasurement || !hostWall.containsOpening(opening)
      ? [
          error(
            "OPENING_OUTSIDE_WALL",
            `Opening '${opening.name}' does not fit '${host.name}'`,
            { opening: opening.name, wall: host.name },
          ),
        ]
      : [];
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
    return [...ownDiagnostics, ...collisionDiagnostics];
  });

const validateDoorSwingCollisions = (storey: Storey): readonly Diagnostic[] =>
  storey.openings.flatMap((opening) => {
    const host = named(storey.walls, opening.wall);
    const swing = host
      ? new WallSegment(host).doorSwingBounds(opening)
      : undefined;
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

const validateStairRuns = (plan: HousePlan): readonly Diagnostic[] => {
  const occurrences = plan.storeys.flatMap((storey) => {
    const level = plan.levels.find(
      (candidate) => candidate.id === storey.levelId,
    );
    return level
      ? storey.stairs.map((stair) => ({
          stair,
          storey,
          level,
          occurrence: new StairOccurrence(stair),
        }))
      : [];
  });
  const representatives = [
    ...new Map(occurrences.map((item) => [item.stair.run, item])).values(),
  ];
  return representatives.flatMap((current) => {
    const pair = occurrences
      .filter((candidate) => candidate.stair.run === current.stair.run)
      .toSorted((left, right) => left.level.order - right.level.order);
    const [lower, upper] = pair;
    if (!lower || !upper || pair.length !== 2)
      return [
        error(
          "STAIR_RUN_UNPAIRED",
          `Stair run '${current.stair.run}' must occur exactly twice`,
          { stair: current.stair.name },
        ),
      ];
    const directionsOrFootprintsMismatch =
      lower.stair.direction !== "up" ||
      upper.stair.direction !== "down" ||
      !lower.occurrence.matchesCounterpart(upper.occurrence);
    const upperVoidMissing = !upper.storey.voids.some((voidItem) =>
      upper.occurrence.isContainedBy(voidItem.bounds),
    );
    return [
      ...(directionsOrFootprintsMismatch
        ? [
            error(
              "STAIR_RUN_MISMATCH",
              `Stair run '${current.stair.run}' has invalid direction or footprint`,
              { stair: current.stair.name },
            ),
          ]
        : []),
      ...(upperVoidMissing
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
};

export const validate = (plan: HousePlan): readonly Diagnostic[] =>
  [
    ...validateLevels(plan),
    ...plan.storeys.flatMap((storey) => [
      ...validateStoreyNames(storey),
      ...storey.walls.flatMap(validateWall),
      ...validateRoomSeeds(storey),
      ...validateOpeningPlacement(storey),
      ...validateOpeningCollisions(storey),
      ...validateObjects(storey),
      ...validateDoorSwingCollisions(storey),
    ]),
    ...validateStairRuns(plan),
  ].toSorted(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );
