import { PlanObject, WallSegment } from "../plan/domain-objects.js";
import { boundsOverlap } from "../plan/geometry.js";
import type {
  Bounds,
  Dimension,
  HousePlan,
  Opening,
  Point,
  ResolvedRoom,
  Storey,
} from "../plan/model.js";
import { resolvePlan } from "../plan/resolution.js";
import { type DerivedFace, pointStrictlyInsideFace } from "../plan/topology.js";
import {
  renderStairsLayer,
  renderVoidsLayer,
  voidHatchDefinition,
} from "./circulation-layer.js";
import { renderObjectsLayer } from "./objects-layer.js";

const svgY = (value: number): number => -value;
const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const renderWall = (wall: Storey["walls"][number]): string =>
  `<line x1="${wall.a.x}" y1="${svgY(wall.a.y)}" x2="${wall.b.x}" y2="${svgY(wall.b.y)}" stroke="black" stroke-width="${wall.thickness}"/>`;

/** Two panels offset to either side of the wall axis, overlapping in the middle like a slider track. */
const renderSlidingDoor = (opening: Opening, wall: WallSegment): string => {
  const { start, end } = wall.openingEndpoints(opening);
  const horizontal = wall.value.a.y === wall.value.b.y;
  const offset = wall.value.thickness / 4;
  const panelShare = 0.55;
  const along = (from: Point, towards: Point): Point => ({
    x: from.x + (towards.x - from.x) * panelShare,
    y: from.y + (towards.y - from.y) * panelShare,
  });
  const shifted = (point: Point, side: 1 | -1): Point =>
    horizontal
      ? { x: point.x, y: point.y + side * offset }
      : { x: point.x + side * offset, y: point.y };
  const panel = (from: Point, to: Point, side: 1 | -1): string => {
    const a = shifted(from, side);
    const b = shifted(to, side);
    return `<line x1="${a.x}" y1="${svgY(a.y)}" x2="${b.x}" y2="${svgY(b.y)}" stroke="#246" stroke-width="4"/>`;
  };
  return `<g class="door-sliding">${panel(start, along(start, end), 1)}${panel(along(end, start), end, -1)}</g>`;
};

const renderDoor = (opening: Opening, wall: WallSegment): string => {
  if (opening.variant === "sliding") return renderSlidingDoor(opening, wall);
  const geometry = wall.doorGeometry(opening);
  if (!geometry) return "";
  const { hinge, closedLeaf, openLeaf } = geometry;
  const sweep = opening.hinge === "left" ? 1 : 0;
  return `<line class="door-leaf" x1="${hinge.x}" y1="${svgY(hinge.y)}" x2="${openLeaf.x}" y2="${svgY(openLeaf.y)}" stroke="#246" stroke-width="4"/><circle class="door-hinge" cx="${hinge.x}" cy="${svgY(hinge.y)}" r="5" fill="#246"/><path class="door-swing" d="M${closedLeaf.x} ${svgY(closedLeaf.y)} A${opening.width} ${opening.width} 0 0 ${sweep} ${openLeaf.x} ${svgY(openLeaf.y)}" fill="none" stroke="#246" stroke-dasharray="8 5"/>`;
};

const renderWindow = (opening: Opening, wall: WallSegment): string => {
  const { start, end } = wall.openingEndpoints(opening);
  const horizontal = wall.value.a.y === wall.value.b.y;
  const offset = wall.value.thickness / 4;
  const first = horizontal
    ? {
        start: { x: start.x, y: start.y - offset },
        end: { x: end.x, y: end.y - offset },
      }
    : {
        start: { x: start.x - offset, y: start.y },
        end: { x: end.x - offset, y: end.y },
      };
  const second = horizontal
    ? {
        start: { x: start.x, y: start.y + offset },
        end: { x: end.x, y: end.y + offset },
      }
    : {
        start: { x: start.x + offset, y: start.y },
        end: { x: end.x + offset, y: end.y },
      };
  return `<g class="window"><line x1="${first.start.x}" y1="${svgY(first.start.y)}" x2="${first.end.x}" y2="${svgY(first.end.y)}" stroke="#168" stroke-width="4"/><line x1="${second.start.x}" y1="${svgY(second.start.y)}" x2="${second.end.x}" y2="${svgY(second.end.y)}" stroke="#168" stroke-width="4"/></g>`;
};

