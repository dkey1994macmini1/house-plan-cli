import type { Bounds, Point, Wall } from "./model.js";

type AxisSegment = Readonly<{ wall: Wall; start: Point; end: Point }>;

const between = (value: number, first: number, second: number): boolean =>
  value >= Math.min(first, second) && value <= Math.max(first, second);
const isHorizontal = (wall: Wall): boolean => wall.a.y === wall.b.y;
const isVertical = (wall: Wall): boolean => wall.a.x === wall.b.x;
const endpoints = (wall: Wall): readonly Point[] => [wall.a, wall.b];

const intersectOrthogonalWalls = (
  horizontal: Wall,
  vertical: Wall,
): Point | undefined => {
  if (!isHorizontal(horizontal) || !isVertical(vertical)) return undefined;
  const point = { x: vertical.a.x, y: horizontal.a.y };
  return between(point.x, horizontal.a.x, horizontal.b.x) &&
    between(point.y, vertical.a.y, vertical.b.y)
    ? point
    : undefined;
};

const splitWallAtPoints = (
  wall: Wall,
  points: readonly Point[],
): readonly AxisSegment[] => {
  const ordered = [
    ...new Map(
      [...endpoints(wall), ...points].map((point) => [
        `${point.x}:${point.y}`,
        point,
      ]),
    ).values(),
  ].toSorted((left, right) =>
    isHorizontal(wall) ? left.x - right.x : left.y - right.y,
  );
  return ordered.slice(0, -1).flatMap((start, index) => {
    const end = ordered[index + 1];
    return end ? [{ wall, start, end }] : [];
  });
};

const intersectionPointsForWall = (
  wall: Wall,
  allWalls: readonly Wall[],
): readonly Point[] =>
  allWalls.flatMap((other) => {
    if (wall.id === other.id) return [];
    return isHorizontal(wall) && isVertical(other)
      ? [intersectOrthogonalWalls(wall, other)].filter(
          (point): point is Point => point !== undefined,
        )
      : isVertical(wall) && isHorizontal(other)
        ? [intersectOrthogonalWalls(other, wall)].filter(
            (point): point is Point => point !== undefined,
          )
        : [];
  });

/** Splits source wall graph virtually. Source walls remain untouched. */
export const deriveSplitSegments = (
  walls: readonly Wall[],
): readonly AxisSegment[] =>
  walls.flatMap((wall) =>
    splitWallAtPoints(wall, intersectionPointsForWall(wall, walls)),
  );

export type DerivedFace = Readonly<{
  bounds: Bounds;
  vertices: readonly Point[];
}>;

/**
 * A free end of an interior stub can mark an open-plan room boundary. Extend
 * its axis to the nearest perpendicular authored wall for zoning only; the
 * extension is never persisted, rendered as a wall, or treated as a barrier.
 */
const zoningExtensions = (walls: readonly Wall[]): readonly Wall[] => {
  const segments = deriveSplitSegments(walls);
  return walls.flatMap((wall) => {
    if (wall.kind !== "interior" || (!isHorizontal(wall) && !isVertical(wall)))
      return [];
    return endpoints(wall).flatMap((tip, index) => {
      if (
        segments.filter((segment) => segmentTouchesPoint(segment, tip))
          .length !== 1
      )
        return [];
      const other = endpoints(wall)[1 - index];
      if (!other) return [];
      const dx = Math.sign(tip.x - other.x);
      const dy = Math.sign(tip.y - other.y);
      const targets = walls.flatMap((candidate) => {
        if (isHorizontal(wall) === isHorizontal(candidate)) return [];
        const crossing = isHorizontal(wall)
          ? { x: candidate.a.x, y: tip.y }
          : { x: tip.x, y: candidate.a.y };
        if (
          !between(crossing.x, candidate.a.x, candidate.b.x) ||
          !between(crossing.y, candidate.a.y, candidate.b.y)
        )
          return [];
        const distance = (crossing.x - tip.x) * dx + (crossing.y - tip.y) * dy;
        return distance > 0 ? [{ crossing, distance }] : [];
      });
      const nearest = targets.toSorted((a, b) => a.distance - b.distance)[0];
      return nearest
        ? [
            {
              ...wall,
              id: `zoning:${wall.id}:${index}`,
              name: `zoning:${wall.name}:${index}`,
              a: tip,
              b: nearest.crossing,
            },
          ]
        : [];
    });
  });
};

