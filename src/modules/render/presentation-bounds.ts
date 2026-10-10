import { boundsOverlap } from "../plan/geometry.js";
import type { Bounds } from "../plan/model.js";

export type PaperBounds = Bounds;

/** Smallest axis-aligned box covering every input. Empty inputs collapse to origin. */
export const unionBounds = (inputs: readonly Bounds[]): Bounds => {
  const nonEmpty = inputs.filter((box) => box.width >= 0 && box.height >= 0);
  if (nonEmpty.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = nonEmpty.flatMap((box) => [box.x, box.x + box.width]);
  const ys = nonEmpty.flatMap((box) => [box.y, box.y + box.height]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
};

/** Paper coordinates (SVG user space) of the plan's drawable box: X right, Y mirrored. */
export const paperRect = (bounds: Bounds): Bounds => ({
  x: bounds.x,
  y: -(bounds.y + bounds.height),
  width: bounds.width,
  height: bounds.height,
});

/** Grows a paper-space rect by a uniform margin on all sides. */
export const expandBounds = (bounds: Bounds, margin: number): Bounds => ({
  x: bounds.x - margin,
  y: bounds.y - margin,
  width: bounds.width + 2 * margin,
  height: bounds.height + 2 * margin,
});

export { boundsOverlap };
