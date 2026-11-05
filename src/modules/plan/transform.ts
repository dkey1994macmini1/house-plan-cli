import { WallSegment } from "./domain-objects.js";
import { canonicalCentimetre } from "./geometry.js";
import type {
  Bounds,
  Failure,
  HousePlan,
  ObjectBox,
  Opening,
  Point,
  SiteDirection,
  SiteElement,
  Storey,
  Wall,
} from "./model.js";
import { failure } from "./result.js";
import { validate } from "./validation.js";

export type TransformMode =
  | "reflect-x"
  | "reflect-y"
  | "reflect-diagonal"
  | "rotate-90"
  | "rotate-180"
  | "rotate-270"
  | "translate";

export const transformModes: readonly TransformMode[] = [
  "reflect-x",
  "reflect-y",
  "reflect-diagonal",
  "rotate-90",
  "rotate-180",
  "rotate-270",
  "translate",
];

export type TransformOptions = Readonly<{
  mode: TransformMode;
  dx?: number;
  dy?: number;
}>;

const storeyWallExtent = (storey: Storey): Bounds => {
  const points = storey.walls.flatMap((wall) => [wall.a, wall.b]);
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const pointMapper = (
  extent: Bounds,
  options: TransformOptions,
): ((point: Point) => Point) => {
  const minX = extent.x;
  const maxX = extent.x + extent.width;
  const minY = extent.y;
  const maxY = extent.y + extent.height;
  const dx = options.dx ?? 0;
  const dy = options.dy ?? 0;

  return (point: Point): Point => {
    switch (options.mode) {
      case "translate":
        return {
          x: canonicalCentimetre(point.x + dx),
          y: canonicalCentimetre(point.y + dy),
        };
      case "reflect-x":
        return {
          x: canonicalCentimetre(minX + maxX - point.x),
          y: canonicalCentimetre(point.y),
        };
      case "reflect-y":
        return {
          x: canonicalCentimetre(point.x),
          y: canonicalCentimetre(minY + maxY - point.y),
        };
      case "reflect-diagonal":
        // Reflects across the top-left (minX, maxY) to bottom-right (maxX, minY) diagonal
        return {
          x: canonicalCentimetre(maxY - point.y),
          y: canonicalCentimetre(maxX - point.x),
        };
      case "rotate-90":
        return {
          x: canonicalCentimetre(point.y - minY),
          y: canonicalCentimetre(maxX - point.x),
        };
      case "rotate-180":
        return {
          x: canonicalCentimetre(minX + maxX - point.x),
          y: canonicalCentimetre(minY + maxY - point.y),
        };
      case "rotate-270":
        return {
          x: canonicalCentimetre(maxY - point.y),
          y: canonicalCentimetre(point.x - minX),
        };
    }
  };
};

const transformRotation = (
  rotation: ObjectBox["rotation"],
  mode: TransformMode,
): ObjectBox["rotation"] => {
  const table: Record<
    TransformMode,
    Record<ObjectBox["rotation"], ObjectBox["rotation"]>
  > = {
    translate: { 0: 0, 90: 90, 180: 180, 270: 270 },
    "reflect-x": { 0: 0, 90: 270, 180: 180, 270: 90 },
    "reflect-y": { 0: 180, 90: 90, 180: 0, 270: 270 },
    "reflect-diagonal": { 0: 90, 90: 0, 180: 270, 270: 180 },
    "rotate-90": { 0: 270, 90: 0, 180: 90, 270: 180 },
    "rotate-180": { 0: 180, 90: 270, 180: 0, 270: 90 },
    "rotate-270": { 0: 90, 90: 180, 180: 270, 270: 0 },
  };
  return table[mode][rotation];
};

const transformDirection = (
  direction: SiteDirection,
  mode: TransformMode,
): SiteDirection => {
  const table: Record<TransformMode, Record<SiteDirection, SiteDirection>> = {
    translate: { north: "north", south: "south", east: "east", west: "west" },
    "reflect-x": { north: "north", south: "south", east: "west", west: "east" },
    "reflect-y": { north: "south", south: "north", east: "east", west: "west" },
    "reflect-diagonal": {
      north: "west",
      south: "east",
      east: "south",
      west: "north",
    },
    "rotate-90": { north: "east", east: "south", south: "west", west: "north" },
    "rotate-180": {
      north: "south",
      south: "north",
      east: "west",
      west: "east",
    },
    "rotate-270": {
      north: "west",
      west: "south",
      south: "east",
      east: "north",
    },
  };
  return table[mode][direction];
};

const transformBounds = (
  bounds: Bounds,
  mapPoint: (point: Point) => Point,
): Bounds => {
  const p1 = mapPoint({ x: bounds.x, y: bounds.y });
  const p2 = mapPoint({
    x: bounds.x + bounds.width,
    y: bounds.y + bounds.height,
  });
  return {
    x: canonicalCentimetre(Math.min(p1.x, p2.x)),
    y: canonicalCentimetre(Math.min(p1.y, p2.y)),
    width: canonicalCentimetre(Math.abs(p2.x - p1.x)),
    height: canonicalCentimetre(Math.abs(p2.y - p1.y)),
  };
};

const canonicalWall = (wall: Wall, mapPoint: (point: Point) => Point): Wall => {
  const p1 = mapPoint(wall.a);
  const p2 = mapPoint(wall.b);
  const vertical = p1.x === p2.x;
  const a = vertical
    ? { x: p1.x, y: Math.min(p1.y, p2.y) }
    : { x: Math.min(p1.x, p2.x), y: p1.y };
  const b = vertical
    ? { x: p1.x, y: Math.max(p1.y, p2.y) }
    : { x: Math.max(p1.x, p2.x), y: p1.y };
  return { ...wall, a, b };
};

const distanceBetween = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const transformOpening = (
  opening: Opening,
  oldWalls: ReadonlyMap<string, Wall>,
  newWalls: ReadonlyMap<string, Wall>,
  mapPoint: (point: Point) => Point,
): Opening => {
  const oldHost = oldWalls.get(opening.wall);
  const newHost = newWalls.get(opening.wall);
  if (!oldHost || !newHost) return opening;

  const oldSegment = new WallSegment(oldHost);
  const { start, end } = oldSegment.openingEndpoints(opening);
  const mappedStart = mapPoint(start);
  const mappedEnd = mapPoint(end);

  const distStart = distanceBetween(newHost.a, mappedStart);
  const distEnd = distanceBetween(newHost.a, mappedEnd);
  const offset = canonicalCentimetre(Math.min(distStart, distEnd));

  if (opening.type !== "door" || opening.variant === "sliding") {
    return { ...opening, offset };
  }

  const oldDoorGeom = oldSegment.doorGeometry(opening);
  if (!oldDoorGeom) return { ...opening, offset };

  const targetHinge = mapPoint(oldDoorGeom.hinge);
  const targetOpenLeaf = mapPoint(oldDoorGeom.openLeaf);
  const newSegment = new WallSegment(newHost);

  const candidates: readonly {
    hinge: "left" | "right";
    swing: "in" | "out";
  }[] = [
    { hinge: "left", swing: "in" },
    { hinge: "left", swing: "out" },
    { hinge: "right", swing: "in" },
    { hinge: "right", swing: "out" },
  ];

  const matched = candidates.find((candidate) => {
    const geom = newSegment.doorGeometry({
      ...opening,
      offset,
      hinge: candidate.hinge,
      swing: candidate.swing,
    });
    return (
      geom !== undefined &&
      distanceBetween(geom.hinge, targetHinge) < 0.5 &&
      distanceBetween(geom.openLeaf, targetOpenLeaf) < 0.5
    );
  }) ?? {
    hinge: opening.hinge ?? "left",
    swing: opening.swing ?? "in",
  };

  return {
    ...opening,
    offset,
    hinge: matched.hinge,
    swing: matched.swing,
  };
};

const isReflection = (mode: TransformMode): boolean =>
  mode === "reflect-x" || mode === "reflect-y" || mode === "reflect-diagonal";

const transformSite = (
  site: SiteElement,
  mapPoint: (point: Point) => Point,
  mode: TransformMode,
): SiteElement => ({
  ...site,
  ...(site.bounds ? { bounds: transformBounds(site.bounds, mapPoint) } : {}),
  ...(site.points
    ? {
        points: isReflection(mode)
          ? site.points.map(mapPoint).toReversed()
          : site.points.map(mapPoint),
      }
    : {}),
  ...(site.direction
    ? { direction: transformDirection(site.direction, mode) }
    : {}),
});

const transformStorey = (storey: Storey, options: TransformOptions): Storey => {
  const extent = storeyWallExtent(storey);
  const mapPoint = pointMapper(extent, options);
  const oldWalls = new Map(storey.walls.map((w) => [w.name, w]));
  const walls = storey.walls.map((wall) => canonicalWall(wall, mapPoint));
  const newWalls = new Map(walls.map((w) => [w.name, w]));

  return {
    ...storey,
    walls,
    rooms: storey.rooms.map((room) => ({
      ...room,
      seed: mapPoint(room.seed),
    })),
    openings: storey.openings.map((opening) =>
      transformOpening(opening, oldWalls, newWalls, mapPoint),
    ),
    objects: storey.objects.map((object) => ({
      ...object,
      center: mapPoint(object.center),
      rotation: transformRotation(object.rotation, options.mode),
    })),
    stairs: storey.stairs.map((stair) => ({
      ...stair,
      bounds: transformBounds(stair.bounds, mapPoint),
    })),
    voids: storey.voids.map((voidItem) => ({
      ...voidItem,
      bounds: transformBounds(voidItem.bounds, mapPoint),
    })),
    annotations: storey.annotations.map((annotation) => ({
      ...annotation,
      at: mapPoint(annotation.at),
    })),
    dimensions: storey.dimensions.map((dimension) => ({
      ...dimension,
      a: mapPoint(dimension.a),
      b: mapPoint(dimension.b),
    })),
    ...(storey.sites
      ? {
          sites: storey.sites.map((site) =>
            transformSite(site, mapPoint, options.mode),
          ),
        }
      : {}),
  };
};

export const transformPlan = (
  plan: HousePlan,
  expectedRevision: number,
  options: TransformOptions,
): HousePlan | Failure => {
  if (plan.revision !== expectedRevision)
    return failure(
      "revision_conflict",
      `Expected revision ${expectedRevision}; plan is ${plan.revision}`,
      "Read the plan and retry with its current revision.",
    );
  const candidate: HousePlan = {
    ...plan,
    revision: plan.revision + 1,
    storeys: plan.storeys.map((storey) => transformStorey(storey, options)),
  };
  const diagnostics = validate(candidate);
  return diagnostics.some((diagnostic) => diagnostic.severity === "error")
    ? failure(
        "invalid_input",
        "Transformation would violate plan invariants",
        "Fix diagnostics and retry; no changes were written.",
        diagnostics,
      )
    : candidate;
};
