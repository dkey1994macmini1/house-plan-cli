import { PlanObject } from "../plan/domain-objects.js";
import { boundsOverlap } from "../plan/geometry.js";
import type {
  Bounds,
  Dimension,
  HousePlan,
  ResolvedRoom,
  Storey,
} from "../plan/model.js";
import { resolvePlan } from "../plan/resolution.js";
import {
  type DerivedFace,
  DerivedTopology,
  pointStrictlyInsideFace,
} from "../plan/topology.js";
import {
  renderStairsLayer,
  renderVoidsLayer,
  voidHatchDefinition,
} from "./circulation-layer.js";
import {
  centeredLabelPoint,
  estimatedTextWidth,
  labelObstacles,
} from "./label-placement.js";
import {
  escapeXml,
  type GraphicsPalette,
  renderOpening,
  renderWall,
  svgY,
} from "./plan-graphics.js";
import { paperRect, unionBounds } from "./presentation-bounds.js";
import {
  floorFillFor,
  type PresentationPalette,
  presentationPalette,
} from "./presentation-palette.js";

/** Deterministic layout metrics: every band is derived from the plan, never from plan names. */
const paperMargin = 80;
const headerHeight = 300;
const headerGap = 70;
const notesGap = 70;
const notesLineHeight = 34;
const notesFontSize = 22;
const notesPadding = 30;
const areaLabelFontSize = 20;
const furnitureLabelFontSize = 14;

const areaCm2ToM2 = (areaCm2: number): string =>
  `${(areaCm2 / 10000).toFixed(1).replace(".", ",")} m²`;

/** Paper-space (SVG user space, Y mirrored) face polygon. */
const polygonPoints = (vertices: readonly { x: number; y: number }[]): string =>
  vertices.map((point) => `${point.x},${svgY(point.y)}`).join(" ");

const wrapText = (
  text: string,
  fontSize: number,
  maxWidth: number,
): readonly string[] => {
  const maxWidthCm = maxWidth;
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (estimatedTextWidth(candidate, fontSize) <= maxWidthCm || !current)
      current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
};

type FaceLabelGroup = Readonly<{
  key: string;
  face: DerivedFace;
  rooms: readonly ResolvedRoom[];
}>;

const faceKey = (face: DerivedFace): string =>
  face.vertices.map((point) => `${point.x}:${point.y}`).join(";");

/**
 * Groups resolved rooms by their shared derived face so an open-plan zone gets
 * exactly one area label, instead of each room claiming the same area again.
 */
const groupRoomsByFace = (
  faces: readonly DerivedFace[],
  rooms: readonly ResolvedRoom[],
): readonly FaceLabelGroup[] =>
  faces
    .map((face) => ({
      key: faceKey(face),
      face,
      rooms: rooms
        .filter((room) => pointStrictlyInsideFace(face, room.seed))
        .toSorted((left, right) => left.name.localeCompare(right.name)),
    }))
    .toSorted((left, right) => left.key.localeCompare(right.key));

const faceLabelLines = (group: FaceLabelGroup): readonly string[] => {
  const names = group.rooms.map((room) => room.name).join(" · ");
  const area = group.rooms[0]?.areaCm2;
  const maxWidth = Math.max(60, Math.min(group.face.bounds.width - 40, 520));
  return [
    ...wrapText(names, areaLabelFontSize, maxWidth)
      .filter(Boolean)
      .map(escapeXml),
    ...(area !== undefined ? [escapeXml(areaCm2ToM2(area))] : []),
  ];
};

/** One two-line label per unique face, placed clear of walls and furniture. */
const renderFaceLabels = (
  groups: readonly FaceLabelGroup[],
  storey: Storey,
  palette: PresentationPalette,
): string => {
  const obstacles = labelObstacles(storey);
  return groups
    .flatMap((group) => {
      const lines = faceLabelLines(group);
      if (lines.length === 0) return [];
      const blockWidth = Math.max(
        ...lines.map((line) =>
          estimatedTextWidth(stripTags(line), areaLabelFontSize),
        ),
      );
      const blockHeight = lines.length * areaLabelFontSize * 1.25;
      const anchor = centeredLabelPoint(
        group.face,
        { width: blockWidth, height: blockHeight },
        obstacles,
      );
      const linesHtml = lines.map(
        (line, lineIndex) =>
          `<text x="${anchor.x}" y="${svgY(anchor.y) - blockHeight / 2 + areaLabelFontSize * 1.25 * (lineIndex + 0.5)}" font-size="${areaLabelFontSize}" text-anchor="middle" dominant-baseline="middle" fill="${lineIndex === 0 && group.rooms.length > 0 ? palette.labelPrimary : palette.labelArea}" stroke="${palette.background}" stroke-width="4" paint-order="stroke">${line}</text>`,
      );
      return linesHtml;
    })
    .join("");
};

