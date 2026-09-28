import { randomUUID } from "node:crypto";
import type {
  Failure,
  HousePlan,
  Level,
  Named,
  Operation,
  Storey,
} from "./model.js";
import { failure } from "./result.js";
import { validate } from "./validation.js";

const newId = (): string => randomUUID();
const named = <T extends Named>(
  values: readonly T[],
  name: string,
): T | undefined => values.find((value) => value.name === name);
const replace = <T extends Named>(
  values: readonly T[],
  value: T,
): readonly T[] => [
  ...values.filter((candidate) => candidate.name !== value.name),
  value,
];
const withId = <T extends { readonly name: string }>(
  entity: T,
  previous?: Named,
): T & Named => ({ ...entity, id: previous?.id ?? newId() });
const emptyStorey = (levelId: string): Storey => ({
  id: newId(),
  levelId,
  walls: [],
  rooms: [],
  openings: [],
  objects: [],
  stairs: [],
  voids: [],
  annotations: [],
  dimensions: [],
});

const upsertLevel = (
  plan: HousePlan,
  operation: Extract<Operation, { readonly kind: "level.upsert" }>,
): HousePlan => {
  const previous = named(plan.levels, operation.name);
  const level: Level = {
    id: previous?.id ?? newId(),
    name: operation.name,
    elevationCm: operation.elevationCm,
    order: operation.order,
  };
  return {
    ...plan,
    levels: replace(plan.levels, level),
    storeys: previous ? plan.storeys : [...plan.storeys, emptyStorey(level.id)],
  };
};

const updateStorey = (
  plan: HousePlan,
  levelName: string,
  change: (storey: Storey) => Storey,
): HousePlan | Failure => {
  const level = named(plan.levels, levelName);
  if (!level)
    return failure(
      "not_found",
      `Unknown level '${levelName}'`,
      "Create the level first.",
    );
  const source = plan.storeys.find((storey) => storey.levelId === level.id);
  if (!source)
    return failure(
      "internal",
      `Level '${level.name}' has no storey`,
      "Reinitialize the plan.",
    );
  const updated = change(source);
  return {
    ...plan,
    storeys: plan.storeys.map((storey) =>
      storey.id === updated.id ? updated : storey,
    ),
  };
};

const upsertResource = (
  plan: HousePlan,
  operation: Exclude<Operation, { readonly kind: "level.upsert" }>,
): HousePlan | Failure =>
  updateStorey(plan, operation.level, (storey) => {
    switch (operation.kind) {
      case "wall.upsert":
        return {
          ...storey,
          walls: replace(
            storey.walls,
            withId(
              operation.entity,
              named(storey.walls, operation.entity.name),
            ),
          ),
        };
      case "room.upsert":
        return {
          ...storey,
          rooms: replace(
            storey.rooms,
            withId(
              operation.entity,
              named(storey.rooms, operation.entity.name),
            ),
          ),
        };
      case "opening.upsert":
        return {
          ...storey,
          openings: replace(
            storey.openings,
            withId(
              operation.entity,
              named(storey.openings, operation.entity.name),
            ),
          ),
        };
      case "object.upsert":
        return {
          ...storey,
          objects: replace(
            storey.objects,
            withId(
              operation.entity,
              named(storey.objects, operation.entity.name),
            ),
          ),
        };
      case "stair.upsert":
        return {
          ...storey,
          stairs: replace(
            storey.stairs,
            withId(
              operation.entity,
              named(storey.stairs, operation.entity.name),
            ),
          ),
        };
      case "void.upsert":
        return {
          ...storey,
          voids: replace(
            storey.voids,
            withId(
              operation.entity,
              named(storey.voids, operation.entity.name),
            ),
          ),
        };
      case "annotation.upsert":
        return {
          ...storey,
          annotations: replace(
            storey.annotations,
            withId(
              operation.entity,
              named(storey.annotations, operation.entity.name),
            ),
          ),
        };
      case "dimension.upsert":
        return {
          ...storey,
          dimensions: replace(
            storey.dimensions,
            withId(
              operation.entity,
              named(storey.dimensions, operation.entity.name),
            ),
          ),
        };
    }
  });

const applyOne = (
  plan: HousePlan,
  operation: Operation,
): HousePlan | Failure =>
  operation.kind === "level.upsert"
    ? upsertLevel(plan, operation)
    : upsertResource(plan, operation);

export const apply = (
  plan: HousePlan,
  expectedRevision: number,
  operations: readonly Operation[],
): HousePlan | Failure => {
  if (plan.revision !== expectedRevision)
    return failure(
      "revision_conflict",
      `Expected revision ${expectedRevision}; plan is ${plan.revision}`,
      "Read the plan and retry with its current revision.",
    );
  let candidate: HousePlan = structuredClone(plan);
  for (const operation of operations) {
    const result = applyOne(candidate, operation);
    if ("ok" in result) return result;
    candidate = result;
  }
  const diagnostics = validate(candidate);
  return diagnostics.some((diagnostic) => diagnostic.severity === "error")
    ? failure(
        "invalid_input",
        "Mutation would violate plan invariants",
        "Fix diagnostics and retry; no changes were written.",
        diagnostics,
      )
    : { ...candidate, revision: candidate.revision + 1 };
};
