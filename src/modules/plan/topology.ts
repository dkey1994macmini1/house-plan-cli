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

const coversInterval = (
  ranges: readonly Readonly<{ start: number; end: number }>[],
  start: number,
  end: number,
): boolean => {
  let coveredUntil = start;
  for (const range of ranges.toSorted(
    (left, right) => left.start - right.start,
  )) {
    if (range.start > coveredUntil) return false;
    coveredUntil = Math.max(coveredUntil, range.end);
    if (coveredUntil >= end) return true;
  }
  return false;
};

const coversHorizontalEdge = (
  segments: readonly AxisSegment[],
  y: number,
  startX: number,
  endX: number,
): boolean =>
  coversInterval(
    segments
      .filter((segment) => segment.start.y === y && segment.end.y === y)
      .map((segment) => ({
        start: Math.min(segment.start.x, segment.end.x),
        end: Math.max(segment.start.x, segment.end.x),
      })),
    startX,
    endX,
  );
const coversVerticalEdge = (
  segments: readonly AxisSegment[],
  x: number,
  startY: number,
  endY: number,
): boolean =>
  coversInterval(
    segments
      .filter((segment) => segment.start.x === x && segment.end.x === x)
      .map((segment) => ({
        start: Math.min(segment.start.y, segment.end.y),
        end: Math.max(segment.start.y, segment.end.y),
      })),
    startY,
    endY,
  );
const hasClosedCellBoundary = (
  segments: readonly AxisSegment[],
  bounds: Bounds,
): boolean =>
  coversHorizontalEdge(segments, bounds.y, bounds.x, bounds.x + bounds.width) &&
  coversHorizontalEdge(
    segments,
    bounds.y + bounds.height,
    bounds.x,
    bounds.x + bounds.width,
  ) &&
  coversVerticalEdge(segments, bounds.x, bounds.y, bounds.y + bounds.height) &&
  coversVerticalEdge(
    segments,
    bounds.x + bounds.width,
    bounds.y,
    bounds.y + bounds.height,
  );
const faceVertices = (bounds: Bounds): readonly Point[] => [
  { x: bounds.x, y: bounds.y },
  { x: bounds.x + bounds.width, y: bounds.y },
  { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  { x: bounds.x, y: bounds.y + bounds.height },
];

const hasInteriorWall = (
  segments: readonly AxisSegment[],
  bounds: Bounds,
): boolean =>
  segments.some((segment) => {
    const horizontalInside =
      segment.start.y === segment.end.y &&
      segment.start.y > bounds.y &&
      segment.start.y < bounds.y + bounds.height &&
      Math.max(segment.start.x, segment.end.x) > bounds.x &&
      Math.min(segment.start.x, segment.end.x) < bounds.x + bounds.width;
    const verticalInside =
      segment.start.x === segment.end.x &&
      segment.start.x > bounds.x &&
      segment.start.x < bounds.x + bounds.width &&
      Math.max(segment.start.y, segment.end.y) > bounds.y &&
      Math.min(segment.start.y, segment.end.y) < bounds.y + bounds.height;
    return horizontalInside || verticalInside;
  });

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

/** Extracts rectangular zoning faces; partial walls may mark open boundaries. */
export const extractOrthogonalFaces = (
  walls: readonly Wall[],
): readonly DerivedFace[] => {
  const segments = deriveSplitSegments([...walls, ...zoningExtensions(walls)]);
  const points = segments.flatMap((segment) => [segment.start, segment.end]);
  const xs = [...new Set(points.map((point) => point.x))].toSorted(
    (left, right) => left - right,
  );
  const ys = [...new Set(points.map((point) => point.y))].toSorted(
    (left, right) => left - right,
  );
  return xs
    .flatMap((x, startX) =>
      ys.flatMap((y, startY) =>
        xs.slice(startX + 1).flatMap((right) =>
          ys.slice(startY + 1).flatMap((top) => {
            const bounds = { x, y, width: right - x, height: top - y };
            return hasClosedCellBoundary(segments, bounds) &&
              !hasInteriorWall(segments, bounds)
              ? [{ bounds, vertices: faceVertices(bounds) }]
              : [];
          }),
        ),
      ),
    )
    .toSorted(
      (left, right) =>
        left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x,
    );
};

export const faceContainingPoint = (
  faces: readonly DerivedFace[],
  point: Point,
): DerivedFace | undefined =>
  faces.find(
    (face) =>
      point.x >= face.bounds.x &&
      point.x <= face.bounds.x + face.bounds.width &&
      point.y >= face.bounds.y &&
      point.y <= face.bounds.y + face.bounds.height,
  );

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

  hasFaceBoundaryAt(point: Point): boolean {
    return this.faces.some((face) => this.pointIsOnFaceBoundary(point, face));
  }

  private pointIsOnFaceBoundary(point: Point, face: DerivedFace): boolean {
    const { x, y, width, height } = face.bounds;
    const onHorizontal =
      (point.y === y || point.y === y + height) &&
      point.x >= x &&
      point.x <= x + width;
    const onVertical =
      (point.x === x || point.x === x + width) &&
      point.y >= y &&
      point.y <= y + height;
    return onHorizontal || onVertical;
  }
}
