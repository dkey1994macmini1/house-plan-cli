import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HousePlan } from "../plan/model.js";
import { validate } from "../plan/validation.js";
import { renderSvg } from "./svg-renderer.js";

export type RenderedLevel = Readonly<{ level: string; path: string }>;

const findStorey = (plan: HousePlan, levelName: string) => {
  const level = plan.levels.find((candidate) => candidate.name === levelName);
  return level
    ? plan.storeys.find((candidate) => candidate.levelId === level.id)
    : undefined;
};

const throwWhenPlanHasErrors = (plan: HousePlan): void => {
  const diagnostics = validate(plan);
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error"))
    throw new Error(JSON.stringify(diagnostics));
};

export const renderLevelToFile = async (
  plan: HousePlan,
  levelName: string,
  path: string,
): Promise<RenderedLevel> => {
  throwWhenPlanHasErrors(plan);
  const storey = findStorey(plan, levelName);
  if (!storey) throw new Error(`Unknown level '${levelName}'`);
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
): Promise<readonly RenderedLevel[]> => {
  throwWhenPlanHasErrors(plan);
  await mkdir(directory, { recursive: true });
  const files = await Promise.all(
    plan.levels
      .toSorted((left, right) => left.order - right.order)
      .map((level) =>
        renderLevelToFile(
          plan,
          level.name,
          join(directory, `${level.name}.svg`),
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
