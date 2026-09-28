import { StoreyCirculation } from "./circulation.js";
import { StairOccurrence } from "./domain-objects.js";
import type {
  Bounds,
  HousePlan,
  Level,
  ObjectBox,
  Opening,
  Point,
  Room,
  Stair,
  Storey,
  Void,
} from "./model.js";
import {
  type ConnectingStairRun,
  connectingStairRuns,
  type StairLanding,
} from "./stair-runs.js";
import {
  boundsFromPoints,
  type DerivedFace,
  pointStrictlyInsideFace,
  polygonAreaCm2,
} from "./topology.js";

export type SurveyOpening = Readonly<{
  name: string;
  widthCm: number;
  wall: string;
  variant: string;
}>;

export type SurveyObject = Readonly<{
  name: string;
  label: string;
  widthCm: number;
  depthCm: number;
  rotation: 0 | 90 | 180 | 270;
}>;

export type SurveyConnection = Readonly<{
  kind: "door" | "passage" | "stair";
  widthCm: number;
  opening?: string;
  sides: readonly [readonly string[], readonly string[]];
}>;

export type SurveyRoom = Readonly<{
  name: string;
  type: string;
  faceId: string | null;
  widthCm: number | null;
  depthCm: number | null;
  areaCm2: number | null;
  exteriorDoors: readonly SurveyOpening[];
  windows: readonly SurveyOpening[];
  objects: readonly SurveyObject[];
}>;

export type SurveyFace = Readonly<{
  id: string;
  bounds: Bounds;
  areaCm2: number;
  rooms: readonly string[];
  vertices?: readonly Point[];
}>;

export type SurveyStair = Readonly<{
  name: string;
  run: string;
  direction: "up" | "down";
  bounds: Bounds;
}>;

export type SurveyVoid = Readonly<{
  name: string;
  bounds: Bounds;
}>;

export type SurveyLevel = Readonly<{
  name: string;
  elevationCm: number;
  order: number;
  bounds: Bounds;
  faceAreaCm2: number;
  roomClaimAreaCm2: number;
  faces: readonly SurveyFace[];
  rooms: readonly SurveyRoom[];
  connections: readonly SurveyConnection[];
  objectsOutsideRooms: readonly SurveyObject[];
  stairs: readonly SurveyStair[];
  voids: readonly SurveyVoid[];
}>;

export type PlanSurvey = Readonly<{
  revision: number;
  levels: readonly SurveyLevel[];
}>;

const emptyBounds: Bounds = { x: 0, y: 0, width: 0, height: 0 };

const isRectangularFace = (face: DerivedFace): boolean =>
  face.vertices.length === 4;

const faceId = (face: DerivedFace): string =>
  isRectangularFace(face)
    ? `${face.bounds.x},${face.bounds.y},${face.bounds.width},${face.bounds.height}`
    : `polygon:${face.vertices.map((point) => `${point.x},${point.y}`).join(";")}`;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const byName = (
  left: { readonly name: string },
  right: { readonly name: string },
) => compareText(left.name, right.name);

const openingReading = (opening: Opening): SurveyOpening => ({
  name: opening.name,
  widthCm: opening.width,
  wall: opening.wall,
  variant: opening.variant,
});

const objectReading = (object: ObjectBox): SurveyObject => ({
  name: object.name,
  label: object.label,
  widthCm: object.width,
  depthCm: object.depth,
  rotation: object.rotation,
});

const stairReading = (stair: Stair): SurveyStair => ({
  name: stair.name,
  run: stair.run,
  direction: stair.direction,
  bounds: stair.bounds,
});

const voidReading = (voidItem: Void): SurveyVoid => ({
  name: voidItem.name,
  bounds: voidItem.bounds,
});

const connectionOrder = (connection: SurveyConnection): string =>
  [
    connection.kind,
    connection.opening ?? "",
    connection.sides.map((side) => side.join(",")).join("/"),
  ].join("|");

const orderedSides = (
  left: readonly string[],
  right: readonly string[],
): readonly [readonly string[], readonly string[]] => {
  const pair = [left, right].toSorted((first, second) =>
    compareText(first.join("\0"), second.join("\0")),
  );
  const [first, second] = pair;
  if (!first || !second) return [[], []];
  return [first, second];
};

