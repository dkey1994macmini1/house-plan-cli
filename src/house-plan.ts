import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type Point = { readonly x: number; readonly y: number };
type Kind = "exterior" | "interior";
type Severity = "error" | "warning";
export type Diagnostic = {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
  readonly location?: Record<string, string>;
  readonly measured?: {
    readonly value: number;
    readonly unit: "cm";
    readonly limit?: number;
  };
};
export type Wall = {
  readonly id: string;
  readonly name: string;
  readonly a: Point;
  readonly b: Point;
  readonly thickness: number;
  readonly kind: Kind;
};
export type Room = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly seed: Point;
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
};
export type Opening = {
  readonly id: string;
  readonly name: string;
  readonly wall: string;
  readonly type: "door" | "window";
  readonly variant: string;
  readonly offset: number;
  readonly width: number;
  readonly hinge?: "left" | "right";
  readonly swing?: "in" | "out";
};
export type ObjectBox = {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly center: Point;
  readonly width: number;
  readonly depth: number;
  readonly rotation: 0 | 90 | 180 | 270;
  readonly clearance?: {
    readonly front: number;
    readonly left: number;
    readonly right: number;
    readonly back: number;
  };
};
export type Stair = {
  readonly id: string;
  readonly name: string;
  readonly run: string;
  readonly direction: "up" | "down";
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
};
export type Void = {
  readonly id: string;
  readonly name: string;
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
};
export type Storey = {
  readonly id: string;
  readonly levelId: string;
  readonly walls: readonly Wall[];
  readonly rooms: readonly Room[];
  readonly openings: readonly Opening[];
  readonly objects: readonly ObjectBox[];
  readonly stairs: readonly Stair[];
  readonly voids: readonly Void[];
};
export type Level = {
  readonly id: string;
  readonly name: string;
  readonly elevationCm: number;
  readonly order: number;
};
export type HousePlan = {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly levels: readonly Level[];
  readonly storeys: readonly Storey[];
};
export type Envelope<T> = {
  readonly ok: true;
  readonly type: string;
  readonly schemaVersion: 1;
  readonly data: T;
  readonly meta: {
    readonly revision?: number;
    readonly diagnostics?: readonly Diagnostic[];
  };
};
export type Failure = {
  readonly ok: false;
  readonly schemaVersion: 1;
  readonly error: {
    readonly type: string;
    readonly message: string;
    readonly hint: string;
    readonly diagnostics?: readonly Diagnostic[];
  };
};
export const emptyPlan = (): HousePlan => ({
  schemaVersion: 1,
  revision: 0,
  levels: [],
  storeys: [],
});
const mm = (n: number): number => Math.round(n * 10);
const validNumber = (n: number): boolean =>
  Number.isFinite(n) && mm(n) === n * 10;
const inside = (
  a: { x: number; y: number; width: number; height: number },
  p: Point,
): boolean =>
  p.x >= a.x && p.x <= a.x + a.width && p.y >= a.y && p.y <= a.y + a.height;
