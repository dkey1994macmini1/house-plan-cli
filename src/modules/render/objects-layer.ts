import type { ObjectBox } from "../plan/model.js";

const svgY = (value: number): number => -value;
const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const rotationTransform = (object: ObjectBox): string =>
  `rotate(${-object.rotation} ${object.center.x} ${svgY(object.center.y)})`;

const objectFrame = (object: ObjectBox): string =>
  `<rect x="${object.center.x - object.width / 2}" y="${svgY(object.center.y + object.depth / 2)}" width="${object.width}" height="${object.depth}" fill="none" stroke="#555"/>`;

const objectCross = (object: ObjectBox): string => {
  const left = object.center.x - object.width / 2;
  const right = object.center.x + object.width / 2;
  const bottom = svgY(object.center.y - object.depth / 2);
  const top = svgY(object.center.y + object.depth / 2);
  return `<path d="M${left} ${bottom} L${right} ${top} M${left} ${top} L${right} ${bottom}" stroke="#555"/>`;
};

const clearanceFrame = (object: ObjectBox): string => {
  if (!object.clearance) return "";
  const { front, back, left, right } = object.clearance;
  return `<rect class="clearance" x="${object.center.x - object.width / 2 - left}" y="${svgY(object.center.y + object.depth / 2 + front)}" width="${object.width + left + right}" height="${object.depth + front + back}" fill="none" stroke="#888" stroke-dasharray="12 8"/>`;
};

export const renderObjectsLayer = (objects: readonly ObjectBox[]): string =>
  objects
    .map(
      (object) =>
        `<g transform="${rotationTransform(object)}">${clearanceFrame(object)}${objectFrame(object)}${objectCross(object)}<text x="${object.center.x}" y="${svgY(object.center.y)}" text-anchor="middle">${escapeXml(object.label)}</text></g>`,
    )
    .join("");
