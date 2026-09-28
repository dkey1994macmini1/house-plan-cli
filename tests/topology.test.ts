import { describe, expect, it } from "vitest";
import type { Wall } from "../src/modules/plan/model.js";
import {
  DerivedTopology,
  danglingWallEndpoints,
  deriveSplitSegments,
  extractOrthogonalFaces,
  faceContainingPoint,
} from "../src/modules/plan/topology.js";

const wall = (
  name: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
): Wall => ({ id: name, name, a, b, thickness: 20, kind: "interior" });

describe("derived orthogonal topology", () => {
  it("derives one L-shaped face with its polygon area and seed", () => {
    const walls = [
      wall("south", { x: 0, y: 0 }, { x: 600, y: 0 }),
      wall("east-lower", { x: 600, y: 0 }, { x: 600, y: 200 }),
      wall("notch-south", { x: 600, y: 200 }, { x: 300, y: 200 }),
      wall("notch-west", { x: 300, y: 200 }, { x: 300, y: 400 }),
      wall("north", { x: 300, y: 400 }, { x: 0, y: 400 }),
      wall("west", { x: 0, y: 400 }, { x: 0, y: 0 }),
    ];

    const faces = extractOrthogonalFaces(walls);

    expect(faces).toEqual([
      {
        bounds: { x: 0, y: 0, width: 600, height: 400 },
        vertices: [
          { x: 0, y: 0 },
          { x: 600, y: 0 },
          { x: 600, y: 200 },
          { x: 300, y: 200 },
          { x: 300, y: 400 },
          { x: 0, y: 400 },
        ],
      },
    ]);
    expect(faceContainingPoint(faces, { x: 100, y: 300 })).toBe(faces[0]);
    expect(
      new DerivedTopology(walls).hasFaceBoundaryAt({ x: 600, y: 300 }),
    ).toBe(false);
  });

  it("keeps a rectangular face's bounds and vertices stable", () => {
    const faces = extractOrthogonalFaces([
      wall("south", { x: 0, y: 0 }, { x: 600, y: 0 }),
      wall("east", { x: 600, y: 0 }, { x: 600, y: 400 }),
      wall("north", { x: 600, y: 400 }, { x: 0, y: 400 }),
      wall("west", { x: 0, y: 400 }, { x: 0, y: 0 }),
    ]);

    expect(faces).toEqual([
      {
        bounds: { x: 0, y: 0, width: 600, height: 400 },
        vertices: [
          { x: 0, y: 0 },
          { x: 600, y: 0 },
          { x: 600, y: 400 },
          { x: 0, y: 400 },
        ],
      },
    ]);
  });

  it("virtually splits a crossing wall graph without modifying source walls", () => {
    const horizontal = wall("horizontal", { x: 0, y: 100 }, { x: 200, y: 100 });
    const vertical = wall("vertical", { x: 100, y: 0 }, { x: 100, y: 200 });
    expect(deriveSplitSegments([horizontal, vertical])).toHaveLength(4);
    expect(horizontal).toEqual(
      wall("horizontal", { x: 0, y: 100 }, { x: 200, y: 100 }),
    );
  });

  it("extracts maximal faces from partial partitions in the reference layout", () => {
    const walls = [
      wall("north", { x: 0, y: 1100 }, { x: 900, y: 1100 }),
      wall("south", { x: 0, y: 0 }, { x: 900, y: 0 }),
      wall("west", { x: 0, y: 0 }, { x: 0, y: 1100 }),
      wall("east", { x: 900, y: 0 }, { x: 900, y: 1100 }),
      wall("kitchen-south", { x: 0, y: 800 }, { x: 600, y: 800 }),
      wall("dining-living", { x: 600, y: 200 }, { x: 600, y: 1100 }),
      wall("bedroom-row", { x: 0, y: 500 }, { x: 600, y: 500 }),
      wall("porch-north", { x: 600, y: 200 }, { x: 900, y: 200 }),
      wall("bedroom-dining", { x: 400, y: 500 }, { x: 400, y: 800 }),
    ];
    const faces = extractOrthogonalFaces(walls);
    expect(faces.map((face) => face.bounds)).toContainEqual({
      x: 600,
      y: 200,
      width: 300,
      height: 900,
    });
    expect(faces.map((face) => face.bounds)).toContainEqual({
      x: 0,
      y: 500,
      width: 400,
      height: 300,
    });
  });

  it("derives distinct zones across an incomplete wall without creating a physical wall", () => {
    const walls = [
      wall("south", { x: 0, y: 0 }, { x: 900, y: 0 }),
      wall("north", { x: 0, y: 600 }, { x: 900, y: 600 }),
      wall("west", { x: 0, y: 0 }, { x: 0, y: 600 }),
      wall("east", { x: 900, y: 0 }, { x: 900, y: 600 }),
      wall("divider-stub", { x: 450, y: 0 }, { x: 450, y: 100 }),
    ];
    const faces = extractOrthogonalFaces(walls);
    expect(faces.map((face) => face.bounds)).toEqual([
      { x: 0, y: 0, width: 450, height: 600 },
      { x: 450, y: 0, width: 450, height: 600 },
    ]);
    expect(
      deriveSplitSegments(walls).some(
        (segment) =>
          segment.start.x === 450 &&
          segment.start.y === 100 &&
          segment.end.y === 600,
      ),
    ).toBe(false);
    expect(danglingWallEndpoints(walls)).toContainEqual({ x: 450, y: 100 });
  });

  it("reports endpoint geometry that remains dangling after intersection splitting", () => {
    const walls = [
      wall("horizontal", { x: 0, y: 100 }, { x: 200, y: 100 }),
      wall("vertical", { x: 100, y: 100 }, { x: 100, y: 200 }),
    ];
    expect(danglingWallEndpoints(walls)).toEqual(
      expect.arrayContaining([
        { x: 0, y: 100 },
        { x: 200, y: 100 },
        { x: 100, y: 200 },
      ]),
    );
  });
});
