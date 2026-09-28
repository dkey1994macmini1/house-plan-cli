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

const coversHorizontalEdge = (
  segments: readonly AxisSegment[],
  y: number,
  startX: number,
  endX: number,
): boolean =>
  segments.some(
    (segment) =>
      segment.start.y === y &&
      segment.end.y === y &&
      Math.min(segment.start.x, segment.end.x) <= startX &&
      Math.max(segment.start.x, segment.end.x) >= endX,
  );
const coversVerticalEdge = (
  segments: readonly AxisSegment[],
  x: number,
  startY: number,
  endY: number,
): boolean =>
  segments.some(
    (segment) =>
      segment.start.x === x &&
      segment.end.x === x &&
      Math.min(segment.start.y, segment.end.y) <= startY &&
      Math.max(segment.start.y, segment.end.y) >= endY,
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

/** Extracts each smallest closed orthogonal cell from the virtual split wall graph. */
export const extractOrthogonalFaces = (
  walls: readonly Wall[],
): readonly DerivedFace[] => {
  const segments = deriveSplitSegments(walls);
  const points = segments.flatMap((segment) => [segment.start, segment.end]);
  const xs = [...new Set(points.map((point) => point.x))].toSorted(
    (left, right) => left - right,
  );
  const ys = [...new Set(points.map((point) => point.y))].toSorted(
    (left, right) => left - right,
  );
  return xs.flatMap((x, xIndex) =>
    ys.flatMap((y, yIndex) => {
      const nextX = xs[xIndex + 1];
      const nextY = ys[yIndex + 1];
      if (nextX === undefined || nextY === undefined) return [];
      const bounds = { x, y, width: nextX - x, height: nextY - y };
      return bounds.width > 0 &&
        bounds.height > 0 &&
        hasClosedCellBoundary(segments, bounds)
        ? [{ bounds, vertices: faceVertices(bounds) }]
        : [];
    }),
  );
};

export const faceContainingPoint = (
  faces: readonly DerivedFace[],
  point: Point,
): DerivedFace | undefined =>
  faces.find(
    (face) =>
      point.x > face.bounds.x &&
      point.x < face.bounds.x + face.bounds.width &&
      point.y > face.bounds.y &&
      point.y < face.bounds.y + face.bounds.height,
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