const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
const byName = <T extends { name: string }>(
  items: readonly T[],
  name: string,
): T | undefined => items.find((item) => item.name === name);
const update = <T extends { name: string }>(
  items: readonly T[],
  value: T,
): readonly T[] => [...items.filter((item) => item.name !== value.name), value];
export const makeId = (): string => randomUUID();
export const validate = (plan: HousePlan): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const names = new Set<string>();
  for (const level of plan.levels) {
    if (names.has(level.name))
      diagnostics.push({
        code: "LEVEL_DUPLICATE_NAME",
        severity: "error",
        message: `Duplicate level name '${level.name}'`,
      });
    names.add(level.name);
  }
  for (const storey of plan.storeys) {
    const all = [
      ...storey.walls,
      ...storey.rooms,
      ...storey.openings,
      ...storey.objects,
      ...storey.stairs,
      ...storey.voids,
    ];
    const local = new Set<string>();
    for (const entity of all) {
      if (local.has(entity.name))
        diagnostics.push({
          code: "NAME_DUPLICATE",
          severity: "error",
          message: `Duplicate entity name '${entity.name}'`,
          location: { storeyId: storey.id },
        });
      local.add(entity.name);
    }
    for (const wall of storey.walls) {
      if (
        !validNumber(wall.a.x) ||
        !validNumber(wall.a.y) ||
        !validNumber(wall.b.x) ||
        !validNumber(wall.b.y) ||
        !validNumber(wall.thickness) ||
        wall.thickness <= 0
      )
        diagnostics.push({
          code: "WALL_INVALID_MEASUREMENT",
          severity: "error",
          message: `Wall '${wall.name}' uses non-grid or invalid centimetre values`,
          location: { wall: wall.name },
        });
      if (wall.a.x !== wall.b.x && wall.a.y !== wall.b.y)
        diagnostics.push({
          code: "WALL_NON_ORTHOGONAL",
          severity: "error",
          message: `Wall '${wall.name}' must be horizontal or vertical`,
          location: { wall: wall.name },
        });
      if (wall.a.x === wall.b.x && wall.a.y === wall.b.y)
        diagnostics.push({
          code: "WALL_ZERO_LENGTH",
          severity: "error",
          message: `Wall '${wall.name}' has zero length`,
          location: { wall: wall.name },
        });
    }
    for (const room of storey.rooms)
      if (
        room.bounds.width <= 0 ||
        room.bounds.height <= 0 ||
        !inside(room.bounds, room.seed)
      )
        diagnostics.push({
          code: "ROOM_INVALID_SEED",
          severity: "error",
          message: `Room '${room.name}' seed must be inside a positive rectangular face`,
          location: { room: room.name },
        });
    for (const opening of storey.openings) {
      const wall = byName(storey.walls, opening.wall);
      if (!wall) {
        diagnostics.push({
          code: "OPENING_WALL_NOT_FOUND",
          severity: "error",
          message: `Opening '${opening.name}' references unknown wall '${opening.wall}'`,
          location: { opening: opening.name },
        });
        continue;
      }
      const length =
        Math.abs(wall.a.x - wall.b.x) + Math.abs(wall.a.y - wall.b.y);
      if (
        opening.offset < 0 ||
        opening.width <= 0 ||
        opening.offset + opening.width > length
      )
        diagnostics.push({
          code: "OPENING_OUTSIDE_WALL",
          severity: "error",
          message: `Opening '${opening.name}' does not fit host wall '${wall.name}'`,
          location: { opening: opening.name, wall: wall.name },
          measured: {
            value: opening.offset + opening.width - length,
            unit: "cm",
            limit: 0,
          },
        });
    }
    for (const object of storey.objects) {
      const bounds = {
        x: object.center.x - object.width / 2,
        y: object.center.y - object.depth / 2,
        width: object.width,
        height: object.depth,
      };
      for (const other of storey.objects)
        if (
          object.name < other.name &&
          overlaps(bounds, {
            x: other.center.x - other.width / 2,
            y: other.center.y - other.depth / 2,
            width: other.width,
            height: other.depth,
          })
        )
          diagnostics.push({
            code: "OBJECT_COLLIDES",
            severity: "warning",
            message: `Objects '${object.name}' and '${other.name}' overlap`,
          });
    }
  }
  for (const level of plan.levels)
    if (!plan.storeys.some((storey) => storey.levelId === level.id))
      diagnostics.push({
        code: "LEVEL_WITHOUT_STOREY",
        severity: "warning",
        message: `Level '${level.name}' has no storey`,
      });
  return diagnostics.sort(
    (a, b) =>
      a.code.localeCompare(b.code) || a.message.localeCompare(b.message),
  );
};
export const apply = (
  plan: HousePlan,
  expectedRevision: number,
  operations: readonly Record<string, unknown>[],
): HousePlan | Failure => {
  if (plan.revision !== expectedRevision)
    return failure(
      "revision_conflict",
      `Expected revision ${expectedRevision}; plan is ${plan.revision}`,
      "Read the plan and retry with its current revision.",
    );
  let next = structuredClone(plan) as HousePlan;
  for (const operation of operations) {
    const kind = String(operation.kind ?? "");
    if (kind === "level.upsert") {
      const name = String(operation.name ?? "");
      const existing = byName(next.levels, name);
      const level: Level = {
        id: existing?.id ?? makeId(),
        name,
        elevationCm: Number(operation.elevationCm),
        order: Number(operation.order),
      };
      next = {
        ...next,
        levels: update(next.levels, level),
        storeys: existing
          ? next.storeys
          : [
              ...next.storeys,
              {
                id: makeId(),
                levelId: level.id,
                walls: [],
                rooms: [],
                openings: [],
                objects: [],
                stairs: [],
                voids: [],
              },
            ],
      };
      continue;
    }
    const level = byName(next.levels, String(operation.level ?? ""));
    if (!level)
      return failure(
        "not_found",
        `Unknown level '${String(operation.level)}'`,
        "Create the level first with level.upsert.",
      );
    const storey = next.storeys.find((value) => value.levelId === level.id);
    if (!storey)
      return failure(
        "internal",
        `No storey for level '${level.name}'`,
        "Reinitialize the plan.",
      );
    const entity = operation.entity as Record<string, unknown> | undefined;
    if (!entity || typeof entity.name !== "string")
      return failure(
        "invalid_input",
        `${kind} requires entity.name`,
        "Supply a JSON entity with a unique name.",
      );
    const add = <T extends { name: string }>(
      key: keyof Storey,
      value: T,
    ): void => {
      (storey as unknown as Record<string, unknown>)[key] = update(
        (storey as unknown as Record<string, T[]>)[key] ?? [],
        { ...value, id: typeof entity.id === "string" ? entity.id : makeId() },
      );
    };
    if (kind === "wall.upsert")
      add("walls", { ...entity, a: entity.a, b: entity.b } as unknown as Wall);
    else if (kind === "room.upsert") add("rooms", entity as unknown as Room);
    else if (kind === "opening.upsert")
      add("openings", entity as unknown as Opening);
    else if (kind === "object.upsert")
      add("objects", entity as unknown as ObjectBox);
    else if (kind === "stair.upsert") add("stairs", entity as unknown as Stair);
    else if (kind === "void.upsert") add("voids", entity as unknown as Void);
    else
      return failure(
        "invalid_input",
        `Unknown operation '${kind}'`,
        "Use level.upsert, wall.upsert, room.upsert, opening.upsert, object.upsert, stair.upsert or void.upsert.",
      );
  }
  const diagnostics = validate(next);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length)
    return failure(
      "invalid_input",
      "Mutation would violate plan invariants",
      "Fix the reported diagnostics and retry.",
      diagnostics,
    );
  return { ...next, revision: next.revision + 1 };
};
export const failure = (
  type: string,
  message: string,
  hint: string,
  diagnostics?: readonly Diagnostic[],
): Failure => ({
  ok: false,
  schemaVersion: 1,
  error: {
    type,
    message,
    hint,
    ...(diagnostics?.length ? { diagnostics } : {}),
  },
});
export const success = <T>(
  type: string,
  data: T,
  revision?: number,
  diagnostics?: readonly Diagnostic[],
): Envelope<T> => ({
  ok: true,
  type,
  schemaVersion: 1,
  data,
  meta: {
    ...(revision === undefined ? {} : { revision }),
    ...(diagnostics?.length ? { diagnostics } : {}),
  },
});
export const loadPlan = async (path: string): Promise<HousePlan> =>
  JSON.parse(await readFile(path, "utf8")) as HousePlan;
