import { WallSegment } from "./domain-objects.js";
import type { Opening, Point, Room, Storey, Wall } from "./model.js";
import {
  type DerivedFace,
  DerivedTopology,
  pointStrictlyInsideFace,
} from "./topology.js";

type SharedEdge = Readonly<{
  axis: "x" | "y";
  coordinate: number;
  start: number;
  end: number;
}>;

type Interval = Readonly<{ start: number; end: number }>;

export type FaceSide = number | "outside";

export type StoreyAccess = Readonly<{
  kind: "door" | "passage";
  widthCm: number;
  opening?: string;
  sides: readonly [FaceSide, FaceSide];
}>;

/** Walkable face graph: doors and physical gaps, never windows or virtual walls. */
export class StoreyCirculation {
  readonly faces: readonly DerivedFace[];
  private readonly outside: number;
  private readonly neighbors: ReadonlyMap<number, ReadonlySet<number>>;

  constructor(readonly storey: Storey) {
    this.faces = new DerivedTopology(storey.walls).faces;
    this.outside = this.faces.length;
    this.neighbors = this.buildGraph();
  }

  hasExit(face: DerivedFace): boolean {
    const index = this.faces.indexOf(face);
    return (this.neighbors.get(index)?.size ?? 0) > 0;
  }

  unreachableRooms(): readonly Room[] {
    const visited = new Set<number>([this.outside]);
    const queue = [this.outside];
    for (const node of queue) {
      for (const neighbor of this.neighbors.get(node) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    return this.storey.rooms.filter((room) => {
      const index = this.faceIndexAt(room.seed);
      return index >= 0 && !visited.has(index);
    });
  }

  faceForRoom(room: Room): DerivedFace | undefined {
    return this.faces.find((face) => pointStrictlyInsideFace(face, room.seed));
  }

  /** Doors and physical gaps that join two faces, or an exterior door to outside. */
  accesses(): readonly StoreyAccess[] {
    return [...this.passageAccesses(), ...this.doorAccesses()];
  }

  /**
   * Faces touched by an opening that fits its host wall.
   * An exterior opening reports the interior face and `"outside"`.
   */
  sidesOf(opening: Opening): readonly [FaceSide, FaceSide] | undefined {
    const wall = this.storey.walls.find(
      (candidate) => candidate.name === opening.wall,
    );
    if (!wall) return undefined;
    const host = new WallSegment(wall);
    if (!host.containsOpening(opening)) return undefined;
    const { start, end } = host.openingEndpoints(opening);
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const lower = this.adjacentFace(wall, midpoint, "lower");
    const upper = this.adjacentFace(wall, midpoint, "upper");
    if (lower >= 0 && upper >= 0) return [lower, upper];
    if (wall.kind === "exterior" && (lower >= 0 || upper >= 0))
      return [Math.max(lower, upper), "outside"];
    return undefined;
  }

  private faceIndexAt(point: Point): number {
    return this.faces.findIndex((face) => pointStrictlyInsideFace(face, point));
  }

  private sharedEdges(
    left: DerivedFace,
    right: DerivedFace,
  ): readonly SharedEdge[] {
    return left.vertices.flatMap<SharedEdge>((start, index) => {
      const end = left.vertices[(index + 1) % left.vertices.length];
      if (!end) return [];
      return right.vertices.flatMap<SharedEdge>((otherStart, otherIndex) => {
        const otherEnd =
          right.vertices[(otherIndex + 1) % right.vertices.length];
        if (!otherEnd) return [];
        if (
          start.x === end.x &&
          otherStart.x === otherEnd.x &&
          start.x === otherStart.x
        ) {
          const intervalStart = Math.max(
            Math.min(start.y, end.y),
            Math.min(otherStart.y, otherEnd.y),
          );
          const intervalEnd = Math.min(
            Math.max(start.y, end.y),
            Math.max(otherStart.y, otherEnd.y),
          );
          return intervalEnd > intervalStart
            ? [
                {
                  axis: "x" as const,
                  coordinate: start.x,
                  start: intervalStart,
                  end: intervalEnd,
                },
              ]
            : [];
        }
        if (
          start.y === end.y &&
          otherStart.y === otherEnd.y &&
          start.y === otherStart.y
        ) {
          const intervalStart = Math.max(
            Math.min(start.x, end.x),
            Math.min(otherStart.x, otherEnd.x),
          );
          const intervalEnd = Math.min(
            Math.max(start.x, end.x),
            Math.max(otherStart.x, otherEnd.x),
          );
          return intervalEnd > intervalStart
            ? [
                {
                  axis: "y" as const,
                  coordinate: start.y,
                  start: intervalStart,
                  end: intervalEnd,
                },
              ]
            : [];
        }
        return [];
      });
    });
  }

  private wallInterval(wall: Wall, edge: SharedEdge): Interval | undefined {
    if (
      edge.axis === "x" &&
      wall.a.x === edge.coordinate &&
      wall.b.x === edge.coordinate
    )
      return {
        start: Math.max(edge.start, Math.min(wall.a.y, wall.b.y)),
        end: Math.min(edge.end, Math.max(wall.a.y, wall.b.y)),
      };
    if (
      edge.axis === "y" &&
      wall.a.y === edge.coordinate &&
      wall.b.y === edge.coordinate
    )
      return {
        start: Math.max(edge.start, Math.min(wall.a.x, wall.b.x)),
        end: Math.min(edge.end, Math.max(wall.a.x, wall.b.x)),
      };
    return undefined;
  }

  private uncoveredLength(edge: SharedEdge): number {
    const intervals = this.storey.walls
      .flatMap((wall) => {
        const interval = this.wallInterval(wall, edge);
        return interval && interval.end > interval.start ? [interval] : [];
      })
      .toSorted((left, right) => left.start - right.start);
    let coveredUntil = edge.start;
    let gap = 0;
    for (const interval of intervals) {
      if (interval.start > coveredUntil) gap += interval.start - coveredUntil;
      coveredUntil = Math.max(coveredUntil, interval.end);
    }
    if (coveredUntil < edge.end) gap += edge.end - coveredUntil;
    return gap;
  }

  private passageAccesses(): readonly StoreyAccess[] {
    const links: StoreyAccess[] = [];
    for (const [index, face] of this.faces.entries()) {
      for (
        let otherIndex = index + 1;
        otherIndex < this.faces.length;
        otherIndex++
      ) {
        const other = this.faces[otherIndex];
        if (!other) continue;
        for (const edge of this.sharedEdges(face, other)) {
          const widthCm = this.uncoveredLength(edge);
          if (widthCm > 0)
            links.push({
              kind: "passage",
              widthCm,
              sides: [index, otherIndex],
            });
        }
      }
    }
    return links;
  }

  private doorAccesses(): readonly StoreyAccess[] {
    return this.storey.openings.flatMap((opening) => {
      if (opening.type !== "door") return [];
      const sides = this.sidesOf(opening);
      return sides
        ? [
            {
              kind: "door" as const,
              widthCm: opening.width,
              opening: opening.name,
              sides,
            },
          ]
        : [];
    });
  }

  private connect(
    graph: Map<number, Set<number>>,
    left: number,
    right: number,
  ): void {
    if (left === right) return;
    graph.get(left)?.add(right);
    graph.get(right)?.add(left);
  }

  private adjacentFace(
    wall: Wall,
    midpoint: Point,
    side: "lower" | "upper",
  ): number {
    const vertical = wall.a.x === wall.b.x;
    const offset = 0.01;
    const point = vertical
      ? {
          x: midpoint.x + (side === "lower" ? -offset : offset),
          y: midpoint.y,
        }
      : {
          x: midpoint.x,
          y: midpoint.y + (side === "lower" ? -offset : offset),
        };
    return this.faces.findIndex((face) => pointStrictlyInsideFace(face, point));
  }

  private buildGraph(): ReadonlyMap<number, ReadonlySet<number>> {
    const graph = new Map<number, Set<number>>(
      Array.from({ length: this.faces.length + 1 }, (_, index) => [
        index,
        new Set<number>(),
      ]),
    );
    for (const access of this.accesses()) {
      const [left, right] = access.sides;
      this.connect(
        graph,
        left === "outside" ? this.outside : left,
        right === "outside" ? this.outside : right,
      );
    }
    return graph;
  }
}
