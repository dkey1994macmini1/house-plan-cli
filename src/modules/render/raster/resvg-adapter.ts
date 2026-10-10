import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fitRasterToWidth } from "../render-options.js";

export type RasterizationConfigError = Error & { readonly kind: "config" };
export type RasterizationInfraError = Error & {
  readonly kind: "infrastructure";
};

const configError = (message: string): RasterizationConfigError =>
  Object.assign(new Error(message), { kind: "config" as const });
const infraError = (message: string, cause: unknown): RasterizationInfraError =>
  Object.assign(new Error(message), { kind: "infrastructure" as const, cause });

export type RasterizedImage = Readonly<{
  bytes: Buffer;
  width: number;
  height: number;
}>;

/** The bundled portable font family; PNG text always comes from these files. */
const svgFontFamily = "DejaVu Sans";
export const rasterFontFamily = svgFontFamily;

const fontDirCandidates = (): readonly string[] => {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates: string[] = [];
  let current = moduleDir;
  for (let depth = 0; depth < 6; depth += 1) {
    candidates.push(join(current, "assets/fonts"));
    current = dirname(current);
  }
  return candidates;
};

export const bundledFontFiles = (): readonly string[] => {
  for (const directory of fontDirCandidates()) {
    const regular = join(directory, "DejaVuSans.ttf");
    const bold = join(directory, "DejaVuSans-Bold.ttf");
    if (existsSync(regular) && existsSync(bold)) return [regular, bold];
  }
  throw infraError(
    "Bundled font files are missing from assets/fonts; PNG rendering needs the redistributable DejaVu Sans TTF files shipped with this repository.",
    undefined,
  );
};

const viewBoxSize = (
  svg: string,
): Readonly<{ width: number; height: number }> => {
  const match = svg.match(
    /viewBox="(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+([\d.eE+]+)\s+([\d.eE+]+)"/,
  );
  const width = Number(match?.[3]);
  const height = Number(match?.[4]);
  if (!match || !Number.isFinite(width) || !Number.isFinite(height))
    throw infraError("Generated SVG is missing a usable viewBox.", undefined);
  return { width, height };
};

/**
 * Rasterizes the exact generated SVG to PNG at a fixed pixel width, fully
 * offline: only the bundled font files are loaded, and the resvg import lives
 * at this rasterization edge alone.
 */
export const renderPng = async (
  svg: string,
  requestedWidth: number,
): Promise<RasterizedImage> => {
  const size = viewBoxSize(svg);
  const fitted = fitRasterToWidth(size.width, size.height, requestedWidth);
  if (!fitted.ok) throw configError(fitted.reason);
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: requestedWidth },
      font: {
        fontFiles: [...bundledFontFiles()],
        loadSystemFonts: false,
        defaultFontFamily: svgFontFamily,
      },
      logLevel: "off",
    });
    const rendered = resvg.render();
    const image = {
      bytes: Buffer.from(rendered.asPng()),
      width: rendered.width,
      height: rendered.height,
    };
    if (image.width !== fitted.width || image.height !== fitted.height)
      throw infraError(
        `Rasterized image is ${image.width}x${image.height} px although the bounded derivation promised ${fitted.width}x${fitted.height} px.`,
        undefined,
      );
    return image;
  } catch (cause) {
    if ((cause as { kind?: string }).kind) throw cause;
    throw infraError(
      `Native SVG rasterization failed: ${String(cause)}`,
      cause,
    );
  }
};