const pointKey = (point: Point): string => `${point.x}:${point.y}`;

const signedPolygonAreaCm2 = (vertices: readonly Point[]): number =>
  vertices.reduce((sum, point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return next ? sum + point.x * next.y - next.x * point.y : sum;
  }, 0) / 2;

export const polygonAreaCm2 = (vertices: readonly Point[]): number =>
  Math.abs(signedPolygonAreaCm2(vertices));

const cross = (origin: Point, middle: Point, target: Point): number =>
  (middle.x - origin.x) * (target.y - middle.y) -
  (middle.y - origin.y) * (target.x - middle.x);

const simplifyPolygon = (vertices: readonly Point[]): readonly Point[] =>
  vertices.filter((point, index) => {
    const previous = vertices[(index - 1 + vertices.length) % vertices.length];
    const next = vertices[(index + 1) % vertices.length];
    return previous && next ? cross(previous, point, next) !== 0 : true;
  });

const canonicalPolygon = (vertices: readonly Point[]): readonly Point[] => {
  const start = vertices.reduce((best, point, index) => {
    const bestPoint = vertices[best];
    return !bestPoint ||
      point.y < bestPoint.y ||
      (point.y === bestPoint.y && point.x < bestPoint.x)
      ? index
      : best;
  }, 0);
  return [...vertices.slice(start), ...vertices.slice(0, start)];
};

const boundaryGraph = (
  segments: readonly AxisSegment[],
): ReadonlyMap<string, readonly Point[]> => {
  const graph = new Map<string, Map<string, Point>>();
  const connect = (from: Point, to: Point): void => {
    const neighbors = graph.get(pointKey(from)) ?? new Map<string, Point>();
    neighbors.set(pointKey(to), to);
    graph.set(pointKey(from), neighbors);
  };
  for (const segment of segments) {
    connect(segment.start, segment.end);
    connect(segment.end, segment.start);
  }
  return new Map(
    [...graph.entries()].map(([key, neighbors]) => [
      key,
      [...neighbors.values()].toSorted(
        (left, right) =>
          Math.atan2(
            left.y - Number(key.split(":")[1]),
            left.x - Number(key.split(":")[0]),
          ) -
          Math.atan2(
            right.y - Number(key.split(":")[1]),
            right.x - Number(key.split(":")[0]),
          ),
      ),
    ]),
  );
};

const directedEdgeKey = (from: Point, to: Point): string =>
  `${pointKey(from)}>${pointKey(to)}`;

const boundedPolygons = (
  segments: readonly AxisSegment[],
): readonly (readonly Point[])[] => {
  const graph = boundaryGraph(segments);
  const visited = new Set<string>();
  const polygons: Point[][] = [];
  for (const [fromKey, neighbors] of graph) {
    const from = fromKey.split(":").map(Number);
    if (from.length !== 2) continue;
    for (const to of neighbors) {
      const start = { x: from[0] ?? 0, y: from[1] ?? 0 };
      const firstEdge = directedEdgeKey(start, to);
      if (visited.has(firstEdge)) continue;
      const polygon: Point[] = [];
      let current = start;
      let next = to;
      while (!visited.has(directedEdgeKey(current, next))) {
        visited.add(directedEdgeKey(current, next));
        polygon.push(current);
        const candidates = graph.get(pointKey(next));
        if (!candidates) break;
        const reverse = candidates.findIndex((candidate) =>
          pointsEqual(candidate, current),
        );
        if (reverse < 0) break;
        const following =
          candidates[(reverse - 1 + candidates.length) % candidates.length];
        if (!following) break;
        current = next;
        next = following;
      }
      if (pointsEqual(current, start) && pointsEqual(next, to))
        polygons.push([...simplifyPolygon(polygon)]);
    }
  }
  return polygons.filter((polygon) => signedPolygonAreaCm2(polygon) > 0);
};

const boundedFaceCandidates = (
  walls: readonly Wall[],
): readonly DerivedFace[] => {
  const segments = deriveSplitSegments([...walls, ...zoningExtensions(walls)]);
  return boundedPolygons(segments)
    .map((vertices) => canonicalPolygon(vertices))
    .flatMap((vertices) => {
      const bounds = boundsFromPoints(vertices);
      return bounds ? [{ bounds, vertices }] : [];
    })
    .toSorted(
      (left, right) =>
        left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x,
    );
};

