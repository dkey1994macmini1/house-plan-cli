import { describe, expect, it } from "vitest";
import {
  apply,
  emptyPlan,
  type HousePlan,
  type Operation,
  type Storey,
} from "../src/house-plan.js";
import { renderSvg } from "../src/modules/render/svg-renderer.js";

const rectangle = (
  level: string,
  prefix: string,
  x: number,
  y: number,
  width: number,
  height: number,
) =>
  [
    {
      kind: "wall.upsert",
      level,
      entity: {
        name: `${prefix}-south`,
        a: { x, y },
        b: { x: x + width, y },
        thickness: 20,
        kind: "exterior",
      },
    },
    {
      kind: "wall.upsert",
      level,
      entity: {
        name: `${prefix}-east`,
        a: { x: x + width, y },
        b: { x: x + width, y: y + height },
        thickness: 20,
        kind: "exterior",
      },
    },
    {
      kind: "wall.upsert",
      level,
      entity: {
        name: `${prefix}-north`,
        a: { x: x + width, y: y + height },
        b: { x, y: y + height },
        thickness: 20,
        kind: "exterior",
      },
    },
    {
      kind: "wall.upsert",
      level,
      entity: {
        name: `${prefix}-west`,
        a: { x, y: y + height },
        b: { x, y },
        thickness: 20,
        kind: "exterior",
      },
    },
  ] as const;

const presentationPlan = (operations: readonly Operation[]): HousePlan => {
  const result = apply(emptyPlan(), 0, [
    { kind: "level.upsert", name: "ground", elevationCm: 0, order: 0 },
    ...operations,
  ]);
  if ("ok" in result) throw new Error(result.error.message);
  return result;
};

const groundStorey = (plan: HousePlan): Storey => {
  const storey = plan.storeys[0];
  if (!storey) throw new Error("Expected a ground storey");
  return storey;
};

const shell = (prefix: string, width: number, height: number) =>
  rectangle("ground", prefix, 0, 0, width, height);

const room = (name: string, type: string, x: number, y: number) => ({
  kind: "room.upsert" as const,
  level: "ground",
  entity: { name, type, seed: { x, y } },
});

const hingedDoor = (
  name: string,
  wall: string,
  hinge: "left" | "right",
  swing: "in" | "out",
  offset: number,
) => ({
  kind: "opening.upsert" as const,
  level: "ground",
  entity: {
    name,
    wall,
    type: "door" as const,
    variant: "single",
    offset,
    width: 90,
    hinge,
    swing,
  },
});

