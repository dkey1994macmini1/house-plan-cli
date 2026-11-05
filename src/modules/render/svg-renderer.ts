import { SiteFeature } from "../plan/domain-objects.js";
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
  renderSiteElementsLayer,
  renderWall,
  svgY,
  terraceGridDefinition,
} from "./plan-graphics.js";
import { unionBounds } from "./presentation-bounds.js";
import { renderPresentationSvg } from "./presentation-renderer.js";
import type { AreaMode, RenderStyle } from "./render-options.js";

const renderRoomLabel = (
  room: ResolvedRoom,
  storey: Storey,
  areaMode: AreaMode = "axis",
): string => {
  const area = areaMode === "net" ? room.netAreaCm2 : room.areaCm2;
  const decimals = areaMode === "net" ? 2 : 1;
  const label = `${room.name} ${(area / 10000).toFixed(decimals)}m²`;
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
  areaMode: AreaMode = "axis",
): string => {
  if (style === "presentation")
    return renderPresentationSvg(plan, storey, areaMode);
  const resolved = resolvePlan(plan).storeys.find(
    (candidate) => candidate.id === storey.id,
  );
  if (!resolved) throw new Error(`Cannot render unknown storey '${storey.id}'`);
  const siteBounds = (storey.sites ?? []).flatMap((site) => {
    const b = new SiteFeature(site).bounds;
    return b ? [b] : [];
  });
  const { x, y, width, height } =
    siteBounds.length > 0
      ? unionBounds([resolved.bounds, ...siteBounds])
      : resolved.bounds;
  const siteSvg = renderSiteElementsLayer(storey.sites);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x - 100} ${svgY(y + height + 100)} ${width + 200} ${height + 200}"><defs>${voidHatchDefinition}${siteSvg ? terraceGridDefinition : ""}</defs>${siteSvg ? `<g id="sites">${siteSvg}</g>` : ""}<g id="walls">${storey.walls.map((wall) => renderWall(wall)).join("")}</g><g id="openings">${storey.openings.map((opening) => renderOpening(opening, storey)).join("")}</g><g id="rooms"></g><g id="objects">${renderObjectsLayer(storey.objects)}</g><g id="room-labels">${resolved.rooms.map((room) => renderRoomLabel(room, storey, areaMode)).join("")}</g><g id="stairs">${renderStairsLayer(storey.stairs)}</g><g id="voids">${renderVoidsLayer(storey.voids, storey.stairs)}</g><g id="dimensions">${storey.dimensions.map(renderDimension).join("")}</g><g id="annotations">${storey.annotations.map((annotation) => `<text x="${annotation.at.x}" y="${svgY(annotation.at.y)}">${escapeXml(annotation.text)}</text>`).join("")}</g></svg>`;
};

/** Invalid drafts retain their geometry but cannot be mistaken for a validated export. */
export const renderSvg = (
  plan: HousePlan,
  storey: Storey,
  style: RenderStyle = "technical",
  areaMode: AreaMode = "axis",
): string => {
  const svg = renderValidSvg(plan, storey, style, areaMode);
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

/**
 * Converts a rendered SVG into a self-contained inline visualization fragment
 * with a non-negative `0 0 width height` viewBox and scoped pattern IDs.
 */
export const renderVisualizeFragment = (svg: string, slug = "plan"): string => {
  const safeSlug =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "plan";
  const match = svg.match(
    /^<svg[^>]*viewBox="(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+([\d.eE+]+)\s+([\d.eE+]+)"[^>]*>([\s\S]*)<\/svg>$/,
  );
  if (!match) return svg;
  const x0 = Number(match[1]);
  const y0 = Number(match[2]);
  const width = Math.ceil(Number(match[3]));
  const height = Math.ceil(Number(match[4]));
  const inner = (match[5] ?? "")
    .replaceAll('id="void-hatch"', `id="${safeSlug}-void-hatch"`)
    .replaceAll("url(#void-hatch)", `url(#${safeSlug}-void-hatch)`)
    .replaceAll('id="terrace-grid"', `id="${safeSlug}-terrace-grid"`)
    .replaceAll("url(#terrace-grid)", `url(#${safeSlug}-terrace-grid)`);
  const defsMatch = inner.match(/^<defs>([\s\S]*?)<\/defs>([\s\S]*)$/);
  const defs = defsMatch ? `<defs>${defsMatch[1]}</defs>` : "";
  const body = defsMatch ? (defsMatch[2] ?? "") : inner;
  const dx = Math.round(-x0 * 10) / 10;
  const dy = Math.round(-y0 * 10) / 10;
  return `<svg id="${safeSlug}" width="100%" viewBox="0 0 ${width} ${height}" role="img" xmlns="http://www.w3.org/2000/svg"><title>Rzut poziomu</title><desc>Rzut wygenerowany przez house-plan-cli</desc>${defs}<g transform="translate(${dx}, ${dy})" font-family="DejaVu Sans, sans-serif">${body}</g></svg>\n`;
};
