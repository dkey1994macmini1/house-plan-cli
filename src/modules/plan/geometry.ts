import type { Bounds, Point, Wall } from "./model.js";

export const isGridCentimetre = (value: number): boolean =>
  Number.isFinite(value) && Number.isInteger(value * 10);

/** Canonical public-cm representation backed by integer millimetres. */
export const canonicalCentimetre = (value: number): number =>
  Math.round(value * 10) / 10;

export const hasOnlyGridCentimetres = (values: readonly number[]): boolean =>
  values.every(isGridCentimetre);

export const boundsFromCenter = (
  center: Point,
  width: number,
  height: number,
): Bounds => ({
  x: center.x - width / 2,
  y: center.y - height / 2,
  width,
  height,
});

export const containsPoint = (bounds: Bounds, point: Point): boolean =>
  point.x >= bounds.x &&
  point.x <= bounds.x + bounds.width &&
  point.y >= bounds.y &&
  point.y <= bounds.y + bounds.height;

export const containsBounds = (outer: Bounds, inner: Bounds): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

export const boundsOverlap = (left: Bounds, right: Bounds): boolean =>
  left.x < right.x + right.width &&
  right.x < left.x + left.width &&
  left.y < right.y + right.height &&
  right.y < left.y + left.height;

export const sameBounds = (left: Bounds, right: Bounds): boolean =>
  left.x === right.x &&
  left.y === right.y &&
  left.width === right.width &&
  left.height === right.height;

export const wallLength = (wall: Wall): number =>
  Math.abs(wall.a.x - wall.b.x) + Math.abs(wall.a.y - wall.b.y);

const key = (start: Point, end: Point): string =>
  `${start.x},${start.y}:${end.x},${end.y}`;

/** Returns a rectangular face only when all four authored boundary segments close it. */
export const extractSingleRectangularFace = (
  walls: readonly Wall[],
): Bounds | undefined => {
  if (walls.length < 4) return undefined;
  const xs = [
    ...new Set(walls.flatMap((wall) => [wall.a.x, wall.b.x])),
  ].toSorted((a, b) => a - b);
  const ys = [
    ...new Set(walls.flatMap((wall) => [wall.a.y, wall.b.y])),
  ].toSorted((a, b) => a - b);
  const [minX, maxX] = xs;
  const [minY, maxY] = ys;
  if (
    minX === undefined ||
    maxX === undefined ||
    minY === undefined ||
    maxY === undefined ||
    xs.length !== 2 ||
    ys.length !== 2
  )
    return undefined;
  const face = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  const required = [
    key({ x: minX, y: minY }, { x: maxX, y: minY }),
    key({ x: maxX, y: minY }, { x: maxX, y: maxY }),
    key({ x: maxX, y: maxY }, { x: minX, y: maxY }),
    key({ x: minX, y: maxY }, { x: minX, y: minY }),
  ];
  const authored = new Set(
    walls.flatMap((wall) => [key(wall.a, wall.b), key(wall.b, wall.a)]),
  );
  return required.every((segment) => authored.has(segment)) ? face : undefined;
};

export const faceVertices = (bounds: Bounds): readonly Point[] => [
  { x: bounds.x, y: bounds.y },
  { x: bounds.x + bounds.width, y: bounds.y },
  { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  { x: bounds.x, y: bounds.y + bounds.height },
];
