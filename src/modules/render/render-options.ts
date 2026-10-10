export type RenderStyle = "technical" | "presentation";
export type RenderFormat = "svg" | "png";

export type RenderSettings = Readonly<{
  style: RenderStyle;
  format: RenderFormat;
  /**
   * PNG pixel width. Present only when explicitly selected for PNG; the
   * adapter's default width applies otherwise.
   */
  width?: number;
}>;

export type RenderConfigRejection = Readonly<{ message: string; hint: string }>;

export const defaultPngWidth = 2400;
export const minPngWidth = 1;
export const maxPngWidth = 8192;

/**
 * Raster memory guards: the derived pixel height and the total pixel count of
 * one exported image must stay far below sizes that could exhaust memory.
 */
export const maxPngHeight = 16384;
export const maxPngPixels = maxPngWidth * maxPngWidth;

const renderStyles: readonly RenderStyle[] = ["technical", "presentation"];
const renderFormats: readonly RenderFormat[] = ["svg", "png"];

const styleRejection = (style: string): RenderConfigRejection => ({
  message: `Unknown render style '${style}'`,
  hint: "Pass --style technical or --style presentation.",
});

const formatRejection = (format: string): RenderConfigRejection => ({
  message: `Unknown render format '${format}'`,
  hint: "Pass --format svg or --format png.",
});

/** Parses and validates the style/format/width flags as one render configuration. */
export const parseRenderSettings = (input: {
  readonly style?: string;
  readonly format?: string;
  readonly width?: number;
}):
  | Readonly<{ ok: true; settings: RenderSettings }>
  | Readonly<{ ok: false; rejection: RenderConfigRejection }> => {
  if (input.style !== undefined) {
    if (!renderStyles.includes(input.style as RenderStyle))
      return { ok: false, rejection: styleRejection(input.style) };
  }
  if (input.format !== undefined) {
    if (!renderFormats.includes(input.format as RenderFormat))
      return { ok: false, rejection: formatRejection(input.format) };
  }
  const style: RenderStyle =
    input.style === "presentation" ? "presentation" : "technical";
  const format: RenderFormat = input.format === "png" ? "png" : "svg";
  if (input.width !== undefined) {
    if (format !== "png")
      return {
        ok: false,
        rejection: {
          message: "--width applies only to --format png",
          hint: "Drop --width for SVG rendering or select --format png.",
        },
      };
    if (!Number.isInteger(input.width))
      return {
        ok: false,
        rejection: {
          message: `--width must be a positive integer, got '${input.width}'`,
          hint: `Pass an integer between ${minPngWidth} and ${maxPngWidth}.`,
        },
      };
    if (input.width < minPngWidth || input.width > maxPngWidth)
      return {
        ok: false,
        rejection: {
          message: `--width ${input.width} is outside the supported pixel range`,
          hint: `Pass an integer between ${minPngWidth} and ${maxPngWidth}.`,
        },
      };
  }
  return {
    ok: true,
    settings: {
      style,
      format,
      ...(input.width !== undefined ? { width: input.width } : {}),
    },
  };
};

/**
 * The pixel width a PNG rasterization of this SVG aspect will produce, and
 * whether it fits the bounded raster budget. Guards happen before rendering so
 * an oversized derived image costs nothing.
 */
export const fitRasterToWidth = (
  svgAspectRatioWidth: number,
  svgAspectRatioHeight: number,
  requestedWidth: number,
): Readonly<
  { ok: true; width: number; height: number } | { ok: false; reason: string }
> => {
  if (svgAspectRatioWidth <= 0 || svgAspectRatioHeight <= 0)
    return { ok: false, reason: "The SVG viewport has no drawable area." };
  const height = Math.round(
    (requestedWidth * svgAspectRatioHeight) / svgAspectRatioWidth,
  );
  if (height > maxPngHeight)
    return {
      ok: false,
      reason: `Derived raster height ${height} px exceeds the supported maximum ${maxPngHeight} px for width ${requestedWidth}.`,
    };
  if (requestedWidth * height > maxPngPixels)
    return {
      ok: false,
      reason: `Derived raster ${requestedWidth}x${height} px exceeds the supported pixel budget ${maxPngPixels}.`,
    };
  return { ok: true, width: requestedWidth, height };
};
