import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
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

const shell = (
  level: string,
  prefix: string,
  width: number,
  height: number,
) => [
  {
    kind: "wall.upsert",
    level,
    entity: {
      name: `${prefix}-south`,
      a: { x: 0, y: 0 },
      b: { x: width, y: 0 },
      thickness: 20,
      kind: "exterior",
    },
  },
  {
    kind: "wall.upsert",
    level,
    entity: {
      name: `${prefix}-east`,
      a: { x: width, y: 0 },
      b: { x: width, y: height },
      thickness: 20,
      kind: "exterior",
    },
  },
  {
    kind: "wall.upsert",
    level,
    entity: {
      name: `${prefix}-north`,
      a: { x: width, y: height },
      b: { x: 0, y: height },
      thickness: 20,
      kind: "exterior",
    },
  },
  {
    kind: "wall.upsert",
    level,
    entity: {
      name: `${prefix}-west`,
      a: { x: 0, y: height },
      b: { x: 0, y: 0 },
      thickness: 20,
      kind: "exterior",
    },
  },
];

const LONG_NOTE =
  "Koncepcja funkcjonalna: kuchnia otwarta na salon jadalnię, schowek domowy przy spiżarni, " +
  "pralnia z wejściem od garażu, łazienki z osobnym wejściem dla gości. Powierzchnie podane " +
  "orientacyjnie, liczone po osiach ścian; brak potwierdzenia warunków technicznych i kosztów.";

