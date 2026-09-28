import * as JSONSchema from "effect/JSONSchema";
import * as Schema from "effect/Schema";

const isGridCentimetre = (value: number) => Number.isInteger(value * 10);

const GridCentimetre = Schema.Number.pipe(
  Schema.filter((value) =>
    isGridCentimetre(value)
      ? undefined
      : "must be a finite centimetre with at most one decimal place",
  ),
);
const IntegerOrder = Schema.Number.pipe(
  Schema.filter((value) =>
    Number.isInteger(value) ? undefined : "must be an integer",
  ),
);
const Point = Schema.Struct({ x: GridCentimetre, y: GridCentimetre });
const Bounds = Schema.Struct({
  x: GridCentimetre,
  y: GridCentimetre,
  width: GridCentimetre.pipe(Schema.greaterThan(0)),
  height: GridCentimetre.pipe(Schema.greaterThan(0)),
});
const Named = Schema.Struct({ name: Schema.String });

const LevelOperation = Schema.Struct({
  kind: Schema.Literal("level.upsert"),
  name: Schema.String.pipe(Schema.minLength(1)),
  elevationCm: GridCentimetre,
  order: IntegerOrder,
});
const WallOperation = Schema.Struct({
  kind: Schema.Literal("wall.upsert"),
  level: Schema.String.pipe(Schema.minLength(1)),
  entity: Schema.extend(
    Named,
    Schema.Struct({
      a: Point,
      b: Point,
      thickness: GridCentimetre.pipe(Schema.greaterThan(0)),
      kind: Schema.Literal("exterior", "interior"),
    }),
  ),
});
const RoomOperation = Schema.Struct({
  kind: Schema.Literal("room.upsert"),
  level: Schema.String.pipe(Schema.minLength(1)),
  entity: Schema.extend(
    Named,
    Schema.Struct({ type: Schema.String, seed: Point }),
  ),
});
const OpeningOperation = Schema.Struct({
  kind: Schema.Literal("opening.upsert"),
  level: Schema.String.pipe(Schema.minLength(1)),
  entity: Schema.extend(
    Named,
    Schema.Struct({
      wall: Schema.String.pipe(Schema.minLength(1)),
      type: Schema.Literal("door", "window"),
      variant: Schema.String,
      offset: GridCentimetre.pipe(Schema.greaterThan(0)),
      width: GridCentimetre.pipe(Schema.greaterThan(0)),
      hinge: Schema.optionalWith(Schema.Literal("left", "right"), {
        exact: true,
      }),
      swing: Schema.optionalWith(Schema.Literal("in", "out"), { exact: true }),
    }),
  ),
});
const ObjectOperation = Schema.Struct({
  kind: Schema.Literal("object.upsert"),
  level: Schema.String.pipe(Schema.minLength(1)),
  entity: Schema.extend(
    Named,
    Schema.Struct({
      label: Schema.String,
      center: Point,
      width: GridCentimetre.pipe(Schema.greaterThan(0)),
      depth: GridCentimetre.pipe(Schema.greaterThan(0)),
      rotation: Schema.Literal(0, 90, 180, 270),
      clearance: Schema.optionalWith(
        Schema.Struct({
          front: GridCentimetre,
          left: GridCentimetre,
          right: GridCentimetre,
          back: GridCentimetre,
        }),
        { exact: true },
      ),
    }),
  ),
});
const StairOperation = Schema.Struct({
  kind: Schema.Literal("stair.upsert"),
  level: Schema.String.pipe(Schema.minLength(1)),
  entity: Schema.extend(
    Named,
    Schema.Struct({
      run: Schema.String.pipe(Schema.minLength(1)),
      direction: Schema.Literal("up", "down"),
      bounds: Bounds,
    }),
  ),
});
const VoidOperation = Schema.Struct({
  kind: Schema.Literal("void.upsert"),
  level: Schema.String.pipe(Schema.minLength(1)),
  entity: Schema.extend(Named, Schema.Struct({ bounds: Bounds })),
});
const AnnotationOperation = Schema.Struct({
  kind: Schema.Literal("annotation.upsert"),
  level: Schema.String.pipe(Schema.minLength(1)),
  entity: Schema.extend(
    Named,
    Schema.Struct({ text: Schema.String, at: Point }),
  ),
});
const DimensionOperation = Schema.Struct({
  kind: Schema.Literal("dimension.upsert"),
  level: Schema.String.pipe(Schema.minLength(1)),
  entity: Schema.extend(
    Named,
    Schema.Struct({
      a: Point,
      b: Point,
      offset: GridCentimetre,
    }),
  ),
});

export const OperationSchema = Schema.Union(
  LevelOperation,
  WallOperation,
  RoomOperation,
  OpeningOperation,
  ObjectOperation,
  StairOperation,
  VoidOperation,
  AnnotationOperation,
  DimensionOperation,
).annotations({
  identifier: "HousePlanOperation",
  title: "HousePlan operation",
});

export const OperationListSchema = Schema.Array(OperationSchema).annotations({
  identifier: "HousePlanOperationList",
  title: "HousePlan operation document",
});
export type OperationList = Schema.Schema.Type<typeof OperationListSchema>;

export const decodeOperations = Schema.decodeUnknownEither(OperationListSchema);

export const operationJsonSchema = (): JSONSchema.JsonSchema7Root =>
  JSONSchema.make(OperationListSchema, { target: "jsonSchema7" });
