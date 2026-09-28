import * as JSONSchema from "effect/JSONSchema";
import * as Schema from "effect/Schema";

const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number });
const Bounds = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
});
const Named = Schema.Struct({ name: Schema.String });
const Wall = Schema.extend(
  Named,
  Schema.Struct({
    a: Point,
    b: Point,
    thickness: Schema.Number,
    kind: Schema.Literal("exterior", "interior"),
  }),
);
const Room = Schema.extend(
  Named,
  Schema.Struct({ type: Schema.String, seed: Point }),
);
const Opening = Schema.extend(
  Named,
  Schema.Struct({
    wall: Schema.String,
    type: Schema.Literal("door", "window"),
    variant: Schema.String,
    offset: Schema.Number,
    width: Schema.Number,
    hinge: Schema.optional(Schema.Literal("left", "right")),
    swing: Schema.optional(Schema.Literal("in", "out")),
  }),
);
const ObjectBox = Schema.extend(
  Named,
  Schema.Struct({
    label: Schema.String,
    center: Point,
    width: Schema.Number,
    depth: Schema.Number,
    rotation: Schema.Literal(0, 90, 180, 270),
    clearance: Schema.optional(
      Schema.Struct({
        front: Schema.Number,
        left: Schema.Number,
        right: Schema.Number,
        back: Schema.Number,
      }),
    ),
  }),
);
const Stair = Schema.extend(
  Named,
  Schema.Struct({
    run: Schema.String,
    direction: Schema.Literal("up", "down"),
    bounds: Bounds,
  }),
);
const Void = Schema.extend(Named, Schema.Struct({ bounds: Bounds }));
const Annotation = Schema.extend(
  Named,
  Schema.Struct({ text: Schema.String, at: Point }),
);
const Dimension = Schema.extend(
  Named,
  Schema.Struct({ a: Point, b: Point, offset: Schema.Number }),
);

export const OperationSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("level.upsert"),
    name: Schema.String,
    elevationCm: Schema.Number,
    order: Schema.Number,
  }),
  Schema.Struct({
    kind: Schema.Literal("wall.upsert"),
    level: Schema.String,
    entity: Wall,
  }),
  Schema.Struct({
    kind: Schema.Literal("room.upsert"),
    level: Schema.String,
    entity: Room,
  }),
  Schema.Struct({
    kind: Schema.Literal("opening.upsert"),
    level: Schema.String,
    entity: Opening,
  }),
  Schema.Struct({
    kind: Schema.Literal("object.upsert"),
    level: Schema.String,
    entity: ObjectBox,
  }),
  Schema.Struct({
    kind: Schema.Literal("stair.upsert"),
    level: Schema.String,
    entity: Stair,
  }),
  Schema.Struct({
    kind: Schema.Literal("void.upsert"),
    level: Schema.String,
    entity: Void,
  }),
  Schema.Struct({
    kind: Schema.Literal("annotation.upsert"),
    level: Schema.String,
    entity: Annotation,
  }),
  Schema.Struct({
    kind: Schema.Literal("dimension.upsert"),
    level: Schema.String,
    entity: Dimension,
  }),
).annotations({
  identifier: "HousePlanOperation",
  title: "HousePlan operation",
});

export const OperationListSchema = Schema.Array(OperationSchema).annotations({
  identifier: "HousePlanOperationList",
  title: "HousePlan operation document",
});
export const decodeOperations = Schema.decodeUnknownEither(OperationListSchema);
const hasOnlyGridNumbers = (value: unknown): boolean => {
  if (typeof value === "number") return Number.isInteger(value * 10);
  if (Array.isArray(value)) return value.every(hasOnlyGridNumbers);
  return (
    !value ||
    typeof value !== "object" ||
    Object.values(value).every(hasOnlyGridNumbers)
  );
};

export const hasGridMeasurements = (
  operations: readonly Record<string, unknown>[],
): boolean => operations.every(hasOnlyGridNumbers);

export const hasValidLevelOrders = (
  operations: readonly Record<string, unknown>[],
): boolean =>
  operations.every(
    (operation) =>
      operation.kind !== "level.upsert" || Number.isInteger(operation.order),
  );

export const operationJsonSchema = (): JSONSchema.JsonSchema7Root =>
  JSONSchema.make(OperationListSchema, { target: "jsonSchema7" });