const houseOperations = () => [
  { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
  { kind: "level.upsert", name: "upper", elevationCm: 280, order: 1 },
  ...shell("ground", "floor", 600, 400),
  {
    kind: "room.upsert",
    level: "ground",
    entity: { name: "living", type: "living", seed: { x: 300, y: 200 } },
  },
  {
    kind: "opening.upsert",
    level: "ground",
    entity: {
      name: "entry",
      wall: "floor-south",
      type: "door",
      variant: "single",
      offset: 150,
      width: 90,
      hinge: "left",
      swing: "in",
    },
  },
  {
    kind: "opening.upsert",
    level: "ground",
    entity: {
      name: "living-window",
      wall: "floor-north",
      type: "window",
      variant: "fixed",
      offset: 200,
      width: 120,
    },
  },
  {
    kind: "object.upsert",
    level: "ground",
    entity: {
      name: "sofa",
      label: "Sofa",
      center: { x: 300, y: 180 },
      width: 220,
      depth: 90,
      rotation: 0,
    },
  },
  {
    kind: "stair.upsert",
    level: "ground",
    entity: {
      name: "stairs-up",
      run: "main",
      direction: "up",
      bounds: { x: 480, y: 40, width: 90, height: 260 },
    },
  },
  ...shell("upper", "floor", 600, 400),
  {
    kind: "room.upsert",
    level: "upper",
    entity: { name: "landing", type: "circulation", seed: { x: 240, y: 200 } },
  },
  {
    kind: "stair.upsert",
    level: "upper",
    entity: {
      name: "stairs-down",
      run: "main",
      direction: "down",
      bounds: { x: 480, y: 40, width: 90, height: 260 },
    },
  },
  {
    kind: "void.upsert",
    level: "upper",
    entity: {
      name: "stairs-void",
      bounds: { x: 480, y: 40, width: 90, height: 260 },
    },
  },
  {
    kind: "annotation.upsert",
    level: "ground",
    entity: { name: "note", text: LONG_NOTE, at: { x: 60, y: 60 } },
  },
  {
    kind: "dimension.upsert",
    level: "ground",
    entity: {
      name: "width",
      a: { x: 0, y: 0 },
      b: { x: 600, y: 0 },
      offset: -60,
    },
  },
];

const pngSignature = (bytes: Buffer): { width: number; height: number } => {
  const magic = bytes.subarray(0, 8).toString("hex");
  expect(magic).toBe("89504e470d0a1a0a");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
};

describe("render style / format / width slice", () => {
  let directory: string;
  let planPath: string;
  let outDirectory: string;

  beforeAll(async () => {
    await execFileAsync("pnpm", ["build"], { cwd: root });
    directory = await mkdtemp(join(tmpdir(), "house-plan-render-style-"));
    outDirectory = join(directory, "out");
    planPath = join(directory, "plan.json");
    const operationsPath = join(directory, "operations.json");
    await writeFile(operationsPath, JSON.stringify(houseOperations()), "utf8");
    const initialized = await runCli("init", "--out", planPath);
    expect(initialized.status).toBe(0);
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
  });

  it("keeps the default render a technical SVG without presentation extras", async () => {
    const svgPath = join(outDirectory, "default.svg");
    const result = await runCli(
      "render",
      "--plan",
      planPath,
      "--level",
      "ground",
      "--out",
      svgPath,
    );
    expect(result).toMatchObject({ status: 0, stderr: "" });
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      type: "plan.rendered",
      data: { level: "ground", path: svgPath },
    });
    const svg = await readFile(svgPath, "utf8");
    expect(svg).toContain('id="walls"');
    expect(svg).toContain('class="door-leaf"');
    expect(svg).not.toContain('id="floors"');
    expect(svg).not.toContain('id="header"');
  });

  it("renders a presentation SVG with header, floors, filled furniture and notes", async () => {
    const svgPath = join(outDirectory, "presentation.svg");
    const result = await runCli(
      "render",
      "--plan",
      planPath,
      "--level",
      "ground",
      "--out",
      svgPath,
      "--style",
      "presentation",
    );
    expect(result).toMatchObject({ status: 0, stderr: "" });
    const svg = await readFile(svgPath, "utf8");
    expect(svg).toContain('id="header"');
    expect(svg).toContain("Rewizja 1");
    expect(svg).toContain("ground");
    expect(svg).toContain('class="north"');
    expect(svg).toContain('class="scale-bar"');
    expect(svg).toContain('id="floors"');
    expect(svg).toContain('class="door-leaf"');
    expect(svg).toContain("po osiach ścian");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("undefined");
    const notes = svg.split('<g id="notes">')[1];
    expect(notes).toContain("Koncepcja funkcjonalna");
  });

  it("renders PNG through the native adapter at the requested pixel width", async () => {
    const pngPath = join(outDirectory, "presentation.png");
    const result = await runCli(
      "render",
      "--plan",
      planPath,
      "--level",
      "ground",
      "--out",
      pngPath,
      "--style",
      "presentation",
      "--format",
      "png",
      "--width",
      "1200",
    );
    expect(result).toMatchObject({ status: 0, stderr: "" });
    const envelope = JSON.parse(result.stdout) as {
      data: { format: string; width: number; height: number };
    };
    expect(envelope.data.format).toBe("png");
    expect(envelope.data.width).toBe(1200);
    expect(envelope.data.height).toBeGreaterThan(0);
    const bytes = await readFile(pngPath);
    const { width, height } = pngSignature(bytes);
    expect(width).toBe(1200);
    expect(height).toBe(envelope.data.height);
  });

  it("keeps a portable bundled font with its licence", () => {
    const fontsDirectory = join(root, "assets", "fonts");
    for (const file of ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "LICENSE"]) {
      expect(existsSync(join(fontsDirectory, file)), file).toBe(true);
    }
  });

  it("rejects an explicit --width when rendering SVG", async () => {
    const svgPath = join(outDirectory, "never-created.svg");
    const result = await runCli(
      "render",
      "--plan",
      planPath,
      "--level",
      "ground",
      "--out",
      svgPath,
      "--width",
      "2400",
    );
    expect(result).toMatchObject({ status: 2, stdout: "" });
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: { type: "invalid_input" },
    });
    expect(existsSync(svgPath)).toBe(false);
  });

  it("rejects --width outside the bounded pixel range", async () => {
    for (const width of ["0", "9000", "-5"]) {
      const result = await runCli(
        "render",
        "--plan",
        planPath,
        "--level",
        "ground",
        "--out",
        join(outDirectory, `never-${width}.png`),
        "--format",
        "png",
        "--width",
        width,
      );
      expect(result, `width=${width}`).toMatchObject({
        status: 2,
        stdout: "",
      });
      expect(JSON.parse(result.stderr), `width=${width}`).toMatchObject({
        ok: false,
        error: { type: "invalid_input" },
      });
    }
  });

  it("rejects unknown --style and --format values", async () => {
    for (const args of [
      ["--style", "artistic"],
      ["--format", "pdf"],
    ]) {
      const result = await runCli(
        "render",
        "--plan",
        planPath,
        "--level",
        "ground",
        "--out",
        join(outDirectory, "never.svg"),
        ...args,
      );
      expect(result, args.join("=")).toMatchObject({ status: 2, stdout: "" });
      expect(JSON.parse(result.stderr)).toMatchObject({
        ok: false,
        error: { type: "invalid_input" },
      });
    }
  });

  it("rejects a pixel width whose derived height exceeds the raster bound", async () => {
    const tallPlanPath = join(directory, "tall-plan.json");
    const tallOperationsPath = join(directory, "tall-operations.json");
    await writeFile(
      tallOperationsPath,
      JSON.stringify([
        { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
        {
          kind: "wall.upsert",
          level: "ground",
          entity: {
            name: "west",
            a: { x: 0, y: 0 },
            b: { x: 0, y: 4000 },
            thickness: 20,
            kind: "exterior",
          },
        },
        {
          kind: "wall.upsert",
          level: "ground",
          entity: {
            name: "north",
            a: { x: 0, y: 4000 },
            b: { x: 100, y: 4000 },
            thickness: 20,
            kind: "exterior",
          },
        },
        {
          kind: "wall.upsert",
          level: "ground",
          entity: {
            name: "east",
            a: { x: 100, y: 4000 },
            b: { x: 100, y: 0 },
            thickness: 20,
            kind: "exterior",
          },
        },
        {
          kind: "wall.upsert",
          level: "ground",
          entity: {
            name: "south",
            a: { x: 100, y: 0 },
            b: { x: 0, y: 0 },
            thickness: 20,
            kind: "exterior",
          },
        },
        {
          kind: "room.upsert",
          level: "ground",
          entity: {
            name: "corridor",
            type: "circulation",
            seed: { x: 50, y: 2000 },
          },
        },
        {
          kind: "opening.upsert",
          level: "ground",
          entity: {
            name: "entry",
            wall: "west",
            type: "door",
            variant: "sliding",
            offset: 1900,
            width: 80,
          },
        },
      ]),
      "utf8",
    );
    expect((await runCli("init", "--out", tallPlanPath)).status).toBe(0);
    const applied = await runCli(
      "apply",
      "--plan",
      tallPlanPath,
      "--input",
      tallOperationsPath,
      "--expected-revision",
      "0",
    );
    expect(applied.status).toBe(0);

    const result = await runCli(
      "render",
      "--plan",
      tallPlanPath,
      "--level",
      "ground",
      "--out",
      join(outDirectory, "tall.png"),
      "--format",
      "png",
      "--width",
      "8192",
    );
    expect(result).toMatchObject({ status: 2, stdout: "" });
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: { type: "invalid_input" },
    });
    expect(existsSync(join(outDirectory, "tall.png"))).toBe(false);
  });

  it("renders all levels as PNGs with a manifest carrying format and pixel size", async () => {
    const pngDirectory = join(outDirectory, "all-png");
    const result = await runCli(
      "render",
      "--plan",
      planPath,
      "--all-levels",
      "--out-dir",
      pngDirectory,
      "--format",
      "png",
      "--width",
      "900",
    );
    expect(result).toMatchObject({ status: 0, stderr: "" });
    const files = await readdir(pngDirectory);
    expect(files.filter((file) => file.endsWith(".png")).toSorted()).toEqual([
      "ground.png",
      "upper.png",
    ]);
    const manifest = JSON.parse(
      await readFile(join(pngDirectory, "manifest.json"), "utf8"),
    ) as {
      schemaVersion: number;
      levels: Array<{
        level: string;
        path: string;
        format: string;
        width: number;
        height: number;
      }>;
    };
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.levels).toHaveLength(2);
    for (const entry of manifest.levels) {
      expect(entry.format).toBe("png");
      expect(entry.width).toBe(900);
      expect(entry.height).toBeGreaterThan(0);
    }
  });

  it("keeps the all-levels SVG manifest compatible with a format field", async () => {
    const svgDirectory = join(outDirectory, "all-svg");
    const result = await runCli(
      "render",
      "--plan",
      planPath,
      "--all-levels",
      "--out-dir",
      svgDirectory,
    );
    expect(result).toMatchObject({ status: 0, stderr: "" });
    const manifest = JSON.parse(
      await readFile(join(svgDirectory, "manifest.json"), "utf8"),
    ) as {
      levels: Array<{ level: string; path: string; format?: string }>;
    };
    expect(manifest.levels).toHaveLength(2);
    expect(manifest.levels.map((entry) => entry.level).toSorted()).toEqual([
      "ground",
      "upper",
    ]);
    for (const entry of manifest.levels) {
      expect(entry.path.endsWith(".svg")).toBe(true);
      expect(entry.format).toBe("svg");
    }
  });

  it("leaves the plan file byte-identical after rendering", async () => {
    const before = await readFile(planPath);
    const result = await runCli(
      "render",
      "--plan",
      planPath,
      "--level",
      "ground",
      "--out",
      join(outDirectory, "hash-check.svg"),
      "--style",
      "presentation",
    );
    expect(result.status).toBe(0);
    const after = await readFile(planPath);
    expect(createHash("sha256").update(after).digest("hex")).toBe(
      createHash("sha256").update(before).digest("hex"),
    );
  });

  it("renders an invalid plan as a presentation draft only with --allow-invalid", async () => {
    const draftPlanPath = join(directory, "draft-plan.json");
    const draftSvgPath = join(outDirectory, "draft-presentation.svg");
    await writeFile(
      draftPlanPath,
      JSON.stringify({
        schemaVersion: 1,
        revision: 3,
        levels: [{ id: "level-1", name: "ground", elevationCm: 0, order: 0 }],
        storeys: [
          {
            id: "storey-1",
            levelId: "level-1",
            walls: [],
            rooms: [
              {
                id: "room-1",
                name: "floating",
                type: "living",
                seed: { x: 100, y: 100 },
              },
            ],
            openings: [],
            objects: [],
            stairs: [],
            voids: [],
            annotations: [],
            dimensions: [],
          },
        ],
      }),
      "utf8",
    );
    const renderArgs = [
      "render",
      "--plan",
      draftPlanPath,
      "--level",
      "ground",
      "--style",
      "presentation",
    ];
    const refused = await runCli(...renderArgs, "--out", draftSvgPath);
    expect(refused).toMatchObject({ status: 2, stdout: "" });
    expect(JSON.parse(refused.stderr)).toMatchObject({
      ok: false,
      error: { type: "invalid_input" },
    });
    const draft = await runCli(
      ...renderArgs,
      "--out",
      draftSvgPath,
      "--allow-invalid",
    );
    expect(draft).toMatchObject({ status: 0, stderr: "" });
    const svg = await readFile(draftSvgPath, "utf8");
    expect(svg).toContain('id="header"');
    expect(JSON.parse(draft.stdout)).toMatchObject({
      ok: true,
      meta: {
        diagnostics: [expect.objectContaining({ code: "ROOM_FACE_NOT_FOUND" })],
      },
    });
  });

  it("documents the new flags in command discovery", async () => {
    const result = await runCli("commands");
    const envelope = JSON.parse(result.stdout) as {
      data: { commands: string[] };
    };
    const renderGrammars = envelope.data.commands.filter((command) =>
      command.startsWith("render "),
    );
    expect(renderGrammars.length).toBeGreaterThan(0);
    for (const grammar of renderGrammars) {
      expect(grammar).toContain("[--style technical|presentation]");
      expect(grammar).toContain("[--format svg|png]");
    }
  });
});
