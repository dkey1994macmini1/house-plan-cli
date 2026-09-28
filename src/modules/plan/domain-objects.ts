import {
  boundsFromCenter,
  boundsOverlap,
  containsBounds,
  containsPoint,
  isGridCentimetre,
  sameBounds,
  wallLength,
} from "./geometry.js";
import type {
  Bounds,
  ObjectBox,
  Opening,
  Point,
  Stair,
  Wall,
} from "./model.js";

/** Domain object: owns wall invariants and host-coordinate behavior. */
export class WallSegment {
  constructor(readonly value: Wall) {}

  get lengthCm(): number {
    return wallLength(this.value);
  }
  get occupiedBounds(): Bounds {
    const { a, b, thickness } = this.value;
    const half = thickness / 2;
    return {
      x: Math.min(a.x, b.x) - half,
      y: Math.min(a.y, b.y) - half,
      width: Math.abs(a.x - b.x) + thickness,
      height: Math.abs(a.y - b.y) + thickness,
    };
  }
  intersects(bounds: Bounds): boolean {
    return boundsOverlap(this.occupiedBounds, bounds);
  }
  get isOrthogonal(): boolean {
    return (
      this.value.a.x === this.value.b.x || this.value.a.y === this.value.b.y
    );
  }
  get hasValidMeasurements(): boolean {
    const { a, b, thickness } = this.value;
    return (
      [a.x, a.y, b.x, b.y, thickness].every(isGridCentimetre) && thickness > 0
    );
  }
  containsOpening(opening: Opening): boolean {
    return (
      opening.offset > 0 &&
      opening.width > 0 &&
      opening.offset + opening.width < this.lengthCm
    );
  }
  overlaps(left: Opening, right: Opening): boolean {
    return (
      left.wall === this.value.name &&
      right.wall === this.value.name &&
      left.offset < right.offset + right.width &&
      right.offset < left.offset + left.width
    );
  }
  doorGeometry(
    opening: Opening,
  ):
    | Readonly<{ hinge: Point; closedLeaf: Point; openLeaf: Point }>
    | undefined {
    if (opening.type !== "door" || opening.variant === "sliding")
      return undefined;
    const { start, end } = this.openingEndpoints(opening);
    const hinge = opening.hinge === "right" ? end : start;
    const closedLeaf = opening.hinge === "right" ? start : end;
    const horizontal = this.value.a.y === this.value.b.y;
    const normalDirection = opening.swing === "out" ? -1 : 1;
    return {
      hinge,
      closedLeaf,
      openLeaf: horizontal
        ? { x: hinge.x, y: hinge.y + normalDirection * opening.width }
        : { x: hinge.x - normalDirection * opening.width, y: hinge.y },
    };
  }

  /** Clear depth equal to the doorway width on both sides of its threshold. */
  doorApproachBounds(opening: Opening): Bounds | undefined {
    if (opening.type !== "door" || !this.containsOpening(opening))
      return undefined;
    const { start, end } = this.openingEndpoints(opening);
    if (this.value.a.y === this.value.b.y)
      return {
        x: Math.min(start.x, end.x),
        y: start.y - opening.width,
        width: opening.width,
        height: opening.width * 2,
      };
    return {
      x: start.x - opening.width,
      y: Math.min(start.y, end.y),
      width: opening.width * 2,
      height: opening.width,
    };
  }
  doorSwingBounds(opening: Opening): Bounds | undefined {
    const geometry = this.doorGeometry(opening);
    if (!geometry) return undefined;
    const points = [geometry.hinge, geometry.closedLeaf, geometry.openLeaf];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      x,
      y,
      width: Math.max(...xs) - x,
      height: Math.max(...ys) - y,
    };
  }

  openingEndpoints(opening: Opening): Readonly<{ start: Point; end: Point }> {
    const horizontal = this.value.a.y === this.value.b.y;
    const direction = horizontal
      ? Math.sign(this.value.b.x - this.value.a.x)
      : Math.sign(this.value.b.y - this.value.a.y);
    const start = horizontal
      ? { x: this.value.a.x + direction * opening.offset, y: this.value.a.y }
      : { x: this.value.a.x, y: this.value.a.y + direction * opening.offset };
    return {
      start,
      end: horizontal
        ? { x: start.x + direction * opening.width, y: start.y }
        : { x: start.x, y: start.y + direction * opening.width },
    };
  }
}

/** Domain object: owns object bounds and collision behavior. */
export class PlanObject {
  constructor(readonly value: ObjectBox) {}

  get bounds(): Bounds {
    const rotated = this.value.rotation === 90 || this.value.rotation === 270;
    return boundsFromCenter(
      this.value.center,
      rotated ? this.value.depth : this.value.width,
      rotated ? this.value.width : this.value.depth,
    );
  }
  get hasValidBounds(): boolean {
    const { center, width, depth } = this.value;
    return (
      [center.x, center.y, width, depth].every(isGridCentimetre) &&
      width > 0 &&
      depth > 0
    );
  }
  get clearanceBounds(): Bounds | undefined {
    const clearance = this.value.clearance;
    if (!clearance) return undefined;
    const { front, back, left, right } = clearance;
    const localX = (right - left) / 2;
    const localY = (front - back) / 2;
    const width = this.value.width + left + right;
    const height = this.value.depth + front + back;
    const { x, y } = this.value.center;
    const centers: Record<ObjectBox["rotation"], Point> = {
      0: { x: x + localX, y: y + localY },
      90: { x: x - localY, y: y + localX },
      180: { x: x - localX, y: y - localY },
      270: { x: x + localY, y: y - localX },
    };
    const rotated = this.value.rotation === 90 || this.value.rotation === 270;
    return boundsFromCenter(
      centers[this.value.rotation],
      rotated ? height : width,
      rotated ? width : height,
    );
  }
  get hasValidClearance(): boolean {
    const clearance = this.value.clearance;
    return (
      !clearance ||
      Object.values(clearance).every(
        (value) => isGridCentimetre(value) && value >= 0,
      )
    );
  }
  clearanceOverlaps(bounds: Bounds): boolean {
    const clearance = this.clearanceBounds;
    return clearance !== undefined && boundsOverlap(clearance, bounds);
  }
  collidesWith(other: PlanObject): boolean {
    return boundsOverlap(this.bounds, other.bounds);
  }
}

/** Domain object: owns cross-storey stair matching behavior. */
export class StairOccurrence {
  constructor(readonly value: Stair) {}

  obstructsDoorApproach(approach: Bounds): boolean {
    return boundsOverlap(this.value.bounds, approach);
  }
  matchesCounterpart(other: StairOccurrence): boolean {
    return (
      this.value.run === other.value.run &&
      sameBounds(this.value.bounds, other.value.bounds)
    );
  }

  isContainedBy(voidBounds: Bounds): boolean {
    return containsBounds(voidBounds, this.value.bounds);
  }

  /** The point that decides which derived face a stair lands in. */
  get center(): Point {
    const { x, y, width, height } = this.value.bounds;
    return { x: x + width / 2, y: y + height / 2 };
  }

  footprintOffsetCm(other: StairOccurrence): number {
    const left = this.value.bounds;
    const right = other.value.bounds;
    return (
      Math.abs(left.x - right.x) +
      Math.abs(left.y - right.y) +
      Math.abs(left.width - right.width) +
      Math.abs(left.height - right.height)
    );
  }
}

/** Domain object: owns room seed-to-face matching behavior. */
export class RoomSeed {
  constructor(readonly point: Point) {}
  belongsTo(face: Bounds | undefined): boolean {
    return face !== undefined && containsPoint(face, this.point);
  }
}
