import { describe, expect, it } from "vitest";
import type { Wall } from "../src/modules/plan/model.js";
import {
  danglingWallEndpoints,
  deriveSplitSegments,
} from "../src/modules/plan/topology.js";

const wall = (
  name: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
): Wall => ({ id: name, name, a, b, thickness: 20, kind: "interior" });

describe("derived orthogonal topology", () => {
  it("virtually splits a crossing wall graph without modifying source walls", () => {
    const horizontal = wall("horizontal", { x: 0, y: 100 }, { x: 200, y: 100 });
    const vertical = wall("vertical", { x: 100, y: 0 }, { x: 100, y: 200 });
    expect(deriveSplitSegments([horizontal, vertical])).toHaveLength(4);
    expect(horizontal).toEqual(
      wall("horizontal", { x: 0, y: 100 }, { x: 200, y: 100 }),
    );
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
