/**
 * Artifact safety (handoff §4): renders never overwrite protected inputs
 * (direct / symlink / hardlink alias), existing outputs refuse without
 * --overwrite, level names cannot escape the out-dir, and the all-levels
 * bundle stages before publishing. Every case runs through the real CLI
 * process on disposable fixtures.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  link,
  mkdtemp,
  readdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
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

const buildHouse = async (directory: string): Promise<string> => {
  const planPath = join(directory, "plan.json");
  const operationsPath = join(directory, "operations.json");
  await writeFile(operationsPath, JSON.stringify(houseOperations()), "utf8");
  expect((await runCli("init", "--out", planPath)).status).toBe(0);
  const applied = await runCli(
    "apply",
    "--plan",
    planPath,
    "--input",
    operationsPath,
    "--expected-revision",
    "0",
  );
  expect(applied.status).toBe(0);
  return planPath;
};

const houseOperations = (): Array<Record<string, unknown>> => [
  { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
  {
    kind: "wall.upsert",
    level: "ground",
    entity: {
      name: "south",
      a: { x: 0, y: 0 },
      b: { x: 800, y: 0 },
      thickness: 30,
      kind: "exterior",
    },
  },
  {
    kind: "wall.upsert",
    level: "ground",
    entity: {
      name: "north",
      a: { x: 0, y: 500 },
      b: { x: 800, y: 500 },
      thickness: 30,
      kind: "exterior",
    },
  },
  {
    kind: "wall.upsert",
    level: "ground",
    entity: {
      name: "west",
      a: { x: 0, y: 0 },
      b: { x: 0, y: 500 },
      thickness: 30,
      kind: "exterior",
    },
  },
  {
    kind: "wall.upsert",
    level: "ground",
    entity: {
      name: "east",
      a: { x: 800, y: 0 },
      b: { x: 800, y: 500 },
      thickness: 30,
      kind: "exterior",
    },
  },
  {
    kind: "room.upsert",
    level: "ground",
    entity: { name: "living", type: "living", seed: { x: 400, y: 250 } },
  },
  {
    kind: "opening.upsert",
    level: "ground",
    entity: {
      name: "front-door",
      wall: "south",
      type: "door",
      variant: "single",
      offset: 380,
      width: 90,
      hinge: "left",
      swing: "in",
    },
  },
];

beforeAll(async () => {
  await execFileAsync("pnpm", ["build"], { cwd: root });
});

describe("artifact safety: protected inputs (handoff §4.1)", () => {
  it("refuses render --out equal to the plan and leaves the plan byte-identical", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hpc-alias-direct-"));
    const planPath = join(directory, "plan.json");
    await buildHouse(directory);
    const before = await readFile(planPath);

    const result = await runCli(
      "render",
      "--plan",
      planPath,
      "--level",
      "ground",
      "--out",
      planPath,
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: { type: "invalid_input" },
    });
    expect(JSON.parse(result.stderr).error.message).toContain("plan.json");
    expect(await readFile(planPath)).toEqual(before);
  });

  it("refuses render --out through a symlink pointing at the plan", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hpc-alias-symlink-"));
    const planPath = join(directory, "plan.json");
    await buildHouse(directory);
    const linkPath = join(directory, "decoy.svg");
    await symlink(planPath, linkPath);
    const before = await readFile(planPath);

    const result = await runCli(
      "render",
      "--plan",
      planPath,
      "--level",
      "ground",
      "--out",
      linkPath,
    );

    expect(result.status).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: { type: "invalid_input" },
    });
    expect(await readFile(planPath)).toEqual(before);
  });

  it("refuses render --out through a hardlink pointing at the plan", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hpc-alias-hardlink-"));
    const planPath = join(directory, "plan.json");
    await buildHouse(directory);
    const linkPath = join(directory, "decoy.svg");
    await link(planPath, linkPath);
    const before = await readFile(planPath);

    const result = await runCli(
      "render",
      "--plan",
      planPath,
      "--level",
      "ground",
      "--out",
      linkPath,
    );

    expect(result.status).toBe(2);
    expect(await readFile(planPath)).toEqual(before);
  });
});

describe("artifact safety: existing outputs (handoff §4.1 policy)", () => {
  it("refuses overwriting an existing generated artifact without --overwrite", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hpc-existing-out-"));
    const planPath = await buildHouse(directory);
    const svgPath = join(directory, "out.svg");
    expect(
      (
        await runCli(
          "render",
          "--plan",
          planPath,
          "--level",
          "ground",
          "--out",
          svgPath,
          "--width",
          "0",
        )
      ).status,
    ).toBe(2);
    // First genuine render…
    expect(
      (
        await runCli(
          "render",
          "--plan",
          planPath,
          "--level",
          "ground",
          "--out",
          svgPath,
        )
      ).status,
    ).toBe(0);
    const firstBytes = await readFile(svgPath);

    // …then the second one refuses by default and keeps the original bytes.
    const refused = await runCli(
      "render",
      "--plan",
      planPath,
      "--level",
      "ground",
      "--out",
      svgPath,
    );
    expect(refused.status).toBe(2);
    expect(JSON.parse(refused.stderr).error.message).toContain(
      "already exists",
    );
    expect(await readFile(svgPath)).toEqual(firstBytes);

    // …and --overwrite is the explicit escape hatch.
    const replaced = await runCli(
      "render",
      "--plan",
      planPath,
      "--level",
      "ground",
      "--out",
      svgPath,
      "--overwrite",
    );
    expect(replaced.status).toBe(0);
  });
});

describe("artifact safety: level names and out-dir confinement (handoff §4.2)", () => {
  it("refuses an all-levels bundle whose level name encodes a parent-directory escape", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hpc-escape-level-"));
    const planPath = await buildHouse(directory);
    const outDir = join(directory, "bundle");
    const operationsPath = join(directory, "escape-ops.json");
    await writeFile(
      operationsPath,
      JSON.stringify([
        {
          kind: "level.upsert",
          name: "../escaped-level",
          elevationCm: 280,
          order: 1,
        },
      ]),
      "utf8",
    );
    expect(
      (
        await runCli(
          "apply",
          "--plan",
          planPath,
          "--input",
          operationsPath,
          "--expected-revision",
          "1",
        )
      ).status,
    ).toBe(0);

    // All-levels derives filenames from level names — the traversal name
    // must be refused, not silently mapped.
    const result = await runCli(
      "render",
      "--plan",
      planPath,
      "--all-levels",
      "--out-dir",
      outDir,
    );

    expect(result.status).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: { type: "invalid_input" },
    });
    expect(JSON.parse(result.stderr).error.message).toContain(
      "parent-directory escape",
    );
    // Nothing leaked outside the (fresh) out-dir.
    expect(existsSync(outDir)).toBe(false);
    expect(existsSync(join(directory, "escaped-level.svg"))).toBe(false);
    expect(existsSync(join(directory, "..", "escaped-level.svg"))).toBe(false);
  });

  it("renders a single level with a traversal-looking name to an explicit --out without escape", async () => {
    // Single-level render takes the output path directly from --out; the
    // level name never contributes to the filename, so a hostile display
    // name cannot redirect the write (assert no leak, publish allowed).
    const directory = await mkdtemp(join(tmpdir(), "hpc-single-escape-"));
    const planPath = await buildHouse(directory);
    const operationsPath = join(directory, "escape-ops.json");
    await writeFile(
      operationsPath,
      JSON.stringify([
        {
          kind: "level.upsert",
          name: "sub\\dir-level",
          elevationCm: 280,
          order: 1,
        },
      ]),
      "utf8",
    );
    expect(
      (
        await runCli(
          "apply",
          "--plan",
          planPath,
          "--input",
          operationsPath,
          "--expected-revision",
          "1",
        )
      ).status,
    ).toBe(0);
    const outPath = join(directory, "export.svg");
    const result = await runCli(
      "render",
      "--plan",
      planPath,
      "--level",
      "sub\\dir-level",
      "--out",
      outPath,
    );
    expect(result.status).toBe(0);
    expect(existsSync(outPath)).toBe(true);
    expect(existsSync(join(directory, "sub"))).toBe(false);
  });

  it("slugifies separator-ish level names and keeps them inside out-dir with a manifest map", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hpc-slug-"));
    const planPath = await buildHouse(directory);
    const operationsPath = join(directory, "weird-ops.json");
    await writeFile(
      operationsPath,
      JSON.stringify([
        {
          kind: "level.upsert",
          name: "parter\\podloga",
          elevationCm: 0,
          order: 1,
        },
      ]),
      "utf8",
    );
    expect(
      (
        await runCli(
          "apply",
          "--plan",
          planPath,
          "--input",
          operationsPath,
          "--expected-revision",
          "1",
        )
      ).status,
    ).toBe(0);
    const outDir = join(directory, "bundle");
    const result = await runCli(
      "render",
      "--plan",
      planPath,
      "--all-levels",
      "--out-dir",
      outDir,
    );
    expect(result.status).toBe(0);
    const files = await readdir(outDir);
    // No file may sit outside outDir and none may carry a raw separator.
    for (const file of files) {
      expect(file.includes("\\")).toBe(false);
      expect(file.includes("/")).toBe(false);
    }
    const manifest = JSON.parse(
      await readFile(join(outDir, "manifest.json"), "utf8"),
    ) as { levels: Array<{ level: string }> };
    expect(manifest.levels.map((entry) => entry.level)).toContain(
      "parter\\podloga",
    );
  });

  it("refuses all-levels publish into a non-empty out-dir without --overwrite", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hpc-nonempty-dir-"));
    const planPath = await buildHouse(directory);
    const outDir = join(directory, "bundle");
    expect(
      (
        await runCli(
          "render",
          "--plan",
          planPath,
          "--all-levels",
          "--out-dir",
          outDir,
        )
      ).status,
    ).toBe(0);
    await writeFile(join(outDir, "unrelated.txt"), "keep me", "utf8");

    const refused = await runCli(
      "render",
      "--plan",
      planPath,
      "--all-levels",
      "--out-dir",
      outDir,
    );
    expect(refused.status).toBe(2);
    expect(await readFile(join(outDir, "unrelated.txt"), "utf8")).toBe(
      "keep me",
    );
    const republish = await runCli(
      "render",
      "--plan",
      planPath,
      "--all-levels",
      "--out-dir",
      outDir,
      "--overwrite",
    );
    expect(republish.status).toBe(0);
  });
});
