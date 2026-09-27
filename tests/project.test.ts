import { describe, expect, it } from "vitest";

import { projectName } from "../src/index.js";

describe("project foundation", () => {
  it("should expose the package identity", () => {
    // Given
    const expected = "house-plan";

    // When
    const actual = projectName;

    // Then
    expect(actual).toBe(expected);
  });
});
