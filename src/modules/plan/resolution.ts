import type {
  HousePlan,
  ResolvedPlan,
  ResolvedStorey,
  Storey,
} from "./model.js";
import {
  boundsFromPoints,
  DerivedTopology,
  polygonAreaCm2,
} from "./topology.js";

const polygonPerimeterCm = (
  vertices: readonly Readonly<{ x: number; y: number }>[],
): number =>
  vertices.reduce((perimeter, point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return next
      ? perimeter + Math.abs(next.x - point.x) + Math.abs(next.y - point.y)
      : perimeter;
  }, 0);

const resolveStorey = (storey: Storey): ResolvedStorey => {
  const topology = new DerivedTopology(storey.walls);
  const rooms = storey.rooms.flatMap((room) => {
    const face = topology.faceContaining(room.seed);
    return face
      ? [
          {
            ...room,
            bounds: face.bounds,
            areaCm2: polygonAreaCm2(face.vertices),
            perimeterCm: polygonPerimeterCm(face.vertices),
            face: face.vertices,
          },
        ]
      : [];
  });
  const bounds = boundsFromPoints(
    topology.faces.flatMap((face) => face.vertices),
  ) ?? {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
  return { ...storey, bounds, rooms };
};

export const resolvePlan = (plan: HousePlan): ResolvedPlan => ({
  ...plan,
  storeys: plan.storeys.map(resolveStorey),
});
