import { StairOccurrence } from "../plan/domain-objects.js";
import type { Stair, Void } from "../plan/model.js";

const svgY = (value: number): number => -value;
const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const center = (
  bounds: Stair["bounds"],
): Readonly<{ x: number; y: number }> => ({
  x: bounds.x + bounds.width / 2,
  y: bounds.y + bounds.height / 2,
});

const stairTreads = (stair: Stair): string => {
  const { x, y, width, height } = stair.bounds;
  const count = 10;
  return Array.from({ length: count - 1 }, (_, index) => {
    const treadY = y + ((index + 1) * height) / count;
    return `<line x1="${x}" y1="${svgY(treadY)}" x2="${x + width}" y2="${svgY(treadY)}" stroke="#777" stroke-width="2"/>`;
  }).join("");
};

const renderStair = (stair: Stair): string => {
  const { x, y, width, height } = stair.bounds;
  const midpoint = center(stair.bounds);
  const arrow = stair.direction === "up" ? "↑" : "↓";
  return `<rect x="${x}" y="${svgY(y + height)}" width="${width}" height="${height}" fill="none" stroke="#444"/>${stairTreads(stair)}<text x="${midpoint.x}" y="${svgY(midpoint.y)}" text-anchor="middle">${arrow} ${stair.run}</text>`;
};

/** A void around a stair keeps its name as a tooltip; printing it would overwrite the stair label. */
const renderVoid = (voidItem: Void, stairs: readonly Stair[]): string => {
  const { x, y, width, height } = voidItem.bounds;
  const midpoint = center(voidItem.bounds);
  const name = escapeXml(voidItem.name);
  const holdsStair = stairs.some((stair) =>
    new StairOccurrence(stair).isContainedBy(voidItem.bounds),
  );
  const label = holdsStair
    ? ""
    : `<text x="${midpoint.x}" y="${svgY(midpoint.y)}" text-anchor="middle">${name}</text>`;
  return `<g class="void"><title>${name}</title><rect x="${x}" y="${svgY(y + height)}" width="${width}" height="${height}" fill="url(#void-hatch)" stroke="#555" stroke-dasharray="16 8"/>${label}</g>`;
};

export const renderStairsLayer = (stairs: readonly Stair[]): string =>
  stairs.map(renderStair).join("");
export const renderVoidsLayer = (
  voids: readonly Void[],
  stairs: readonly Stair[],
): string => voids.map((voidItem) => renderVoid(voidItem, stairs)).join("");
export const voidHatchDefinition =
  '<pattern id="void-hatch" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12L12 0" stroke="#999" stroke-width="1"/></pattern>';
