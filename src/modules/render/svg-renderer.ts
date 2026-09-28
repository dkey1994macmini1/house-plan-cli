import { WallSegment } from "../plan/domain-objects.js";
import type {
  Bounds,
  Dimension,
  HousePlan,
  Opening,
  Storey,
} from "../plan/model.js";
import { resolvePlan } from "../plan/resolution.js";
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

const renderDoor = (opening: Opening, wall: WallSegment): string => {
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

const overlapsBounds = (
  point: { x: number; y: number },
  bounds: Bounds,
): boolean =>
  point.x >= bounds.x - 15 &&
  point.x <= bounds.x + bounds.width + 15 &&
  point.y >= bounds.y - 15 &&
  point.y <= bounds.y + bounds.height + 15;

const roomLabelPoint = (
  bounds: Bounds,
  storey: Storey,
): { x: number; y: number } => {
  const candidates = [
    { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    { x: bounds.x + 35, y: bounds.y + 35 },
    { x: bounds.x + 35, y: bounds.y + bounds.height - 35 },
    { x: bounds.x + bounds.width - 35, y: bounds.y + 35 },
    { x: bounds.x + bounds.width - 35, y: bounds.y + bounds.height - 35 },
  ];
  const occupied = [
    ...storey.objects.map((object) => ({
      x: object.center.x - object.width / 2,
      y: object.center.y - object.depth / 2,
      width: object.width,
      height: object.depth,
    })),
    ...storey.stairs.map((stair) => stair.bounds),
  ];
  const fallback = candidates[0];
  if (!fallback) throw new Error("Room label requires at least one candidate");
  return (
    candidates.find(
      (point) => !occupied.some((bounds) => overlapsBounds(point, bounds)),
    ) ?? fallback
  );
};

const renderRoomLabel = (
  room: { name: string; areaCm2: number; bounds: Bounds },
  storey: Storey,
): string => {
  const point = roomLabelPoint(room.bounds, storey);
  const label = `${room.name} ${(room.areaCm2 / 10000).toFixed(1)}m²`;
  return `<text class="room-label" x="${point.x}" y="${svgY(point.y)}" text-anchor="middle" fill="#111" stroke="white" stroke-width="5" paint-order="stroke">${escapeXml(label)}</text>`;
};

export const renderSvg = (plan: HousePlan, storey: Storey): string => {
  const resolved = resolvePlan(plan).storeys.find(
    (candidate) => candidate.id === storey.id,
  );
  if (!resolved) throw new Error(`Cannot render unknown storey '${storey.id}'`);
  const { x, y, width, height } = resolved.bounds;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x - 100} ${svgY(y + height + 100)} ${width + 200} ${height + 200}"><defs>${voidHatchDefinition}</defs><g id="walls">${storey.walls.map(renderWall).join("")}</g><g id="openings">${storey.openings.map((opening) => renderOpening(opening, storey)).join("")}</g><g id="rooms"></g><g id="objects">${renderObjectsLayer(storey.objects)}</g><g id="room-labels">${resolved.rooms.map((room) => renderRoomLabel(room, storey)).join("")}</g><g id="stairs">${renderStairsLayer(storey.stairs)}</g><g id="voids">${renderVoidsLayer(storey.voids)}</g><g id="dimensions">${storey.dimensions.map(renderDimension).join("")}</g><g id="annotations">${storey.annotations.map((annotation) => `<text x="${annotation.at.x}" y="${svgY(annotation.at.y)}">${escapeXml(annotation.text)}</text>`).join("")}</g></svg>`;
};
