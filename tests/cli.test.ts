import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const bin = resolve(root, "dist/bin.js");

const runCli = async (...args: string[]) => {
  try {
    const result = await execFileAsync(process.execPath, [bin, ...args], {
      cwd: root,
    });
    return { status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (cause) {
    const error = cause as { code?: number; stdout?: string; stderr?: string };
    return {
      status: error.code ?? 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
};

beforeAll(async () => {
  await execFileAsync("pnpm", ["build"], { cwd: root });
});

describe("house-plan executable", () => {
  it("emits its Effect-derived JSON Schema through stdout", async () => {
    const result = await runCli("schema");
    const envelope = JSON.parse(result.stdout) as {
      ok: boolean;
      data: Record<string, unknown>;
    };
    expect(result).toMatchObject({ status: 0, stderr: "" });
    expect(envelope.ok).toBe(true);
    expect(envelope.data.$schema).toBe(
      "http://json-schema.org/draft-07/schema#",
    );
  });

  it("writes invalid operation input only to stderr with exit code 2", async () => {
    const directory = await mkdtemp(join(tmpdir(), "house-plan-cli-"));
    const plan = join(directory, "plan.json");
    const invalid = join(directory, "invalid.json");
    await writeFile(invalid, "{broken", "utf8");
    expect(await runCli("init", "--out", plan)).toMatchObject({
      status: 0,
      stderr: "",
    });
    const result = await runCli(
      "apply",
      "--plan",
      plan,
      "--input",
      invalid,
      "--expected-revision",
      "0",
    );
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: { type: "invalid_input" },
    });
    expect(JSON.parse(await readFile(plan, "utf8"))).toMatchObject({
      revision: 0,
    });
  });
  it("reports missing levels as not_found rather than revision_conflict", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "house-plan-missing-level-"),
    );
    const planPath = join(directory, "plan.json");
    const operationsPath = join(directory, "operations.json");
    expect((await runCli("init", "--out", planPath)).status).toBe(0);
    const original = await readFile(planPath, "utf8");
    await writeFile(
      operationsPath,
      JSON.stringify([
        {
          kind: "wall.upsert",
          level: "missing",
          entity: {
            name: "wall",
            a: { x: 0, y: 0 },
            b: { x: 100, y: 0 },
            thickness: 20,
            kind: "exterior",
          },
        },
      ]),
      "utf8",
    );
    const result = await runCli(
      "apply",
      "--plan",
      planPath,
      "--input",
      operationsPath,
      "--expected-revision",
      "0",
    );
    expect(result).toMatchObject({ status: 5, stdout: "" });
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: { type: "not_found", message: "Unknown level 'missing'" },
    });
    expect(await readFile(planPath, "utf8")).toBe(original);
  });

  it("keeps parser failures on a single structured stderr line", async () => {
    for (const args of [
      ["not-command"],
      [
        "apply",
        "--plan",
        "missing.json",
        "--input",
        "missing.json",
        "--expected-revision",
        "nope",
      ],
    ]) {
      const result = await runCli(...args);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      const lines = result.stderr.trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0] ?? "")).toMatchObject({
        ok: false,
        error: { type: "invalid_input" },
      });
    }
  });

  it("applies and renders the open-plan reference with a direct stair-to-dining entry", async () => {
    const directory = await mkdtemp(join(tmpdir(), "house-plan-reference-"));
    const planPath = join(directory, "plan.json");
    const svgPath = join(directory, "ground.svg");
    const operations = JSON.parse(
      await readFile(
        join(root, "examples/reference-ground-floor-ops.json"),
        "utf8",
      ),
    ) as Array<{
      kind: string;
      level?: string;
      entity?: {
        name?: string;
        wall?: string;
        a?: { x: number; y: number };
        b?: { x: number; y: number };
      };
    }>;
    expect(operations).toContainEqual(
      expect.objectContaining({
        kind: "opening.upsert",
        entity: expect.objectContaining({ name: "front-entry", wall: "south" }),
      }),
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        kind: "opening.upsert",
        entity: expect.objectContaining({
          name: "stairs-porch-door",
          offset: 60,
        }),
      }),
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        kind: "opening.upsert",
        entity: expect.objectContaining({
          name: "kitchen-to-dining-door",
          wall: "dining-north",
        }),
      }),
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        kind: "opening.upsert",
        entity: expect.objectContaining({
          name: "stair-dining-door",
          wall: "stair-north",
        }),
      }),
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        kind: "wall.upsert",
        entity: expect.objectContaining({
          name: "dining-living-stub",
          b: { x: 600, y: 560 },
        }),
      }),
    );
    expect(
      operations.some(
        (operation) => operation.entity?.wall === "dining-living-stub",
      ),
    ).toBe(false);
    expect((await runCli("init", "--out", planPath)).status).toBe(0);
    const applied = await runCli(
      "apply",
      "--plan",
      planPath,
      "--input",
      join(root, "examples/reference-ground-floor-ops.json"),
      "--expected-revision",
      "0",
    );
    expect(applied).toMatchObject({ status: 0, stderr: "" });
    const report = await runCli("report", "--plan", planPath);
    expect(report.status).toBe(0);
    const envelope = JSON.parse(report.stdout) as {
      data: {
        valid: boolean;
        plan: {
          storeys: Array<{
            rooms: Array<{
              name: string;
              bounds: { x: number; width: number };
            }>;
          }>;
        };
      };
    };
    expect(envelope.data.valid).toBe(true);
    const ground = envelope.data.plan.storeys[0];
    expect(
      ground?.rooms.find((room) => room.name === "dining")?.bounds,
    ).toMatchObject({ x: 350, width: 250 });
    expect(
      ground?.rooms.find((room) => room.name === "living")?.bounds,
    ).toMatchObject({ x: 600, width: 300 });
    const render = await runCli(
      "render",
      "--plan",
      planPath,
      "--level",
      "ground",
      "--out",
      svgPath,
    );
    expect(render).toMatchObject({ status: 0, stderr: "" });
    const svg = await readFile(svgPath, "utf8");
    expect(svg).toContain("<svg");
    expect(svg).toContain('x1="600" y1="-500" x2="600" y2="-560"');
    expect(svg).not.toContain('x1="600" y1="-560" x2="600" y2="-800"');
    const unknown = await runCli(
      "render",
      "--plan",
      planPath,
      "--level",
      "missing",
      "--out",
      join(directory, "missing.svg"),
    );
    expect(unknown).toMatchObject({ status: 5, stdout: "" });
    expect(JSON.parse(unknown.stderr)).toMatchObject({
      ok: false,
      error: { type: "not_found" },
    });
    const conflict = await runCli(
      "apply",
      "--plan",
      planPath,
      "--input",
      join(root, "examples/reference-ground-floor-ops.json"),
      "--expected-revision",
      "0",
    );
    expect(conflict).toMatchObject({ status: 5, stdout: "" });
    expect(JSON.parse(conflict.stderr)).toMatchObject({
      ok: false,
      error: { type: "revision_conflict" },
    });
    const beforeRejectedEdit = await readFile(planPath, "utf8");
    const invalidFurniture = join(directory, "invalid-furniture.json");
    await writeFile(
      invalidFurniture,
      JSON.stringify([
        {
          kind: "object.upsert",
          level: "ground",
          entity: {
            name: "dining-table",
            label: "Table",
            center: { x: 350, y: 690 },
            width: 120,
            depth: 80,
            rotation: 0,
          },
        },
      ]),
      "utf8",
    );
    const rejected = await runCli(
      "apply",
      "--plan",
      planPath,
      "--input",
      invalidFurniture,
      "--expected-revision",
      "1",
    );
    expect(rejected).toMatchObject({ status: 2, stdout: "" });
    expect(JSON.parse(rejected.stderr)).toMatchObject({
      ok: false,
      error: {
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "OBJECT_WALL_COLLISION",
            location: { object: "dining-table", wall: "bedroom1-east" },
          }),
        ]),
      },
    });
    expect(await readFile(planPath, "utf8")).toBe(beforeRejectedEdit);

    const invalidAccess = join(directory, "invalid-access.json");
    await writeFile(
      invalidAccess,
      JSON.stringify([
        {
          kind: "opening.upsert",
          level: "ground",
          entity: {
            name: "bedroom-1-door",
            wall: "stair-north",
            type: "door",
            variant: "sliding",
            offset: 175,
            width: 70,
          },
        },
      ]),
      "utf8",
    );
    const disconnected = await runCli(
      "apply",
      "--plan",
      planPath,
      "--input",
      invalidAccess,
      "--expected-revision",
      "1",
    );
    expect(disconnected).toMatchObject({ status: 2, stdout: "" });
    expect(JSON.parse(disconnected.stderr)).toMatchObject({
      ok: false,
      error: {
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "ROOM_NOT_REACHABLE_FROM_ENTRY",
            location: { room: "bedroom-1" },
          }),
        ]),
      },
    });
    expect(await readFile(planPath, "utf8")).toBe(beforeRejectedEdit);

    const blockedDoor = join(directory, "blocked-door.json");
    const blockedBounds = { x: 400, y: 50, width: 200, height: 350 };
    await writeFile(
      blockedDoor,
      JSON.stringify([
        {
          kind: "stair.upsert",
          level: "ground",
          entity: {
            name: "stairs-up",
            run: "main-stairs",
            direction: "up",
            bounds: blockedBounds,
          },
        },
        {
          kind: "stair.upsert",
          level: "upper",
          entity: {
            name: "stairs-down",
            run: "main-stairs",
            direction: "down",
            bounds: blockedBounds,
          },
        },
        {
          kind: "void.upsert",
          level: "upper",
          entity: { name: "stairs-void", bounds: blockedBounds },
        },
      ]),
      "utf8",
    );
    const obstruction = await runCli(
      "apply",
      "--plan",
      planPath,
      "--input",
      blockedDoor,
      "--expected-revision",
      "1",
    );
    expect(obstruction).toMatchObject({ status: 2, stdout: "" });
    expect(JSON.parse(obstruction.stderr)).toMatchObject({
      ok: false,
      error: {
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "DOOR_STAIR_APPROACH_COLLISION",
            location: { opening: "stairs-porch-door", stair: "stairs-up" },
          }),
        ]),
      },
    });
    expect(await readFile(planPath, "utf8")).toBe(beforeRejectedEdit);
  });
});
