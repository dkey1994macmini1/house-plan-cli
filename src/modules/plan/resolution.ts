import type {
  HousePlan,
  ResolvedPlan,
  ResolvedStorey,
  Storey,
} from "./model.js";
import { boundsFromPoints, DerivedTopology } from "./topology.js";

const resolveStorey = (storey: Storey): ResolvedStorey => {
  const topology = new DerivedTopology(storey.walls);
  const rooms = storey.rooms.flatMap((room) => {
    const face = topology.faceContaining(room.seed);
    return face
      ? [
          {
            ...room,
            bounds: face.bounds,
            areaCm2: face.bounds.width * face.bounds.height,
            perimeterCm: 2 * (face.bounds.width + face.bounds.height),
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
