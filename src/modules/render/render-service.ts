import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Diagnostic, HousePlan } from "../plan/model.js";
import { validate } from "../plan/validation.js";
import { renderSvg } from "./svg-renderer.js";

export type RenderedLevel = Readonly<{ level: string; path: string }>;

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

export const renderLevelToFile = async (
  plan: HousePlan,
  levelName: string,
  path: string,
  allowInvalid = false,
): Promise<RenderedLevel> => {
  assertNoDiagnostics(plan, allowInvalid);
  const storey = findStorey(plan, levelName);
  if (!storey) throw new UnknownLevelError(levelName);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, renderSvg(plan, storey), "utf8");
  return { level: levelName, path };
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
): Promise<readonly RenderedLevel[]> => {
  assertNoDiagnostics(plan, allowInvalid);
  await mkdir(directory, { recursive: true });
  const files = await Promise.all(
    plan.levels
      .toSorted((left, right) => left.order - right.order)
      .map((level) =>
        renderLevelToFile(
          plan,
          level.name,
          join(directory, `${level.name}.svg`),
          allowInvalid,
        ),
      ),
  );
  await writeFile(
    join(directory, "manifest.json"),
    `${JSON.stringify(createManifest(plan, files), null, 2)}\n`,
    "utf8",
  );
  return files;
};
