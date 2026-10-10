import { PlanObject } from "../plan/domain-objects.js";
import { boundsOverlap } from "../plan/geometry.js";
import type { Bounds, Point, Storey } from "../plan/model.js";
import type { DerivedFace } from "../plan/topology.js";
import { pointStrictlyInsideFace } from "../plan/topology.js";

export const labelFontSize = 16;
/** Deliberately generous average glyph advance, so estimated labels never undershoot rendered text. */
export const labelGlyphAdvance = 0.55;
/** Keeps label text off the painted wall band that straddles each face edge. */
export const labelWallClearance = 15;
export const labelObstacleClearance = 5;
const labelSearchStep = 10;

export type LabelPoint = Readonly<{ x: number; y: number }>;

type LabelBlock = Readonly<{ width: number; height: number }>;

export const estimatedTextWidth = (
  text: string,
  fontSize = labelFontSize,
): number => text.length * fontSize * labelGlyphAdvance;

/**
 * Bounds of a centered text block. The anchor is the block's center, so a
 * multiline label reserves the same clearance as its widest line.
 */
export const centeredTextBounds = (
  center: LabelPoint,
  block: LabelBlock,
  margin: number,
): Bounds => ({
  x: center.x - block.width / 2 - margin,
  y: center.y - block.height / 2 - margin,
  width: block.width + 2 * margin,
  height: block.height + 2 * margin,
});

const boundsCorners = ({ x, y, width, height }: Bounds): readonly Point[] => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];

const pointStrictlyInsideBounds = (point: Point, bounds: Bounds): boolean =>
  point.x > bounds.x &&
  point.x < bounds.x + bounds.width &&
  point.y > bounds.y &&
  point.y < bounds.y + bounds.height;

/** An orthogonal face holds a box when all box corners are inside and no face corner pokes into it. */
const faceHoldsBounds = (face: DerivedFace, bounds: Bounds): boolean =>
  boundsCorners(bounds).every((corner) =>
    pointStrictlyInsideFace(face, corner),
  ) &&
  !face.vertices.some((vertex) => pointStrictlyInsideBounds(vertex, bounds));

export const labelObstacles = (storey: Storey): readonly Bounds[] => [
  ...storey.objects.map((object) => new PlanObject(object).bounds),
  ...storey.stairs.map((stair) => stair.bounds),
];

/** Candidate points across the face, nearest to its middle first. */
const labelCandidates = (face: DerivedFace): readonly LabelPoint[] => {
  const { x, y, width, height } = face.bounds;
  const middle = { x: x + width / 2, y: y + height / 2 };
  const columns = Math.floor(width / labelSearchStep);
  const rows = Math.floor(height / labelSearchStep);
  return Array.from({ length: (columns + 1) * (rows + 1) }, (_, index) => ({
    x: x + (index % (columns + 1)) * labelSearchStep,
    y: y + Math.floor(index / (columns + 1)) * labelSearchStep,
  })).toSorted(
    (left, right) =>
      (left.x - middle.x) ** 2 +
        (left.y - middle.y) ** 2 -
        ((right.x - middle.x) ** 2 + (right.y - middle.y) ** 2) ||
      left.y - right.y ||
      left.x - right.x,
  );
};

/**
 * Deterministic placement of a centered text block inside one face: the
 * candidate nearest the face middle whose box fits the face and clears every
 * obstacle; the face middle is the fallback when nothing fits.
 */
export const centeredLabelPoint = (
  face: DerivedFace,
  block: LabelBlock,
  obstacles: readonly Bounds[],
): LabelPoint => {
  const fits = (point: LabelPoint): boolean =>
    faceHoldsBounds(
      face,
      centeredTextBounds(point, block, labelWallClearance),
    ) &&
    !obstacles.some((obstacle) =>
      boundsOverlap(
        centeredTextBounds(point, block, labelObstacleClearance),
        obstacle,
      ),
    );
  const { x, y, width, height } = face.bounds;
  return (
    labelCandidates(face).find(fits) ?? {
      x: x + width / 2,
      y: y + height / 2,
    }
  );
};

/** Single-line wrapper kept for the technical label layout. */
export const roomLabelPoint = (
  face: DerivedFace,
  text: string,
  obstacles: readonly Bounds[],
): LabelPoint => {
  const block = { width: estimatedTextWidth(text), height: labelFontSize };
  return centeredLabelPoint(face, block, obstacles);
};

/** Renders centered lines top-down from a placed block anchor. */
export const renderCenteredLines = (
  anchor: LabelPoint,
  lines: readonly string[],
  fontSize = labelFontSize,
): string => {
  const lineHeight = fontSize * 1.25;
  const first = anchor.y + ((lines.length - 1) * lineHeight) / 2;
  return lines
    .map(
      (text, index) =>
        `<text x="${anchor.x}" y="${first - index * lineHeight}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle">${text}</text>`,
    )
    .join("");
};