const surveyStorey = (level: Level, storey: Storey): SurveyLevel => {
  const circulation = new StoreyCirculation(storey);
  const faces = circulation.faces;
  const roomsOnFace = (index: number): readonly Room[] => {
    const face = faces[index];
    if (!face) return [];
    return storey.rooms
      .filter((room) => pointStrictlyInsideFace(face, room.seed))
      .toSorted(byName);
  };
  const sideLabels = (side: number | "outside"): readonly string[] => {
    if (side === "outside") return ["outside"];
    const face = faces[side];
    if (!face) return [];
    const names = roomsOnFace(side).map((room) => room.name);
    return names.length > 0 ? names : [`face:${faceId(face)}`];
  };
  const faceIndexAt = (point: Point): number =>
    faces.findIndex((face) => pointStrictlyInsideFace(face, point));
  const openingsTouching = (
    accept: (
      opening: Opening,
      sides: readonly (number | "outside")[],
    ) => boolean,
  ): readonly SurveyOpening[] =>
    storey.openings
      .flatMap((opening) => {
        const sides = circulation.sidesOf(opening);
        return sides && accept(opening, sides) ? [openingReading(opening)] : [];
      })
      .toSorted(byName);

  const surveyedFaces: readonly SurveyFace[] = faces.map((face, index) => ({
    id: faceId(face),
    bounds: face.bounds,
    areaCm2: polygonAreaCm2(face.vertices),
    rooms: roomsOnFace(index).map((room) => room.name),
    ...(isRectangularFace(face) ? {} : { vertices: face.vertices }),
  }));
  const rooms: readonly SurveyRoom[] = storey.rooms
    .toSorted(byName)
    .map((room) => {
      const index = faceIndexAt(room.seed);
      const face = index >= 0 ? faces[index] : undefined;
      return {
        name: room.name,
        type: room.type,
        faceId: face ? faceId(face) : null,
        widthCm: face ? face.bounds.width : null,
        depthCm: face ? face.bounds.height : null,
        areaCm2: face ? polygonAreaCm2(face.vertices) : null,
        exteriorDoors:
          index >= 0
            ? openingsTouching(
                (opening, sides) =>
                  opening.type === "door" &&
                  sides.includes("outside") &&
                  sides.includes(index),
              )
            : [],
        windows:
          index >= 0
            ? openingsTouching(
                (opening, sides) =>
                  opening.type === "window" && sides.includes(index),
              )
            : [],
        objects: storey.objects
          .filter(
            (object) => index >= 0 && faceIndexAt(object.center) === index,
          )
          .map(objectReading)
          .toSorted(byName),
      };
    });
  const connections: readonly SurveyConnection[] = circulation
    .accesses()
    .map((access) => {
      const [left, right] = access.sides;
      const connection: SurveyConnection = {
        kind: access.kind,
        widthCm: access.widthCm,
        ...(access.opening === undefined ? {} : { opening: access.opening }),
        sides: orderedSides(sideLabels(left), sideLabels(right)),
      };
      return connection;
    })
    .toSorted((left, right) =>
      compareText(connectionOrder(left), connectionOrder(right)),
    );

  return {
    name: level.name,
    elevationCm: level.elevationCm,
    order: level.order,
    bounds:
      boundsFromPoints(faces.flatMap((face) => face.vertices)) ?? emptyBounds,
    faceAreaCm2: surveyedFaces.reduce((sum, face) => sum + face.areaCm2, 0),
    roomClaimAreaCm2: rooms.reduce((sum, room) => sum + (room.areaCm2 ?? 0), 0),
    faces: surveyedFaces,
    rooms,
    connections,
    objectsOutsideRooms: storey.objects
      .filter((object) => faceIndexAt(object.center) < 0)
      .map(objectReading)
      .toSorted(byName),
    stairs: storey.stairs.map(stairReading).toSorted(byName),
    voids: storey.voids.map(voidReading).toSorted(byName),
  };
};

const emptyLevel = (level: Level): SurveyLevel => ({
  name: level.name,
  elevationCm: level.elevationCm,
  order: level.order,
  bounds: emptyBounds,
  faceAreaCm2: 0,
  roomClaimAreaCm2: 0,
  faces: [],
  rooms: [],
  connections: [],
  objectsOutsideRooms: [],
  stairs: [],
  voids: [],
});

/** `level:room` labels of the rooms a stair lands in; `level:face:<id>` when the face has no room. */
const landingLabels = (landing: StairLanding): readonly string[] => {
  const center = new StairOccurrence(landing.stair).center;
  const face = new StoreyCirculation(landing.storey).faces.find((candidate) =>
    pointStrictlyInsideFace(candidate, center),
  );
  if (!face) return [`${landing.level.name}:${landing.stair.name}`];
  const rooms = landing.storey.rooms
    .filter((room) => pointStrictlyInsideFace(face, room.seed))
    .toSorted(byName)
    .map((room) => `${landing.level.name}:${room.name}`);
  return rooms.length > 0
    ? rooms
    : [`${landing.level.name}:face:${faceId(face)}`];
};

const stairConnection = (run: ConnectingStairRun): SurveyConnection => ({
  kind: "stair",
  widthCm: run.lower.stair.bounds.width,
  opening: run.run,
  sides: orderedSides(landingLabels(run.lower), landingLabels(run.upper)),
});

const withStairConnections = (
  plan: HousePlan,
  levels: readonly SurveyLevel[],
): readonly SurveyLevel[] => {
  const runs = connectingStairRuns(plan);
  return levels.map((level) => ({
    ...level,
    connections: [
      ...level.connections,
      ...runs
        .filter(
          ({ lower, upper }) =>
            lower.level.name === level.name || upper.level.name === level.name,
        )
        .map(stairConnection),
    ].toSorted((left, right) =>
      compareText(connectionOrder(left), connectionOrder(right)),
    ),
  }));
};

/** Compact spatial reading of a plan. Does not validate or modify it. */
export const surveyPlan = (plan: HousePlan): PlanSurvey => {
  const levels = plan.levels
    .toSorted((left, right) => left.order - right.order)
    .map((level) => {
      const storey = plan.storeys.find(
        (candidate) => candidate.levelId === level.id,
      );
      return storey ? surveyStorey(level, storey) : emptyLevel(level);
    });
  return {
    revision: plan.revision,
    levels: withStairConnections(plan, levels),
  };
};
