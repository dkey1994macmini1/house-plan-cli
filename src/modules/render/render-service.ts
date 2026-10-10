import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Diagnostic, HousePlan } from "../plan/model.js";
import { validate } from "../plan/validation.js";
import type { RasterizationConfigError } from "./raster/resvg-adapter.js";
import { renderPng } from "./raster/resvg-adapter.js";
import type { RenderSettings } from "./render-options.js";
import { defaultPngWidth } from "./render-options.js";
import { renderSvg } from "./svg-renderer.js";

export type RenderedLevel = Readonly<{
  level: string;
  path: string;
  format: "svg" | "png";
  width?: number;
  height?: number;
}>;

export type RenderConfigurationError = Error & {
  readonly kind: "render-configuration";
  readonly rejection: { message: string; hint: string };
};

const technicalDefaults: RenderSettings = { style: "technical", format: "svg" };

const findStorey = (plan: HousePlan, levelName: string) => {
  const level = plan.levels.find((candidate) => candidate.name === levelName);
  return level
    ? plan.storeys.find((candidate) => candidate.levelId === level.id)
    : undefined;
};

export class PlanValidationError extends Error {
  constructor(readonly diagnostics: readonly Diagnostic[]) {
    super(JSON.stringify(diagnostics));
    this.name = "PlanValidationError";
  }
}

export class UnknownLevelError extends Error {
  constructor(readonly level: string) {
    super(`Unknown level '${level}'`);
    this.name = "UnknownLevelError";
  }
}

const assertNoDiagnostics = (plan: HousePlan, allowInvalid = false): void => {
  const diagnostics = validate(plan);
  if (
    !allowInvalid &&
    diagnostics.some((diagnostic) => diagnostic.severity === "error")
  )
    throw new PlanValidationError(diagnostics);
};

/** Rasterizes the exact generated SVG and returns its bounded pixel size. */
const rasterize = async (
  svg: string,
  settings: RenderSettings,
): Promise<{ bytes: Uint8Array; width: number; height: number }> => {
  let image: Awaited<ReturnType<typeof renderPng>>;
  try {
    image = await renderPng(svg, settings.width ?? defaultPngWidth);
  } catch (cause) {
    const kind = (cause as { kind?: string }).kind;
    if (kind === "config")
      throw Object.assign(
        new Error((cause as RasterizationConfigError).message),
        { kind: "render-configuration", rejection: cause },
      );
    throw cause;
  }
  return image;
};

const writeArtifact = async (
  plan: HousePlan,
  storey: NonNullable<ReturnType<typeof findStorey>>,
  path: string,
  settings: RenderSettings,
): Promise<RenderedLevel> => {
  const levelName =
    plan.levels.find((candidate) => candidate.id === storey.levelId)?.name ??
    storey.id;
  if (settings.format === "png") {
    const image = await rasterize(
      renderSvg(plan, storey, settings.style),
      settings,
    );
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, image.bytes);
    return {
      level: levelName,
      path,
      format: "png",
      width: image.width,
      height: image.height,
    };
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, renderSvg(plan, storey, settings.style), "utf8");
  return { level: levelName, path, format: "svg" };
};

export const renderLevelToFile = async (
  plan: HousePlan,
  levelName: string,
  path: string,
  allowInvalid = false,
  settings: RenderSettings = technicalDefaults,
): Promise<RenderedLevel> => {
  assertNoDiagnostics(plan, allowInvalid);
  const storey = findStorey(plan, levelName);
  if (!storey) throw new UnknownLevelError(levelName);
  return writeArtifact(plan, storey, path, settings);
};

const createManifest = (
  plan: HousePlan,
  files: readonly RenderedLevel[],
): Record<string, unknown> => ({
  schemaVersion: 1,
  revision: plan.revision,
  levels: files,
});

export const renderAllLevelsToDirectory = async (
  plan: HousePlan,
  directory: string,
  allowInvalid = false,
  settings: RenderSettings = technicalDefaults,
): Promise<readonly RenderedLevel[]> => {
  assertNoDiagnostics(plan, allowInvalid);
  await mkdir(directory, { recursive: true });
  const extension = settings.format === "png" ? "png" : "svg";
  const files: RenderedLevel[] = [];
  for (const level of plan.levels.toSorted(
    (left, right) => left.order - right.order,
  )) {
    const storey = plan.storeys.find(
      (candidate) => candidate.levelId === level.id,
    );
    if (!storey) throw new UnknownLevelError(level.name);
    files.push(
      await writeArtifact(
        plan,
        storey,
        join(directory, `${level.name}.${extension}`),
        settings,
      ),
    );
  }
  await writeFile(
    join(directory, "manifest.json"),
    `${JSON.stringify(createManifest(plan, files), null, 2)}\n`,
    "utf8",
  );
  return files;
};
