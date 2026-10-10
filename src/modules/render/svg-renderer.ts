import type { HousePlan, ResolvedRoom, Storey } from "../plan/model.js";
import { resolvePlan } from "../plan/resolution.js";
import { validate } from "../plan/validation.js";
import {
  renderStairsLayer,
  renderVoidsLayer,
  voidHatchDefinition,
} from "./circulation-layer.js";
import {
  labelFontSize,
  labelObstacles,
  roomLabelPoint,
} from "./label-placement.js";
import { renderObjectsLayer } from "./objects-layer.js";
import {
  escapeXml,
  renderDimension,
  renderOpening,
  renderWall,
  svgY,
} from "./plan-graphics.js";
import { renderPresentationSvg } from "./presentation-renderer.js";
import type { RenderStyle } from "./render-options.js";

const renderRoomLabel = (room: ResolvedRoom, storey: Storey): string => {
  const label = `${room.name} ${(room.areaCm2 / 10000).toFixed(1)}m²`;
  const point = roomLabelPoint(
    { bounds: room.bounds, vertices: room.face },
    label,
    labelObstacles(storey),
  );
  return `<text class="room-label" x="${point.x}" y="${svgY(point.y)}" font-size="${labelFontSize}" text-anchor="middle" dominant-baseline="middle" fill="#111" stroke="white" stroke-width="5" paint-order="stroke">${escapeXml(label)}</text>`;
};

const renderValidSvg = (
  plan: HousePlan,
  storey: Storey,
  style: RenderStyle = "technical",
): string => {
  if (style === "presentation") return renderPresentationSvg(plan, storey);
  const resolved = resolvePlan(plan).storeys.find(
    (candidate) => candidate.id === storey.id,
  );
  if (!resolved) throw new Error(`Cannot render unknown storey '${storey.id}'`);
  const { x, y, width, height } = resolved.bounds;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x - 100} ${svgY(y + height + 100)} ${width + 200} ${height + 200}"><defs>${voidHatchDefinition}</defs><g id="walls">${storey.walls.map((wall) => renderWall(wall)).join("")}</g><g id="openings">${storey.openings.map((opening) => renderOpening(opening, storey)).join("")}</g><g id="rooms"></g><g id="objects">${renderObjectsLayer(storey.objects)}</g><g id="room-labels">${resolved.rooms.map((room) => renderRoomLabel(room, storey)).join("")}</g><g id="stairs">${renderStairsLayer(storey.stairs)}</g><g id="voids">${renderVoidsLayer(storey.voids, storey.stairs)}</g><g id="dimensions">${storey.dimensions.map(renderDimension).join("")}</g><g id="annotations">${storey.annotations.map((annotation) => `<text x="${annotation.at.x}" y="${svgY(annotation.at.y)}">${escapeXml(annotation.text)}</text>`).join("")}</g></svg>`;
};

/** Invalid drafts retain their geometry but cannot be mistaken for a validated export. */
export const renderSvg = (
  plan: HousePlan,
  storey: Storey,
  style: RenderStyle = "technical",
): string => {
  const svg = renderValidSvg(plan, storey, style);
  if (!validate(plan).some((diagnostic) => diagnostic.severity === "error"))
    return svg;
  const viewport = svg.match(
    /viewBox="(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+([\d.eE+]+)\s+([\d.eE+]+)"/,
  );
  if (!viewport) return svg;
  const x = Number(viewport[1]);
  const y = Number(viewport[2]);
  const width = Number(viewport[3]);
  const size = Math.min(18, (width - 20) / 14);
  const badge = `<g class="invalid-draft"><rect x="${x + 5}" y="${y + 4}" width="${width - 10}" height="${size + 10}" fill="#fff0e8"/><text x="${x + width / 2}" y="${y + size + 5}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${size}" font-weight="bold" fill="#a33e26">NIEPOPRAWNY SZKIC</text></g>`;
  return svg.replace("</svg>", `${badge}</svg>`);
};