const stripTags = (line: string): string =>
  line
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"');

const presentationGraphics: GraphicsPalette = {
  openingCut: presentationPalette.openingCut,
  door: presentationPalette.door,
  window: presentationPalette.window,
};

/** Furniture labels either fit completely inside the domain footprint or use a keyed legend. */
const renderFurnitureLayer = (
  storey: Storey,
  palette: PresentationPalette,
): Readonly<{ svg: string; notes: readonly string[] }> => {
  const notes: string[] = [];
  const svg = storey.objects
    .map((object, index) => {
      const bounds = new PlanObject(object).bounds;
      const lines = wrapText(
        object.label,
        furnitureLabelFontSize,
        Math.max(12, bounds.width - 12),
      );
      const fits =
        lines.length * furnitureLabelFontSize * 1.25 <= bounds.height - 10 &&
        lines.every(
          (line) =>
            estimatedTextWidth(line, furnitureLabelFontSize) <=
            bounds.width - 10,
        );
      const key = `O${index + 1}`;
      const visible = fits ? lines : [key];
      if (!fits) notes.push(`${key}: ${object.label}`);
      const labels = visible
        .map(
          (line, index, all) =>
            `<text x="${object.center.x}" y="${svgY(object.center.y) + (index - (all.length - 1) / 2) * furnitureLabelFontSize * 1.25}" font-size="${furnitureLabelFontSize}" text-anchor="middle" dominant-baseline="middle" fill="${palette.furniture.label}">${escapeXml(line)}</text>`,
        )
        .join("");
      return `<g transform="rotate(${-object.rotation} ${object.center.x} ${svgY(object.center.y)})"><rect class="object-fill" x="${object.center.x - object.width / 2}" y="${svgY(object.center.y + object.depth / 2)}" width="${object.width}" height="${object.depth}" fill="${palette.furniture.fill}" stroke="${palette.furniture.outline}" stroke-width="2"/></g><g class="${fits ? "furniture-label" : "furniture-key"}">${labels}</g>`;
    })
    .join("");
  return { svg, notes };
};

const renderFloorsLayer = (
  faces: readonly DerivedFace[],
  rooms: readonly ResolvedRoom[],
  palette: PresentationPalette,
): string =>
  faces
    .flatMap((face) => {
      const roomsOnFace = rooms.filter((room) =>
        pointStrictlyInsideFace(face, room.seed),
      );
      const fill = floorFillFor(
        roomsOnFace.map((room) => room.type),
        palette,
      );
      return [
        `<polygon class="face-floor" points="${polygonPoints(face.vertices)}" fill="${fill}"/>`,
      ];
    })
    .join("");

const scaleBarLength = (contentWidth: number): number => {
  const candidates = [2000, 1000, 500, 250, 200, 100, 50, 25];
  const target = contentWidth / 3;
  const fitting = candidates.find((candidate) => candidate <= target);
  return fitting ?? candidates[candidates.length - 1] ?? 25;
};

const formatMetres = (cm: number): string =>
  `${(cm / 100).toLocaleString("pl-PL")} m`;

const renderScaleBar = (
  x: number,
  y: number,
  contentWidth: number,
  palette: PresentationPalette,
): string => {
  const length = scaleBarLength(contentWidth);
  const half = length / 2;
  return `<g class="scale-bar"><rect x="${x}" y="${y}" width="${half}" height="8" fill="${palette.heading}"/><rect x="${x + half}" y="${y}" width="${half}" height="8" fill="${palette.background}" stroke="${palette.heading}" stroke-width="2"/><text x="${x}" y="${y - 6}" font-size="18" text-anchor="middle" fill="${palette.heading}">0</text><text x="${x + length}" y="${y - 6}" font-size="18" text-anchor="middle" fill="${palette.heading}">${escapeXml(formatMetres(length))}</text></g>`;
};

