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
const asNamedEntity = <T extends Named>(value: unknown): T | undefined =>
  value &&
  typeof value === "object" &&
  typeof (value as { name?: unknown }).name === "string"
    ? ({
        ...(value as object),
        id:
          typeof (value as { id?: unknown }).id === "string"
            ? (value as { id: string }).id
            : newId(),
      } as T)
    : undefined;
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
  operation: Operation,
): HousePlan | Failure => {
  const name = String(operation.name ?? "");
  if (!name)
    return failure(
      "invalid_input",
      "level.upsert requires name",
      "Provide a non-empty level name.",
    );
  const elevationCm = operation.elevationCm;
  const order = operation.order;
  if (typeof elevationCm !== "number" || typeof order !== "number")
    return failure(
      "invalid_input",
      "level.upsert requires numeric elevationCm and order",
      "Pass finite numeric centimetres and an integer level order.",
    );
  const previous = named(plan.levels, name);
  const level: Level = {
    id: previous?.id ?? newId(),
    name,
    elevationCm,
    order,
  };
  return {
    ...plan,
    levels: replace(plan.levels, level),
    storeys: previous ? plan.storeys : [...plan.storeys, emptyStorey(level.id)],
  };
};

const resourceKey = (
  kind: string,
):
  | keyof Pick<
      Storey,
      | "walls"
      | "rooms"
      | "openings"
      | "objects"
      | "stairs"
      | "voids"
      | "annotations"
      | "dimensions"
    >
  | undefined =>
  (
    ({
      "wall.upsert": "walls",
      "room.upsert": "rooms",
      "opening.upsert": "openings",
      "object.upsert": "objects",
      "stair.upsert": "stairs",
      "void.upsert": "voids",
      "annotation.upsert": "annotations",
      "dimension.upsert": "dimensions",
    }) as const
  )[kind];

const upsertResource = (
  plan: HousePlan,
  operation: Operation,
  kind: string,
): HousePlan | Failure => {
  const level = named(plan.levels, String(operation.level ?? ""));
  if (!level)
    return failure(
      "not_found",
      `Unknown level '${String(operation.level ?? "")}'`,
      "Create the level first.",
    );
  const key = resourceKey(kind);
  const value = asNamedEntity<Named>(operation.entity);
  if (!key || !value)
    return failure(
      "invalid_input",
      `${kind} requires entity.name`,
      "Use a resource operation from house-plan schema.",
    );
  const source = plan.storeys.find((storey) => storey.levelId === level.id);
  if (!source)
    return failure(
      "internal",
      `Level '${level.name}' has no storey`,
      "Reinitialize the plan.",
    );
  const updated = {
    ...source,
    [key]: replace(source[key] as readonly Named[], value),
  } as Storey;
  return {
    ...plan,
    storeys: plan.storeys.map((storey) =>
      storey.id === updated.id ? updated : storey,
    ),
  };
};

const applyOne = (
  plan: HousePlan,
  operation: Operation,
): HousePlan | Failure => {
  const kind = String(operation.kind ?? "");
  return kind === "level.upsert"
    ? upsertLevel(plan, operation)
    : upsertResource(plan, operation, kind);
};

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
  let candidate = structuredClone(plan) as HousePlan;
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
