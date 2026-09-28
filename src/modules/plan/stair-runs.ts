import { StairOccurrence } from "./domain-objects.js";
import type { HousePlan, Level, Stair, Storey } from "./model.js";

export type StairLanding = Readonly<{
  level: Level;
  storey: Storey;
  stair: Stair;
}>;

export type StairRun = Readonly<{
  run: string;
  landings: readonly StairLanding[];
}>;

export type ConnectingStairRun = Readonly<{
  run: string;
  lower: StairLanding;
  upper: StairLanding;
}>;

/** Stair occurrences grouped by run, each run ordered from its lowest level upward. */
export const stairRuns = (plan: HousePlan): readonly StairRun[] => {
  const landings = plan.storeys.flatMap((storey) => {
    const level = plan.levels.find(
      (candidate) => candidate.id === storey.levelId,
    );
    return level
      ? storey.stairs.map((stair) => ({ level, storey, stair }))
      : [];
  });
  const runs = [...new Set(landings.map((landing) => landing.stair.run))];
  return runs.map((run) => ({
    run,
    landings: landings
      .filter((landing) => landing.stair.run === run)
      .toSorted((left, right) => left.level.order - right.level.order),
  }));
};

export const runClimbsBetweenAlignedLandings = (
  lower: StairLanding,
  upper: StairLanding,
): boolean =>
  lower.stair.direction === "up" &&
  upper.stair.direction === "down" &&
  new StairOccurrence(lower.stair).matchesCounterpart(
    new StairOccurrence(upper.stair),
  );

export const upperLandingOpensIntoVoid = (upper: StairLanding): boolean =>
  upper.storey.voids.some((voidItem) =>
    new StairOccurrence(upper.stair).isContainedBy(voidItem.bounds),
  );

/** Runs that validly join two storeys and therefore carry circulation between them. */
export const connectingStairRuns = (
  plan: HousePlan,
): readonly ConnectingStairRun[] =>
  stairRuns(plan).flatMap(({ run, landings }) => {
    const [lower, upper] = landings;
    if (!lower || !upper || landings.length !== 2) return [];
    return runClimbsBetweenAlignedLandings(lower, upper) &&
      upperLandingOpensIntoVoid(upper)
      ? [{ run, lower, upper }]
      : [];
  });