describe("presentation SVG rendering", () => {
  it("draws one area label for a face shared by two rooms, not duplicate claims", () => {
    const plan = presentationPlan([
      // One open-plan zone: both seeds fall on the same derived face.
      ...shell("open", 600, 400),
      room("living", "living", 400, 150),
      room("dining", "dining", 200, 250),
      hingedDoor("entry", "open-south", "left", "in", 100),
    ]);
    const svg = renderSvg(plan, groundStorey(plan), "presentation");

    const areaLabels = svg.match(/m²/g) ?? [];
    expect(areaLabels.length).toBe(1);
    expect(svg).toContain("dining · living");
  });

  it("renders every hinged door direction from domain geometry", () => {
    const plan = presentationPlan([
      ...shell("cross", 800, 800),
      room("hall", "circulation", 400, 400),
      hingedDoor("door-l-in", "cross-south", "left", "in", 40),
      hingedDoor("door-r-in", "cross-east", "right", "in", 40),
      // Out-swinging doors on the same wall keep clear offsets; a west host
      // axis direction mirrors the same domain math, so all four leaf
      // directions come from one shared geometry source.
      hingedDoor("door-l-out", "cross-north", "left", "out", 40),
      hingedDoor("door-r-out", "cross-north", "right", "out", 200),
      hingedDoor("entry-door", "cross-south", "right", "out", 600),
    ]);
    const svg = renderSvg(plan, groundStorey(plan), "presentation");

    const leaves = svg.match(/class="door-leaf"/g) ?? [];
    expect(leaves).toHaveLength(5);
    expect(svg.match(/class="door-swing"/g) ?? []).toHaveLength(5);
    expect(svg).not.toContain("NaN");
  });

  it("keeps rotated furniture footprints aligned with authored bounds", () => {
    const plan = presentationPlan([
      // Rotated 90°: authored width 60 x depth 160 paints as 160 x 60 on paper.
      ...shell("furn", 700, 400),
      room("bedroom", "bedroom", 250, 200),
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "entry",
          wall: "furn-south",
          type: "door",
          variant: "sliding",
          offset: 300,
          width: 80,
        },
      },
      {
        kind: "object.upsert",
        level: "ground",
        entity: {
          name: "wardrobe",
          label: "Szafa",
          center: { x: 90, y: 200 },
          width: 60,
          depth: 160,
          rotation: 90,
        },
      },
    ]);
    const svg = renderSvg(plan, groundStorey(plan), "presentation");

    const group = svg.match(/<g transform="rotate\(-90 90 -200\)">(.*?)<\/g>/);
    expect(group).not.toBeNull();
    expect(group?.[1]).toContain('width="60" height="160"');
  });

  it("escapes XML-significant characters in labels, notes and titles", () => {
    const plan = presentationPlan([
      ...shell("esc", 400, 300),
      room('salon & "jadalnia"', "living", 200, 150),
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "entry",
          wall: "esc-south",
          type: "door",
          variant: "sliding",
          offset: 100,
          width: 80,
        },
      },
      {
        kind: "annotation.upsert",
        level: "ground",
        entity: {
          name: "note",
          text: "Uwaga: <b>nie</b> projekt budowlany & prototyp",
          at: { x: 50, y: 50 },
        },
      },
    ]);
    const svg = renderSvg(plan, groundStorey(plan), "presentation");

    expect(svg).not.toMatch(/(?<!&amp;|&lt;|&gt;)<(?!=|\/|g|s|r|p|t|l|d)/);
    expect(svg).toContain("salon &amp; &quot;jadalnia&quot;");
    expect(svg).toContain("&lt;b&gt;nie&lt;/b&gt;");
    // Raw markup must not appear as a parsed element after the quote.
    expect(svg).not.toContain("<b>nie</b>");
    expect(svg).toContain("&amp; prototyp");
  });

  it("wraps a long annotation into the notes panel instead of clipping it", () => {
    const longText = "Bardzo długa notatka o kuchni. ".repeat(20).trim();
    const plan = presentationPlan([
      ...shell("panel", 300, 200),
      room("kitchen", "kitchen", 150, 100),
      hingedDoor("entry", "panel-south", "left", "in", 40),
      {
        kind: "annotation.upsert",
        level: "ground",
        entity: { name: "note", text: longText, at: { x: 20, y: 20 } },
      },
    ]);
    const svg = renderSvg(plan, groundStorey(plan), "presentation");

    const notes = svg.split('<g id="notes">')[1] ?? "";
    expect(notes).toContain("Bardzo długa notatka");
    // Wrapped into multiple tspans/lines, all inside the panel width.
    expect((notes.match(/class="notes-line"/g) ?? []).length).toBeGreaterThan(
      1,
    );
  });

  it("keeps every text node inside the presentation viewport", () => {
    const plan = presentationPlan([
      ...shell("bounds", 600, 400),
      room("living", "living", 300, 200),
      room("office", "office", 200, 300),
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "entry",
          wall: "bounds-south",
          type: "door",
          variant: "sliding",
          offset: 220,
          width: 80,
        },
      },
      {
        kind: "object.upsert",
        level: "ground",
        entity: {
          name: "desk",
          label: "Biurko z szeroką nazwą",
          center: { x: 350, y: 100 },
          width: 140,
          depth: 70,
          rotation: 0,
        },
      },
      {
        kind: "annotation.upsert",
        level: "ground",
        entity: {
          name: "note",
          text: "Długa notatka o warunkach technicznych i kosztach inwestycji.".repeat(
            3,
          ),
          at: { x: 30, y: 30 },
        },
      },
      {
        kind: "dimension.upsert",
        level: "ground",
        entity: {
          name: "dim",
          a: { x: 0, y: 0 },
          b: { x: 600, y: 0 },
          offset: -60,
        },
      },
    ]);
    const svg = renderSvg(plan, groundStorey(plan), "presentation");

    const viewBox = (
      svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/) ?? []
    )
      .slice(1)
      .map(Number) as [number, number, number, number];
    expect(viewBox.every(Number.isFinite)).toBe(true);
    const [x0, y0, vw, vh] = viewBox;
    const texts = svg.match(/<text [^>]*x="(-?[\d.]+)" y="(-?[\d.]+)"/g) ?? [];
    expect(texts.length).toBeGreaterThan(3);
    for (const entry of texts) {
      const [, x, y] = (entry.match(/x="(-?[\d.]+)" y="(-?[\d.]+)"/) ?? []).map(
        Number,
      );
      expect(Number(x), entry).toBeGreaterThanOrEqual(x0);
      expect(Number(x), entry).toBeLessThanOrEqual(x0 + vw);
      expect(Number(y), entry).toBeGreaterThanOrEqual(y0);
      expect(Number(y), entry).toBeLessThanOrEqual(y0 + vh);
    }
  });

  it("tints floors by room type with a neutral fallback for unknown types", () => {
    const plan = presentationPlan([
      // Divider wall creates two faces; both seeds must sit strictly inside
      // their own face, so the office door stays clear of the bath door.
      ...shell("tint", 400, 300),
      {
        kind: "wall.upsert",
        level: "ground",
        entity: {
          name: "t-divider",
          a: { x: 200, y: 0 },
          b: { x: 200, y: 300 },
          thickness: 12,
          kind: "interior",
        },
      },
      room("bath", "bathroom", 100, 80),
      room("work", "office", 300, 220),
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "entry",
          wall: "tint-south",
          type: "door",
          variant: "sliding",
          offset: 240,
          width: 80,
        },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "bath-door",
          wall: "t-divider",
          type: "door",
          variant: "sliding",
          offset: 70,
          width: 60,
        },
      },
      {
        kind: "opening.upsert",
        level: "ground",
        entity: {
          name: "office-door",
          wall: "t-divider",
          type: "door",
          variant: "sliding",
          offset: 170,
          width: 70,
        },
      },
    ]);
    const svg = renderSvg(plan, groundStorey(plan), "presentation");

    expect(svg).toMatch(/class="face-floor"[^>]*fill="#e4eef0"/);
    expect(svg).toMatch(/class="face-floor"[^>]*fill="#e9efe1"/);
  });

  it("formats area labels with comma decimals in Polish", () => {
    const plan = presentationPlan([
      ...shell("area", 300, 200),
      room("office", "office", 150, 100),
      hingedDoor("entry", "area-south", "left", "in", 40),
    ]);
    const svg = renderSvg(plan, groundStorey(plan), "presentation");

    // 300 x 200 face on wall axes = 6.00 m^2 claimed by its single label.
    expect(svg).toContain("6,0 m²");
  });

  it("stays byte-stable for the same plan", () => {
    const build = () =>
      presentationPlan([
        ...shell("stable", 500, 300),
        room("living", "living", 250, 150),
        {
          kind: "opening.upsert",
          level: "ground",
          entity: {
            name: "entry",
            wall: "stable-south",
            type: "door",
            variant: "sliding",
            offset: 150,
            width: 80,
          },
        },
      ]);
    const firstPlan = build();
    const first = renderSvg(firstPlan, groundStorey(firstPlan), "presentation");
    const rebuilt = build();
    const second = renderSvg(rebuilt, groundStorey(rebuilt), "presentation");
    expect(second).toBe(first);
  });

  it("reserves a separate header row for the scale below the disclaimer", () => {
    const plan = presentationPlan([
      ...shell("header", 600, 400),
      room("living", "living", 300, 200),
      hingedDoor("entry", "header-south", "left", "in", 40),
    ]);
    const svg = renderSvg(plan, groundStorey(plan), "presentation");
    const scaleY = Number(
      svg.match(/class="scale-bar"><rect x="[^"]+" y="([^"]+)"/)?.[1],
    );
    const disclaimerY = Number(
      svg.match(/<text[^>]+y="([^"]+)"[^>]*>Rysunek roboczy/)?.[1],
    );
    expect(scaleY).toBeGreaterThan(disclaimerY + 35);
  });

  it("moves oversized furniture labels to a key rather than painting beyond their footprint", () => {
    const plan = presentationPlan([
      ...shell("small-fixture", 400, 300),
      room("bathroom", "bathroom", 200, 150),
      hingedDoor("entry", "small-fixture-south", "left", "in", 40),
      {
        kind: "object.upsert",
        level: "ground",
        entity: {
          name: "basin",
          label: "Umywalka o bardzo długim opisie 55×45 / front S",
          center: { x: 300, y: 200 },
          width: 55,
          depth: 45,
          rotation: 0,
        },
      },
    ]);
    const svg = renderSvg(plan, groundStorey(plan), "presentation");
    expect(svg).toContain('class="furniture-key"');
    expect(svg).toContain("O1:");
    expect(svg).toContain("Umywalka o bardzo długim opisie");
  });

  it("visibly marks an invalid presentation draft, not only its JSON diagnostics", () => {
    const plan = presentationPlan([
      ...shell("draft", 400, 300),
      room("living", "living", 200, 150),
      hingedDoor("entry", "draft-south", "left", "in", 40),
    ]);
    const invalid: HousePlan = {
      ...plan,
      storeys: plan.storeys.map((storey) => ({
        ...storey,
        objects: [
          {
            id: "bad",
            name: "bad",
            label: "bad",
            center: { x: 0, y: 0 },
            width: 100,
            depth: 100,
            rotation: 0,
          },
        ],
      })),
    };
    const svg = renderSvg(invalid, groundStorey(invalid), "presentation");
    expect(svg).toContain('class="invalid-draft"');
    expect(svg).toContain("NIEPOPRAWNY SZKIC");
  });
});