const renderNorthMarker = (
  x: number,
  y: number,
  palette: PresentationPalette,
): string =>
  `<g class="north"><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 55}" stroke="${palette.heading}" stroke-width="5"/><polygon points="${x},${y - 75} ${x - 12},${y - 45} ${x + 12},${y - 45}" fill="${palette.heading}"/><text x="${x}" y="${y - 90}" font-size="24" font-weight="bold" text-anchor="middle" fill="${palette.heading}">N</text><text x="${x}" y="${y + 24}" font-size="14" text-anchor="middle" fill="${palette.headingMuted}">+Y (przyjęte)</text></g>`;

const renderHeader = (
  title: string,
  revision: number,
  contentPaperBounds: Bounds,
  palette: PresentationPalette,
): string => {
  const top = contentPaperBounds.y - headerGap - headerHeight;
  const left = contentPaperBounds.x;
  const available = contentPaperBounds.width - 160;
  const titleLines = wrapText(title, 32, available);
  const subtitle = `Rewizja ${revision} · powierzchnie po osiach ścian, nie powierzchnia użytkowa`;
  const renderLines = (
    lines: readonly string[],
    firstY: number,
    size: number,
  ) =>
    lines
      .map(
        (line, index) =>
          `<text x="${left}" y="${firstY + index * size * 1.4}" font-size="${size}" fill="${palette.headingMuted}">${escapeXml(line)}</text>`,
      )
      .join("");
  return `<g id="header" font-family="DejaVu Sans, sans-serif">${renderLines(titleLines, top + 50, 32)}${renderLines(wrapText(subtitle, 18, available), top + 110, 18)}${renderLines(wrapText("Rysunek roboczy — nie projekt budowlany; bez potwierdzenia WT/MPZP i kosztu.", 16, available), top + 178, 16)}${renderScaleBar(left + 12, top + 270, contentPaperBounds.width - 220, palette)}${renderNorthMarker(left + contentPaperBounds.width - 40, top + 200, palette)}</g>`;
};

const renderNotesPanel = (
  notes: readonly string[],
  contentPaperBounds: Bounds,
  palette: PresentationPalette,
): { svg: string; height: number } => {
  // The panel stays within the plan's paper width; narrow plans wrap more.
  const wrapWidth = Math.max(contentPaperBounds.width - 60, 300);
  const wrapped = notes.flatMap((note) =>
    wrapText(note, notesFontSize, wrapWidth),
  );
  if (wrapped.length === 0) return { svg: "", height: 0 };
  const panelHeight = wrapped.length * notesLineHeight + 2 * notesPadding;
  const top = contentPaperBounds.y + contentPaperBounds.height + notesGap;
  const width = contentPaperBounds.width;
  const lines = wrapped
    .map(
      (line, index) =>
        `<text class="notes-line" x="${contentPaperBounds.x}" y="${top + notesPadding + (index + 0.5) * notesLineHeight}" font-size="${notesFontSize}" fill="${palette.panel.text}">${escapeXml(line)}</text>`,
    )
    .join("");
  return {
    svg: `<g id="notes"><rect x="${contentPaperBounds.x - 10}" y="${top}" width="${width + 20}" height="${panelHeight}" fill="${palette.panel.background}" stroke="${palette.panel.border}" stroke-width="2"/>${lines}</g>`,
    height: notesGap + panelHeight,
  };
};

const dimensionNoteText = (dimension: Dimension): string =>
  `${dimension.name}: ${Math.hypot(dimension.b.x - dimension.a.x, dimension.b.y - dimension.a.y)} cm`;