/**
 * A wall loop that touches nothing around it is traced as its own face, but it
 * is not cut out of the face surrounding it; that surrounding face would claim
 * the loop's area, so it cannot be a room zone.
 */
const enclosesFreestandingLoop = (
  face: DerivedFace,
  candidates: readonly DerivedFace[],
): boolean =>
  candidates.some(
    (other) =>
      other !== face &&
      other.vertices.some((vertex) => pointStrictlyInsideFace(face, vertex)),
  );

/** Extracts bounded orthogonal zoning faces, including L- and T-shaped polygons. */
export const extractOrthogonalFaces = (
  walls: readonly Wall[],
): readonly DerivedFace[] => {
  const candidates = boundedFaceCandidates(walls);
  return candidates.filter(
    (face) => !enclosesFreestandingLoop(face, candidates),
  );
};

/** Faces withheld from zoning because a freestanding wall loop floats inside them. */
export const facesEnclosingFreestandingLoops = (
  walls: readonly Wall[],
): readonly DerivedFace[] => {
  const candidates = boundedFaceCandidates(walls);
  return candidates.filter((face) =>
    enclosesFreestandingLoop(face, candidates),
  );
};

const pointOnSegment = (point: Point, start: Point, end: Point): boolean =>
  cross(start, point, end) === 0 &&
  between(point.x, start.x, end.x) &&
  between(point.y, start.y, end.y);

export const pointStrictlyInsideFace = (
  face: DerivedFace,
  point: Point,
): boolean => {
  let inside = false;
  for (const [index, start] of face.vertices.entries()) {
    const end = face.vertices[(index + 1) % face.vertices.length];
    if (!end || pointOnSegment(point, start, end)) return false;
    if (
      start.y > point.y !== end.y > point.y &&
      point.x <
        ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y) + start.x
    )
      inside = !inside;
  }
  return inside;
};

export const faceContainingPoint = (
  faces: readonly DerivedFace[],
  point: Point,
): DerivedFace | undefined =>
  faces.find((face) => pointStrictlyInsideFace(face, point));

const pointsEqual = (left: Point, right: Point): boolean =>
  left.x === right.x && left.y === right.y;
const segmentTouchesPoint = (segment: AxisSegment, point: Point): boolean =>
  pointsEqual(segment.start, point) || pointsEqual(segment.end, point);

/** Detects authored endpoints that do not connect to any other derived segment. */
export const danglingWallEndpoints = (
  walls: readonly Wall[],
): readonly Point[] => {
  const segments = deriveSplitSegments(walls);
  return walls.flatMap((wall) =>
    endpoints(wall).filter(
      (point) =>
        segments.filter((segment) => segmentTouchesPoint(segment, point))
          .length <= 1,
    ),
  );
};

export const boundsFromPoints = (
  points: readonly Point[],
): Bounds | undefined => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return Number.isFinite(minX) &&
    Number.isFinite(maxX) &&
    Number.isFinite(minY) &&
    Number.isFinite(maxY)
    ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    : undefined;
};

/** Immutable derived graph; source walls are never altered. */
export class DerivedTopology {
  constructor(readonly sourceWalls: readonly Wall[]) {}

  get splitSegments(): readonly AxisSegment[] {
    return deriveSplitSegments(this.sourceWalls);
  }

  get faces(): readonly DerivedFace[] {
    return extractOrthogonalFaces(this.sourceWalls);
  }

  get danglingEndpoints(): readonly Point[] {
    return danglingWallEndpoints(this.sourceWalls);
  }

  faceContaining(point: Point): DerivedFace | undefined {
    return faceContainingPoint(this.faces, point);
  }

  surroundsFreestandingLoopAt(point: Point): boolean {
    return facesEnclosingFreestandingLoops(this.sourceWalls).some((face) =>
      pointStrictlyInsideFace(face, point),
    );
  }

  hasFaceBoundaryAt(point: Point): boolean {
    return this.faces.some((face) => this.pointIsOnFaceBoundary(point, face));
  }

  private pointIsOnFaceBoundary(point: Point, face: DerivedFace): boolean {
    return face.vertices.some((start, index) => {
      const end = face.vertices[(index + 1) % face.vertices.length];
      return end ? pointOnSegment(point, start, end) : false;
    });
  }
}
