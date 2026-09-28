import { WallSegment } from "../plan/domain-objects.js";
import type { Dimension, HousePlan, Opening, Storey } from "../plan/model.js";
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

const renderDoorSwing = (opening: Opening, wall: WallSegment): string => {
  if (opening.type !== "door") return "";
  const { start, end } = wall.openingEndpoints(opening);
  return `<path class="door-swing" d="M${start.x} ${svgY(start.y)} A${opening.width} ${opening.width} 0 0 1 ${end.x} ${svgY(end.y)}" fill="none" stroke="#246"/>`;
};

const renderOpening = (opening: Opening, storey: Storey): string => {
  const host = storey.walls.find((wall) => wall.name === opening.wall);
  if (!host) return "";
  const wall = new WallSegment(host);
  const { start, end } = wall.openingEndpoints(opening);
  return `<line x1="${start.x}" y1="${svgY(start.y)}" x2="${end.x}" y2="${svgY(end.y)}" stroke="white" stroke-width="${host.thickness + 4}"/>${renderDoorSwing(opening, wall)}`;
};

const dimensionLength = (dimension: Dimension): number =>
  Math.hypot(dimension.b.x - dimension.a.x, dimension.b.y - dimension.a.y);
const renderDimension = (dimension: Dimension): string =>
  `<g><line x1="${dimension.a.x}" y1="${svgY(dimension.a.y + dimension.offset)}" x2="${dimension.b.x}" y2="${svgY(dimension.b.y + dimension.offset)}" stroke="#666"/><text x="${(dimension.a.x + dimension.b.x) / 2}" y="${svgY((dimension.a.y + dimension.b.y) / 2 + dimension.offset)}">${dimensionLength(dimension)} cm</text></g>`;

export const renderSvg = (plan: HousePlan, storey: Storey): string => {
  const resolved = resolvePlan(plan).storeys.find(
    (candidate) => candidate.id === storey.id,
  );
  if (!resolved) throw new Error(`Cannot render unknown storey '${storey.id}'`);
  const { x, y, width, height } = resolved.bounds;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x - 100} ${svgY(y + height + 100)} ${width + 200} ${height + 200}"><defs>${voidHatchDefinition}</defs><g id="walls">${storey.walls.map(renderWall).join("")}</g><g id="openings">${storey.openings.map((opening) => renderOpening(opening, storey)).join("")}</g><g id="rooms">${resolved.rooms.map((room) => `<text x="${room.bounds.x + room.bounds.width / 2}" y="${svgY(room.bounds.y + room.bounds.height / 2)}" text-anchor="middle">${escapeXml(room.name)} ${(room.areaCm2 / 10000).toFixed(1)}m²</text>`).join("")}</g><g id="objects">${renderObjectsLayer(storey.objects)}</g><g id="stairs">${renderStairsLayer(storey.stairs)}</g><g id="voids">${renderVoidsLayer(storey.voids)}</g><g id="dimensions">${storey.dimensions.map(renderDimension).join("")}</g><g id="annotations">${storey.annotations.map((annotation) => `<text x="${annotation.at.x}" y="${svgY(annotation.at.y)}">${escapeXml(annotation.text)}</text>`).join("")}</g></svg>`;
};