export const savePlan = async (
  path: string,
  plan: HousePlan,
): Promise<void> => {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  await rename(temporary, absolute);
};
const esc = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export const renderSvg = (plan: HousePlan, storey: Storey): string => {
  const entities = [
    ...storey.walls.flatMap((wall) => [wall.a, wall.b]),
    ...storey.rooms.flatMap((room) => [
      { x: room.bounds.x, y: room.bounds.y },
      {
        x: room.bounds.x + room.bounds.width,
        y: room.bounds.y + room.bounds.height,
      },
    ]),
  ];
  const minX = Math.min(...entities.map((p) => p.x), 0) - 50;
  const minY = Math.min(...entities.map((p) => p.y), 0) - 50;
  const maxX = Math.max(...entities.map((p) => p.x), 100) + 50;
  const maxY = Math.max(...entities.map((p) => p.y), 100) + 50;
  const level = plan.levels.find((value) => value.id === storey.levelId);
  const walls = storey.walls
    .map(
      (wall) =>
        `<line x1="${wall.a.x}" y1="${-wall.a.y}" x2="${wall.b.x}" y2="${-wall.b.y}" stroke="black" stroke-width="${wall.thickness}"/>`,
    )
    .join("");
  const rooms = storey.rooms
    .map(
      (room) =>
        `<rect x="${room.bounds.x}" y="${-(room.bounds.y + room.bounds.height)}" width="${room.bounds.width}" height="${room.bounds.height}" fill="none" stroke="#777"/><text x="${room.bounds.x + room.bounds.width / 2}" y="${-(room.bounds.y + room.bounds.height / 2)}" text-anchor="middle">${esc(room.name)} ${(room.bounds.width * room.bounds.height) / 10000}m²</text>`,
    )
    .join("");
  const objects = storey.objects
    .map(
      (object) =>
        `<rect x="${object.center.x - object.width / 2}" y="${-(object.center.y + object.depth / 2)}" width="${object.width}" height="${object.depth}" fill="none" stroke="#555"/><path d="M${object.center.x - object.width / 2},${-(object.center.y - object.depth / 2)} L${object.center.x + object.width / 2},${-(object.center.y + object.depth / 2)} M${object.center.x - object.width / 2},${-(object.center.y + object.depth / 2)} L${object.center.x + object.width / 2},${-(object.center.y - object.depth / 2)}" stroke="#555"/><text x="${object.center.x}" y="${-object.center.y}" text-anchor="middle">${esc(object.label)}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${-maxY} ${maxX - minX} ${maxY - minY}"><g id="walls">${walls}</g><g id="rooms">${rooms}</g><g id="objects">${objects}</g><text x="${minX + 10}" y="${-maxY + 20}">${esc(level?.name ?? "Storey")}</text></svg>`;
};
