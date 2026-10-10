import { WallSegment } from "../plan/domain-objects.js";
import type {
  Bounds,
  Dimension,
  Opening,
  Point,
  Storey,
} from "../plan/model.js";

/** SVG user units: X right, Y mirrored down from the plan's up-positive Y. */
export const svgY = (value: number): number => -value;

export const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const technicalGraphicsPalette: GraphicsPalette = {
  openingCut: "white",
  door: "#246",
  window: "#168",
};

/**
 * Colors of one drawing style. Geometry stays identical; a style only picks
 * stroke colors, so technical and presentation renderers share every formula.
 */
export type GraphicsPalette = Readonly<{
  openingCut: string;
  door: string;
  window: string;
}>;

export const renderWall = (
  wall: Storey["walls"][number],
  color = "black",
): string =>
  `<line x1="${wall.a.x}" y1="${svgY(wall.a.y)}" x2="${wall.b.x}" y2="${svgY(wall.b.y)}" stroke="${color}" stroke-width="${wall.thickness}"/>`;

/** Two panels offset to either side of the wall axis, overlapping in the middle like a slider track. */
const renderSlidingDoor = (
  opening: Opening,
  wall: WallSegment,
  color: string,
): string => {
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
    return `<line x1="${a.x}" y1="${svgY(a.y)}" x2="${b.x}" y2="${svgY(b.y)}" stroke="${color}" stroke-width="4"/>`;
  };
  return `<g class="door-sliding">${panel(start, along(start, end), 1)}${panel(along(end, start), end, -1)}</g>`;
};

export const renderDoor = (
  opening: Opening,
  wall: WallSegment,
  color = technicalGraphicsPalette.door,
): string => {
  if (opening.variant === "sliding")
    return renderSlidingDoor(opening, wall, color);
  const geometry = wall.doorGeometry(opening);
  if (!geometry) return "";
  const { hinge, closedLeaf, openLeaf } = geometry;
  const sweep = opening.hinge === "left" ? 1 : 0;
  return `<line class="door-leaf" x1="${hinge.x}" y1="${svgY(hinge.y)}" x2="${openLeaf.x}" y2="${svgY(openLeaf.y)}" stroke="${color}" stroke-width="4"/><circle class="door-hinge" cx="${hinge.x}" cy="${svgY(hinge.y)}" r="5" fill="${color}"/><path class="door-swing" d="M${closedLeaf.x} ${svgY(closedLeaf.y)} A${opening.width} ${opening.width} 0 0 ${sweep} ${openLeaf.x} ${svgY(openLeaf.y)}" fill="none" stroke="${color}" stroke-dasharray="8 5"/>`;
};

export const renderWindow = (
  opening: Opening,
  wall: WallSegment,
  color = technicalGraphicsPalette.window,
): string => {
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
  return `<g class="window"><line x1="${first.start.x}" y1="${svgY(first.start.y)}" x2="${first.end.x}" y2="${svgY(first.end.y)}" stroke="${color}" stroke-width="4"/><line x1="${second.start.x}" y1="${svgY(second.start.y)}" x2="${second.end.x}" y2="${svgY(second.end.y)}" stroke="${color}" stroke-width="4"/></g>`;
};

const openingHost = (opening: Opening, storey: Storey) =>
  storey.walls.find((wall) => wall.name === opening.wall);

const openingCutout = (
  start: Point,
  end: Point,
  thickness: number,
  palette: GraphicsPalette,
): string =>
  `<line x1="${start.x}" y1="${svgY(start.y)}" x2="${end.x}" y2="${svgY(end.y)}" stroke="${palette.openingCut}" stroke-width="${thickness + 4}"/>`;

export const renderOpening = (
  opening: Opening,
  storey: Storey,
  palette = technicalGraphicsPalette,
): string => {
  const host = openingHost(opening, storey);
  if (!host) return "";
  const wall = new WallSegment(host);
  const { start, end } = wall.openingEndpoints(opening);
  const cutout = openingCutout(start, end, host.thickness, palette);
  return `${cutout}${opening.type === "door" ? renderDoor(opening, wall, palette.door) : renderWindow(opening, wall, palette.window)}`;
};

const dimensionLength = (dimension: Dimension): number =>
  Math.hypot(dimension.b.x - dimension.a.x, dimension.b.y - dimension.a.y);
export const renderDimension = (dimension: Dimension): string =>
  `<g><line x1="${dimension.a.x}" y1="${svgY(dimension.a.y + dimension.offset)}" x2="${dimension.b.x}" y2="${svgY(dimension.b.y + dimension.offset)}" stroke="#666"/><text x="${(dimension.a.x + dimension.b.x) / 2}" y="${svgY((dimension.a.y + dimension.b.y) / 2 + dimension.offset)}">${dimensionLength(dimension)} cm</text></g>`;

/** Paper-space bounds of a drawn dimension line, used to keep it in the viewport. */
export const dimensionPaperBounds = (dimension: Dimension): Bounds => {
  const x1 = Math.min(dimension.a.x, dimension.b.x);
  const x2 = Math.max(dimension.a.x, dimension.b.x);
  const y1 = Math.min(dimension.a.y, dimension.b.y) + dimension.offset;
  const y2 = Math.max(dimension.a.y, dimension.b.y) + dimension.offset;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
};
