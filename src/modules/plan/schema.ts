import * as Either from "effect/Either";
import * as JSONSchema from "effect/JSONSchema";
import * as Schema from "effect/Schema";
import type { HousePlan } from "./model.js";

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
const ResourceRemoveOperation = Schema.Struct({
  kind: Schema.Literal(
    "wall.remove",
    "room.remove",
    "opening.remove",
    "object.remove",
    "stair.remove",
    "void.remove",
    "annotation.remove",
    "dimension.remove",
  ),
  level: Schema.String.pipe(Schema.minLength(1)),
  name: Schema.String.pipe(Schema.minLength(1)),
});
const LevelRemoveOperation = Schema.Struct({
  kind: Schema.Literal("level.remove"),
  name: Schema.String.pipe(Schema.minLength(1)),
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
  ResourceRemoveOperation,
  LevelRemoveOperation,
).annotations({
  identifier: "HousePlanOperation",
  title: "HousePlan operation",
});

export const operationKinds: readonly string[] =
  OperationSchema.members.flatMap((member) => member.fields.kind.literals);

export const OperationListSchema = Schema.Array(OperationSchema).annotations({
  identifier: "HousePlanOperationList",
  title: "HousePlan operation document",
});
export type OperationList = Schema.Schema.Type<typeof OperationListSchema>;

export const decodeOperations = Schema.decodeUnknownEither(OperationListSchema);

export const validateOpeningVariants = (
  operations: readonly OperationList[number][],
): string | undefined => {
  for (const operation of operations) {
    if (operation.kind !== "opening.upsert") continue;
    const { type, variant, hinge, swing } = operation.entity;
    const validVariant =
      type === "door"
        ? ["single", "double", "sliding"].includes(variant)
        : ["fixed", "casement", "tilt-turn", "sliding"].includes(variant);
    if (!validVariant)
      return `Opening '${operation.entity.name}' has unsupported ${type} variant '${variant}'`;
    const hinged = type === "door" && variant !== "sliding";
    if (hinged && (!hinge || !swing))
      return `Hinged door '${operation.entity.name}' requires hinge and swing`;
    if (!hinged && (hinge || swing))
      return `Opening '${operation.entity.name}' cannot have hinge or swing`;
  }
  return undefined;
};

export const operationJsonSchema = (): JSONSchema.JsonSchema7Root =>
  JSONSchema.make(OperationListSchema, { target: "jsonSchema7" });

const Identifier = Schema.String.pipe(Schema.minLength(1));
const PersistedNamed = Schema.Struct({ id: Identifier, name: Identifier });
const PersistedPoint = Schema.Struct({ x: GridCentimetre, y: GridCentimetre });
const PersistedBounds = Schema.Struct({
  x: GridCentimetre,
  y: GridCentimetre,
  width: GridCentimetre.pipe(Schema.greaterThan(0)),
  height: GridCentimetre.pipe(Schema.greaterThan(0)),
});
const PersistedWall = Schema.extend(
  PersistedNamed,
  Schema.Struct({
    a: PersistedPoint,
    b: PersistedPoint,
    thickness: GridCentimetre.pipe(Schema.greaterThan(0)),
    kind: Schema.Literal("exterior", "interior"),
  }),
);
const PersistedRoom = Schema.extend(
  PersistedNamed,
  Schema.Struct({ type: Schema.String, seed: PersistedPoint }),
);
const PersistedOpening = Schema.extend(
  PersistedNamed,
  Schema.Struct({
    wall: Identifier,
    type: Schema.Literal("door", "window"),
    variant: Schema.String,
    offset: GridCentimetre.pipe(Schema.greaterThan(0)),
    width: GridCentimetre.pipe(Schema.greaterThan(0)),
    hinge: Schema.optionalWith(Schema.Literal("left", "right"), {
      exact: true,
    }),
    swing: Schema.optionalWith(Schema.Literal("in", "out"), { exact: true }),
  }),
);
const PersistedObject = Schema.extend(
  PersistedNamed,
  Schema.Struct({
    label: Schema.String,
    center: PersistedPoint,
    width: GridCentimetre.pipe(Schema.greaterThan(0)),
    depth: GridCentimetre.pipe(Schema.greaterThan(0)),
    rotation: Schema.Literal(0, 90, 180, 270),
    clearance: Schema.optionalWith(
      Schema.Struct({
        front: GridCentimetre.pipe(Schema.greaterThanOrEqualTo(0)),
        left: GridCentimetre.pipe(Schema.greaterThanOrEqualTo(0)),
        right: GridCentimetre.pipe(Schema.greaterThanOrEqualTo(0)),
        back: GridCentimetre.pipe(Schema.greaterThanOrEqualTo(0)),
      }),
      { exact: true },
    ),
  }),
);
const PersistedStair = Schema.extend(
  PersistedNamed,
  Schema.Struct({
    run: Identifier,
    direction: Schema.Literal("up", "down"),
    bounds: PersistedBounds,
  }),
);
const PersistedVoid = Schema.extend(
  PersistedNamed,
  Schema.Struct({ bounds: PersistedBounds }),
);
const PersistedAnnotation = Schema.extend(
  PersistedNamed,
  Schema.Struct({ text: Schema.String, at: PersistedPoint }),
);
const PersistedDimension = Schema.extend(
  PersistedNamed,
  Schema.Struct({
    a: PersistedPoint,
    b: PersistedPoint,
    offset: GridCentimetre,
  }),
);
const PersistedStorey = Schema.Struct({
  id: Identifier,
  levelId: Identifier,
  walls: Schema.Array(PersistedWall),
  rooms: Schema.Array(PersistedRoom),
  openings: Schema.Array(PersistedOpening),
  objects: Schema.Array(PersistedObject),
  stairs: Schema.Array(PersistedStair),
  voids: Schema.Array(PersistedVoid),
  annotations: Schema.Array(PersistedAnnotation),
  dimensions: Schema.Array(PersistedDimension),
});
const PersistedLevel = Schema.extend(
  PersistedNamed,
  Schema.Struct({
    elevationCm: GridCentimetre,
    order: IntegerOrder,
  }),
);
export const HousePlanSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  revision: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  levels: Schema.Array(PersistedLevel),
  storeys: Schema.Array(PersistedStorey),
});

export const decodeHousePlan = (input: unknown): HousePlan => {
  const decoded = Schema.decodeUnknownEither(HousePlanSchema)(input);
  if (Either.isLeft(decoded)) throw new Error(String(decoded.left));
  return decoded.right as HousePlan;
};