const renderDimensionLayer = (
  dimensions: readonly Dimension[],
  contentPaperBounds: Bounds,
): { svg: string; note: string | undefined } => {
  const drawn: string[] = [];
  const deferred: string[] = [];
  const inside = (target: Bounds): boolean =>
    boundsOverlap(target, contentPaperBounds) ||
    (target.x + target.width >= contentPaperBounds.x &&
      target.x <= contentPaperBounds.x + contentPaperBounds.width);
  for (const dimension of dimensions) {
    const lineY = svgY(dimension.a.y + dimension.offset);
    const lineBounds = {
      x: Math.min(dimension.a.x, dimension.b.x),
      y: lineY,
      width: Math.abs(dimension.b.x - dimension.a.x),
      height: 20,
    };
    if (
      inside(lineBounds) &&
      lineY >= contentPaperBounds.y &&
      lineY <= contentPaperBounds.y + contentPaperBounds.height
    )
      drawn.push(
        `<g><line x1="${dimension.a.x}" y1="${lineY}" x2="${dimension.b.x}" y2="${lineY}" stroke="#8a8578"/><text x="${(dimension.a.x + dimension.b.x) / 2}" y="${lineY - 6}" font-size="18" text-anchor="middle" fill="${presentationPalette.headingMuted}">${escapeXml(dimensionNoteText(dimension))}</text></g>`,
      );
    else deferred.push(dimensionNoteText(dimension));
  }
  return {
    svg: drawn.join(""),
    note:
      deferred.length > 0
        ? `Wymiary wykraczające poza rzut: ${deferred.join("; ")}`
        : undefined,
  };
};

export const renderPresentationSvg = (
  plan: HousePlan,
  storey: Storey,
): string => {
  const resolved = resolvePlan(plan).storeys.find(
    (candidate) => candidate.id === storey.id,
  );
  if (!resolved) throw new Error(`Cannot render unknown storey '${storey.id}'`);
  const palette = presentationPalette;
  const topology = new DerivedTopology(storey.walls);
  const labelGroups = groupRoomsByFace(topology.faces, resolved.rooms);
  const contentPlanBounds = unionBounds([
    resolved.bounds,
    ...storey.walls.flatMap((wall) => [
      {
        x: Math.min(wall.a.x, wall.b.x) - wall.thickness / 2,
        y: Math.min(wall.a.y, wall.b.y) - wall.thickness / 2,
        width: Math.abs(wall.a.x - wall.b.x) + wall.thickness,
        height: Math.abs(wall.a.y - wall.b.y) + wall.thickness,
      },
    ]),
    ...storey.stairs.map((stair) => stair.bounds),
    ...storey.voids.map((voidItem) => voidItem.bounds),
    ...storey.objects.map((object) => new PlanObject(object).bounds),
  ]);
  const geometryPaper = paperRect(contentPlanBounds);
  const contentPaper = {
    ...geometryPaper,
    width: Math.max(840, geometryPaper.width),
  };
  const furnitureLayer = renderFurnitureLayer(storey, palette);
  const dimensionLayer = renderDimensionLayer(storey.dimensions, contentPaper);
  const notes = [
    ...(storey.annotations.length > 0
      ? [
          `Notatki: ${storey.annotations.map((annotation) => annotation.text).join(" · ")}`,
        ]
      : []),
    ...(dimensionLayer.note ? [dimensionLayer.note] : []),
    ...furnitureLayer.notes,
  ];
  const notesPanel = renderNotesPanel(notes, contentPaper, palette);
  const width = contentPaper.width + 2 * paperMargin;
  const height =
    headerGap + headerHeight + contentPaper.height + notesPanel.height;
  const header = renderHeader(
    resolved.rooms.length > 0
      ? `Rzut poziomu — ${plan.levels.find((level) => level.id === storey.levelId)?.name ?? storey.id}`
      : `Rzut poziomu — ${plan.levels.find((level) => level.id === storey.levelId)?.name ?? storey.id}`,
    plan.revision,
    contentPaper,
    palette,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${contentPaper.x - paperMargin} ${contentPaper.y - headerGap - headerHeight} ${width} ${height}" font-family="DejaVu Sans, sans-serif"><defs>${voidHatchDefinition}</defs><rect x="${contentPaper.x - paperMargin}" y="${contentPaper.y - headerGap - headerHeight}" width="${width}" height="${height}" fill="${palette.background}"/><g id="floors">${renderFloorsLayer(topology.faces, resolved.rooms, palette)}</g><g id="walls">${storey.walls.map((wall) => renderWall(wall, palette.wall)).join("")}</g><g id="openings">${storey.openings.map((opening) => renderOpening(opening, storey, presentationGraphics)).join("")}</g><g id="objects">${furnitureLayer.svg}</g><g id="room-labels">${renderFaceLabels(labelGroups, storey, palette)}</g><g id="stairs">${renderStairsLayer(storey.stairs)}</g><g id="voids">${renderVoidsLayer(storey.voids, storey.stairs)}</g><g id="dimensions">${dimensionLayer.svg}</g>${header}${notesPanel.svg}</svg>`;
};
