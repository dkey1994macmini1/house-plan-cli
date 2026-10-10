import { join } from "node:path";
import type { Diagnostic, HousePlan } from "../plan/model.js";
import { validate } from "../plan/validation.js";
import {
  guardedWriteFile,
  safeLevelSlug,
  stagePublishAll,
} from "./artifact-fs.js";
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

/**
 * Renders ONE level's bytes. All writes go through the artifact safety
 * adapter: the plan source (and any other protected input) can never be
 * overwritten by its own export, and replacing an existing artifact needs
 * an explicit overwrite decision (handoff §4.1).
 */
const renderArtifact = async (
  plan: HousePlan,
  storey: NonNullable<ReturnType<typeof findStorey>>,
  path: string,
  settings: RenderSettings,
  protectedInputs: readonly string[],
  overwrite: boolean,
): Promise<RenderedLevel> => {
  const levelName =
    plan.levels.find((candidate) => candidate.id === storey.levelId)?.name ??
    storey.id;
  if (settings.format === "png") {
    const image = await rasterize(
      renderSvg(plan, storey, settings.style),
      settings,
    );
    await guardedWriteFile(path, image.bytes, {
      protect: protectedInputs,
      overwrite,
    });
    return {
      level: levelName,
      path,
      format: "png",
      width: image.width,
      height: image.height,
    };
  }
  await guardedWriteFile(path, renderSvg(plan, storey, settings.style), {
    protect: protectedInputs,
    overwrite,
  });
  return { level: levelName, path, format: "svg" };
};

export const renderLevelToFile = async (
  plan: HousePlan,
  levelName: string,
  path: string,
  allowInvalid = false,
  settings: RenderSettings = technicalDefaults,
  protectedInputs: readonly string[] = [],
  overwrite = false,
): Promise<RenderedLevel> => {
  assertNoDiagnostics(plan, allowInvalid);
  const storey = findStorey(plan, levelName);
  if (!storey) throw new UnknownLevelError(levelName);
  return renderArtifact(
    plan,
    storey,
    path,
    settings,
    protectedInputs,
    overwrite,
  );
};

const createManifest = (
  plan: HousePlan,
  files: readonly RenderedLevel[],
): Record<string, unknown> => ({
  schemaVersion: 1,
  revision: plan.revision,
  levels: files,
});

/**
 * All-levels export. Filenames derive from `safeLevelSlug` — the level
 * display name is a domain name, not a filename, and cannot traverse the
 * out-dir (handoff §4.2); the manifest keeps the real level names. Every
 * artifact filename is derived and validated BEFORE any filesystem
 * mutation; the bundle stages into a fresh subdirectory and publishes
 * only after every artifact (manifest included) succeeded (§4.3 minimum).
 */
export const renderAllLevelsToDirectory = async (
  plan: HousePlan,
  directory: string,
  allowInvalid = false,
  settings: RenderSettings = technicalDefaults,
  overwrite = false,
): Promise<readonly RenderedLevel[]> => {
  assertNoDiagnostics(plan, allowInvalid);
  const extension = settings.format === "png" ? "png" : "svg";
  // Preflight: derive every artifact filename first. A hostile level name
  // refuses here, before the out-dir is even created.
  const taken = new Set<string>();
  const stagedPlan = plan.levels
    .toSorted((left, right) => left.order - right.order)
    .map((level) => {
      const storey = plan.storeys.find(
        (candidate) => candidate.levelId === level.id,
      );
      if (!storey) throw new UnknownLevelError(level.name);
      const filename = `${safeLevelSlug(level.name, taken)}.${extension}`;
      taken.add(filename);
      return { level, storey, filename };
    });
  const files: RenderedLevel[] = [];
  await stagePublishAll(
    directory,
    async (stagingDirectory) => {
      const stagedNames: string[] = [];
      for (const { storey, filename } of stagedPlan) {
        files.push(
          // Staging is a fresh private directory: overwrite is safe there
          // and no input can alias a staged path.
          await renderArtifact(
            plan,
            storey,
            join(stagingDirectory, filename),
            settings,
            [],
            true,
          ),
        );
        stagedNames.push(filename);
      }
      await guardedWriteFile(
        join(stagingDirectory, "manifest.json"),
        `${JSON.stringify(createManifest(plan, files), null, 2)}\n`,
        { protect: [], overwrite: true },
      );
      stagedNames.push("manifest.json");
      return stagedNames;
    },
    { overwrite },
  );
  return files;
};