const renderOpening = (opening: Opening, storey: Storey): string => {
  const host = storey.walls.find((wall) => wall.name === opening.wall);
  if (!host) return "";
  const wall = new WallSegment(host);
  const { start, end } = wall.openingEndpoints(opening);
  const cutout = `<line x1="${start.x}" y1="${svgY(start.y)}" x2="${end.x}" y2="${svgY(end.y)}" stroke="white" stroke-width="${host.thickness + 4}"/>`;
  return `${cutout}${opening.type === "door" ? renderDoor(opening, wall) : renderWindow(opening, wall)}`;
};

const dimensionLength = (dimension: Dimension): number =>
  Math.hypot(dimension.b.x - dimension.a.x, dimension.b.y - dimension.a.y);
const renderDimension = (dimension: Dimension): string =>
  `<g><line x1="${dimension.a.x}" y1="${svgY(dimension.a.y + dimension.offset)}" x2="${dimension.b.x}" y2="${svgY(dimension.b.y + dimension.offset)}" stroke="#666"/><text x="${(dimension.a.x + dimension.b.x) / 2}" y="${svgY((dimension.a.y + dimension.b.y) / 2 + dimension.offset)}">${dimensionLength(dimension)} cm</text></g>`;

const labelFontSize = 16;
/** Deliberately generous average glyph advance, so estimated labels never undershoot rendered text. */
const labelGlyphAdvance = 0.55;
/** Keeps label text off the painted wall band that straddles each face edge. */
const labelWallClearance = 15;
const labelObstacleClearance = 5;
const labelSearchStep = 10;

type LabelPoint = Readonly<{ x: number; y: number }>;

const labelBounds = (
  point: LabelPoint,
  text: string,
  margin: number,
): Bounds => {
  const halfWidth = (text.length * labelFontSize * labelGlyphAdvance) / 2;
  const halfHeight = labelFontSize / 2;
  return {
    x: point.x - halfWidth - margin,
    y: point.y - halfHeight - margin,
    width: 2 * (halfWidth + margin),
    height: 2 * (halfHeight + margin),
  };
};

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

const labelObstacles = (storey: Storey): readonly Bounds[] => [
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

const roomLabelPoint = (
  face: DerivedFace,
  text: string,
  storey: Storey,
): LabelPoint => {
  const obstacles = labelObstacles(storey);
  const labelFits = (point: LabelPoint): boolean =>
    faceHoldsBounds(face, labelBounds(point, text, labelWallClearance)) &&
    !obstacles.some((obstacle) =>
      boundsOverlap(labelBounds(point, text, labelObstacleClearance), obstacle),
    );
  const { x, y, width, height } = face.bounds;
  return (
    labelCandidates(face).find(labelFits) ?? {
      x: x + width / 2,
      y: y + height / 2,
    }
  );
};

const renderRoomLabel = (room: ResolvedRoom, storey: Storey): string => {
  const label = `${room.name} ${(room.areaCm2 / 10000).toFixed(1)}m²`;
  const point = roomLabelPoint(
    { bounds: room.bounds, vertices: room.face },
    label,
    storey,
  );
  return `<text class="room-label" x="${point.x}" y="${svgY(point.y)}" font-size="${labelFontSize}" text-anchor="middle" dominant-baseline="middle" fill="#111" stroke="white" stroke-width="5" paint-order="stroke">${escapeXml(label)}</text>`;
};

export const renderSvg = (plan: HousePlan, storey: Storey): string => {
  const resolved = resolvePlan(plan).storeys.find(
    (candidate) => candidate.id === storey.id,
  );
  if (!resolved) throw new Error(`Cannot render unknown storey '${storey.id}'`);
  const { x, y, width, height } = resolved.bounds;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x - 100} ${svgY(y + height + 100)} ${width + 200} ${height + 200}"><defs>${voidHatchDefinition}</defs><g id="walls">${storey.walls.map(renderWall).join("")}</g><g id="openings">${storey.openings.map((opening) => renderOpening(opening, storey)).join("")}</g><g id="rooms"></g><g id="objects">${renderObjectsLayer(storey.objects)}</g><g id="room-labels">${resolved.rooms.map((room) => renderRoomLabel(room, storey)).join("")}</g><g id="stairs">${renderStairsLayer(storey.stairs)}</g><g id="voids">${renderVoidsLayer(storey.voids, storey.stairs)}</g><g id="dimensions">${storey.dimensions.map(renderDimension).join("")}</g><g id="annotations">${storey.annotations.map((annotation) => `<text x="${annotation.at.x}" y="${svgY(annotation.at.y)}">${escapeXml(annotation.text)}</text>`).join("")}</g></svg>`;
};
