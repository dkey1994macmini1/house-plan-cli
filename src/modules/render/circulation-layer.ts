import type { Stair, Void } from "../plan/model.js";

const svgY = (value: number): number => -value;
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

const renderVoid = (voidItem: Void): string => {
  const { x, y, width, height } = voidItem.bounds;
  const midpoint = center(voidItem.bounds);
  return `<rect x="${x}" y="${svgY(y + height)}" width="${width}" height="${height}" fill="url(#void-hatch)" stroke="#555" stroke-dasharray="16 8"/><text x="${midpoint.x}" y="${svgY(midpoint.y)}" text-anchor="middle">${voidItem.name}</text>`;
};

export const renderStairsLayer = (stairs: readonly Stair[]): string =>
  stairs.map(renderStair).join("");
export const renderVoidsLayer = (voids: readonly Void[]): string =>
  voids.map(renderVoid).join("");
export const voidHatchDefinition =
  '<pattern id="void-hatch" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12L12 0" stroke="#999" stroke-width="1"/></pattern>';
