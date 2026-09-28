import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { HousePlan } from "../plan/model.js";

export const loadPlan = async (path: string): Promise<HousePlan> =>
  JSON.parse(await readFile(path, "utf8")) as HousePlan;

export const savePlan = async (
  path: string,
  plan: HousePlan,
): Promise<void> => {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temporarySibling = `${target}.${process.pid}.tmp`;
  await writeFile(
    temporarySibling,
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  await rename(temporarySibling, target);
};
