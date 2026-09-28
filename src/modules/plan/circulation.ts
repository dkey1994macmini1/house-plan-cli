import { WallSegment } from "./domain-objects.js";
import type { Bounds, Opening, Point, Room, Storey, Wall } from "./model.js";
import { type DerivedFace, DerivedTopology } from "./topology.js";

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
    return this.faces.find((face) =>
      this.pointStrictlyInside(face.bounds, room.seed),
    );
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

  private pointStrictlyInside(bounds: Bounds, point: Point): boolean {
    return (
      point.x > bounds.x &&
      point.x < bounds.x + bounds.width &&
      point.y > bounds.y &&
      point.y < bounds.y + bounds.height
    );
  }

  private faceIndexAt(point: Point): number {
    return this.faces.findIndex((face) =>
      this.pointStrictlyInside(face.bounds, point),
    );
  }

  private sharedEdge(left: Bounds, right: Bounds): SharedEdge | undefined {
    if (left.x + left.width === right.x || right.x + right.width === left.x) {
      const start = Math.max(left.y, right.y);
      const end = Math.min(left.y + left.height, right.y + right.height);
      if (end > start)
        return {
          axis: "x",
          coordinate: left.x + left.width === right.x ? right.x : left.x,
          start,
          end,
        };
    }
    if (left.y + left.height === right.y || right.y + right.height === left.y) {
      const start = Math.max(left.x, right.x);
      const end = Math.min(left.x + left.width, right.x + right.width);
      if (end > start)
        return {
          axis: "y",
          coordinate: left.y + left.height === right.y ? right.y : left.y,
          start,
          end,
        };
    }
    return undefined;
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
        const edge = this.sharedEdge(face.bounds, other.bounds);
        if (!edge) continue;
        const widthCm = this.uncoveredLength(edge);
        if (widthCm > 0)
          links.push({
            kind: "passage",
            widthCm,
            sides: [index, otherIndex],
          });
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
    return this.faces.findIndex(({ bounds }) => {
      if (vertical) {
        const onSide =
          side === "lower"
            ? bounds.x + bounds.width === midpoint.x
            : bounds.x === midpoint.x;
        return (
          onSide &&
          midpoint.y > bounds.y &&
          midpoint.y < bounds.y + bounds.height
        );
      }
      const onSide =
        side === "lower"
          ? bounds.y + bounds.height === midpoint.y
          : bounds.y === midpoint.y;
      return (
        onSide && midpoint.x > bounds.x && midpoint.x < bounds.x + bounds.width
      );
    });
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
