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

export const renderObjectSymbol = (
  object: ObjectBox,
  stroke = "#555",
  fill = "#ffffff",
): string | undefined => {
  if (!object.kind) return undefined;
  const w = object.width;
  const h = object.depth;
  const x0 = object.center.x - w / 2;
  const y0 = svgY(object.center.y + h / 2);
  const cx = object.center.x;
  const cy = svgY(object.center.y);

  switch (object.kind) {
    case "car": {
      const rx = Math.min(w, h) * 0.16;
      const bodyW = w * 0.88;
      const bodyH = h * 0.94;
      const bx = cx - bodyW / 2;
      const by = cy - bodyH / 2;
      const roofW = bodyW * 0.76;
      const roofH = bodyH * 0.44;
      const rx0 = cx - roofW / 2;
      const ry0 = cy - roofH * 0.38;
      return `<g class="symbol-car"><rect x="${bx}" y="${by}" width="${bodyW}" height="${bodyH}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2.2"/><rect x="${rx0}" y="${ry0}" width="${roofW}" height="${roofH}" rx="${rx * 0.5}" fill="none" stroke="${stroke}" stroke-width="1.6"/><path d="M${bx + bodyW * 0.08} ${by + bodyH * 0.22} L${rx0} ${ry0} L${rx0 + roofW} ${ry0} L${bx + bodyW * 0.92} ${by + bodyH * 0.22} Z" fill="none" stroke="${stroke}" stroke-width="1.5"/><path d="M${bx + bodyW * 0.1} ${by + bodyH * 0.84} L${rx0} ${ry0 + roofH} L${rx0 + roofW} ${ry0 + roofH} L${bx + bodyW * 0.9} ${by + bodyH * 0.84} Z" fill="none" stroke="${stroke}" stroke-width="1.5"/><line x1="${bx}" y1="${by + bodyH * 0.25}" x2="${bx - w * 0.05}" y2="${by + bodyH * 0.22}" stroke="${stroke}" stroke-width="2"/><line x1="${bx + bodyW}" y1="${by + bodyH * 0.25}" x2="${bx + bodyW + w * 0.05}" y2="${by + bodyH * 0.22}" stroke="${stroke}" stroke-width="2"/></g>`;
    }
    case "bed_double": {
      const pw = w * 0.36;
      const ph = h * 0.16;
      const py = y0 + h * 0.06;
      const blanketY = y0 + h * 0.28;
      return `<g class="symbol-bed-double"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><rect x="${x0 + w * 0.08}" y="${py}" width="${pw}" height="${ph}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/><rect x="${x0 + w * 0.56}" y="${py}" width="${pw}" height="${ph}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/><line x1="${x0}" y1="${blanketY}" x2="${x0 + w}" y2="${blanketY}" stroke="${stroke}" stroke-width="1.6"/></g>`;
    }
    case "bed_single": {
      const pw = w * 0.68;
      const ph = h * 0.16;
      const py = y0 + h * 0.06;
      const blanketY = y0 + h * 0.28;
      return `<g class="symbol-bed-single"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><rect x="${cx - pw / 2}" y="${py}" width="${pw}" height="${ph}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/><line x1="${x0}" y1="${blanketY}" x2="${x0 + w}" y2="${blanketY}" stroke="${stroke}" stroke-width="1.6"/></g>`;
    }
    case "sofa_corner": {
      const armD = Math.min(w, h) * 0.34;
      const backT = Math.min(w, h) * 0.1;
      return `<g class="symbol-sofa-corner"><polygon points="${x0},${y0} ${x0 + w},${y0} ${x0 + w},${y0 + armD} ${x0 + armD},${y0 + armD} ${x0 + armD},${y0 + h} ${x0},${y0 + h}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><line x1="${x0 + backT}" y1="${y0 + backT}" x2="${x0 + w}" y2="${y0 + backT}" stroke="${stroke}" stroke-width="1.4"/><line x1="${x0 + backT}" y1="${y0 + backT}" x2="${x0 + backT}" y2="${y0 + h}" stroke="${stroke}" stroke-width="1.4"/><line x1="${x0 + armD}" y1="${y0}" x2="${x0 + armD}" y2="${y0 + armD}" stroke="${stroke}" stroke-width="1.3"/><line x1="${x0}" y1="${y0 + armD}" x2="${x0 + armD}" y2="${y0 + armD}" stroke="${stroke}" stroke-width="1.3"/><line x1="${x0}" y1="${y0 + armD + (h - armD) / 2}" x2="${x0 + armD}" y2="${y0 + armD + (h - armD) / 2}" stroke="${stroke}" stroke-width="1.3"/></g>`;
    }
    case "dining_set": {
      const tw = w * 0.56;
      const th = h * 0.76;
      const tx = cx - tw / 2;
      const ty = cy - th / 2;
      const cw = w * 0.14;
      const ch = th * 0.2;
      const rows = [0.14, 0.4, 0.66];
      const sideChairs = rows
        .map((r) => {
          const cyPos = ty + th * r;
          return `<rect x="${tx - cw - 4}" y="${cyPos}" width="${cw}" height="${ch}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><rect x="${tx + tw + 4}" y="${cyPos}" width="${cw}" height="${ch}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
        })
        .join("");
      const endW = tw * 0.42;
      const endH = h * 0.09;
      const endChairs = `<rect x="${cx - endW / 2}" y="${ty - endH - 4}" width="${endW}" height="${endH}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><rect x="${cx - endW / 2}" y="${ty + th + 4}" width="${endW}" height="${endH}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
      return `<g class="symbol-dining-set">${sideChairs}${endChairs}<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="${fill}" stroke="${stroke}" stroke-width="2"/></g>`;
    }
    case "desk": {
      const deskH = h * 0.62;
      const chairR = Math.min(w, h) * 0.18;
      return `<g class="symbol-desk"><circle cx="${cx}" cy="${y0 + deskH + chairR * 0.7}" r="${chairR}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/><rect x="${x0}" y="${y0}" width="${w}" height="${deskH}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><rect x="${cx - 14}" y="${y0 + deskH * 0.2}" width="28" height="20" transform="rotate(-20 ${cx} ${y0 + deskH * 0.3})" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/></g>`;
    }
    case "bathtub": {
      const pad = 8;
      return `<g class="symbol-bathtub"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><rect x="${x0 + pad}" y="${y0 + pad}" width="${w - 2 * pad}" height="${h - 2 * pad}" rx="${Math.min(w, h) * 0.25}" fill="none" stroke="${stroke}" stroke-width="1.6"/><circle cx="${cx}" cy="${y0 + pad + 14}" r="4" fill="none" stroke="${stroke}" stroke-width="1.4"/></g>`;
    }
    case "shower": {
      const pad = 6;
      return `<g class="symbol-shower"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><rect x="${x0 + pad}" y="${y0 + pad}" width="${w - 2 * pad}" height="${h - 2 * pad}" rx="4" fill="none" stroke="${stroke}" stroke-width="1.4"/><line x1="${x0 + pad}" y1="${y0 + pad}" x2="${x0 + w - pad}" y2="${y0 + h - pad}" stroke="${stroke}" stroke-width="1" stroke-opacity="0.5"/><line x1="${x0 + w - pad}" y1="${y0 + pad}" x2="${x0 + pad}" y2="${y0 + h - pad}" stroke="${stroke}" stroke-width="1" stroke-opacity="0.5"/><circle cx="${cx}" cy="${cy}" r="5" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/></g>`;
    }
    case "toilet": {
      const tankH = h * 0.28;
      const bowlW = w * 0.76;
      const bowlH = h * 0.68;
      return `<g class="symbol-toilet"><rect x="${x0}" y="${y0}" width="${w}" height="${tankH}" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/><ellipse cx="${cx}" cy="${y0 + tankH + bowlH * 0.48}" rx="${bowlW / 2}" ry="${bowlH / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/></g>`;
    }
    case "sink": {
      return `<g class="symbol-sink"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/><rect x="${x0 + w * 0.14}" y="${y0 + h * 0.18}" width="${w * 0.72}" height="${h * 0.66}" rx="6" fill="none" stroke="${stroke}" stroke-width="1.4"/><circle cx="${cx}" cy="${y0 + h * 0.48}" r="3" fill="${stroke}"/></g>`;
    }
    case "double_sink": {
      const bw = w * 0.36;
      return `<g class="symbol-double-sink"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/><rect x="${x0 + w * 0.08}" y="${y0 + h * 0.18}" width="${bw}" height="${h * 0.66}" rx="5" fill="none" stroke="${stroke}" stroke-width="1.4"/><rect x="${x0 + w * 0.56}" y="${y0 + h * 0.18}" width="${bw}" height="${h * 0.66}" rx="5" fill="none" stroke="${stroke}" stroke-width="1.4"/></g>`;
    }
    case "kitchen_island": {
      const stoveY = y0 + h * 0.68;
      const sinkY = y0 + h * 0.24;
      return `<g class="symbol-kitchen-island"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><rect x="${x0 + w * 0.15}" y="${sinkY - 22}" width="${w * 0.48}" height="44" rx="3" fill="none" stroke="${stroke}" stroke-width="1.5"/><rect x="${x0 + w * 0.15}" y="${stoveY - 26}" width="${w * 0.52}" height="52" fill="none" stroke="${stroke}" stroke-width="1.5"/><circle cx="${x0 + w * 0.29}" cy="${stoveY - 12}" r="7" fill="none" stroke="${stroke}" stroke-width="1.4"/><circle cx="${x0 + w * 0.53}" cy="${stoveY - 12}" r="7" fill="none" stroke="${stroke}" stroke-width="1.4"/><circle cx="${x0 + w * 0.29}" cy="${stoveY + 12}" r="7" fill="none" stroke="${stroke}" stroke-width="1.4"/><circle cx="${x0 + w * 0.53}" cy="${stoveY + 12}" r="7" fill="none" stroke="${stroke}" stroke-width="1.4"/></g>`;
    }
    default:
      return `<rect class="object-fill" x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>`;
  }
};

export const renderObjectsLayer = (objects: readonly ObjectBox[]): string =>
  objects
    .map(
      (object) =>
        `<g transform="${rotationTransform(object)}">${clearanceFrame(object)}${renderObjectSymbol(object) ?? `${objectFrame(object)}${objectCross(object)}`}${object.label ? `<text x="${object.center.x}" y="${svgY(object.center.y)}" text-anchor="middle" fill="#222" stroke="white" stroke-width="4" paint-order="stroke">${escapeXml(object.label)}</text>` : ""}</g>`,
    )
    .join("");
