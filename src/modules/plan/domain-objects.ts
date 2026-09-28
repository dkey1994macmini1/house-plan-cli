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
      opening.offset >= 0 &&
      opening.width > 0 &&
      opening.offset + opening.width <= this.lengthCm
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
  doorSwingBounds(opening: Opening): Bounds | undefined {
    if (opening.type !== "door" || opening.variant === "sliding")
      return undefined;
    const { start, end } = this.openingEndpoints(opening);
    const hinge = opening.hinge === "right" ? end : start;
    const horizontal = this.value.a.y === this.value.b.y;
    const sign = opening.swing === "out" ? -1 : 1;
    return horizontal
      ? {
          x: Math.min(start.x, end.x),
          y: hinge.y + Math.min(0, sign * opening.width),
          width: opening.width,
          height: opening.width,
        }
      : {
          x: hinge.x + Math.min(0, sign * opening.width),
          y: Math.min(start.y, end.y),
          width: opening.width,
          height: opening.width,
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
    return boundsFromCenter(
      this.value.center,
      this.value.width,
      this.value.depth,
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
    return {
      x: this.bounds.x - left,
      y: this.bounds.y - back,
      width: this.bounds.width + left + right,
      height: this.bounds.height + front + back,
    };
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

  matchesCounterpart(other: StairOccurrence): boolean {
    return (
      this.value.run === other.value.run &&
      sameBounds(this.value.bounds, other.value.bounds)
    );
  }

  isContainedBy(voidBounds: Bounds): boolean {
    return containsBounds(voidBounds, this.value.bounds);
  }
}

/** Domain object: owns room seed-to-face matching behavior. */
export class RoomSeed {
  constructor(readonly point: Point) {}
  belongsTo(face: Bounds | undefined): boolean {
    return face !== undefined && containsPoint(face, this.point);
  }
}
