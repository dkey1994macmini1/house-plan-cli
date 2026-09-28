export type Point = Readonly<{ x: number; y: number }>;
export type Bounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;
export type Severity = "error" | "warning";
export type Named = Readonly<{ id: string; name: string }>;

export type Diagnostic = Readonly<{
  code: string;
  severity: Severity;
  message: string;
  location?: Readonly<Record<string, string>>;
  measured?: Readonly<{ value: number; unit: "cm"; limit?: number }>;
  suggestion?: string;
}>;

export type Wall = Named &
  Readonly<{
    a: Point;
    b: Point;
    thickness: number;
    kind: "exterior" | "interior";
  }>;
export type Room = Named & Readonly<{ type: string; seed: Point }>;
export type Opening = Named &
  Readonly<{
    wall: string;
    type: "door" | "window";
    variant: string;
    offset: number;
    width: number;
    hinge?: "left" | "right";
    swing?: "in" | "out";
  }>;
export type ObjectBox = Named &
  Readonly<{
    label: string;
    center: Point;
    width: number;
    depth: number;
    rotation: 0 | 90 | 180 | 270;
    clearance?: Readonly<{
      front: number;
      left: number;
      right: number;
      back: number;
    }>;
  }>;
export type Stair = Named &
  Readonly<{ run: string; direction: "up" | "down"; bounds: Bounds }>;
export type Void = Named & Readonly<{ bounds: Bounds }>;
export type Annotation = Named & Readonly<{ text: string; at: Point }>;
export type Dimension = Named &
  Readonly<{ a: Point; b: Point; offset: number }>;

export type Storey = Readonly<{
  id: string;
  levelId: string;
  walls: readonly Wall[];
  rooms: readonly Room[];
  openings: readonly Opening[];
  objects: readonly ObjectBox[];
  stairs: readonly Stair[];
  voids: readonly Void[];
  annotations: readonly Annotation[];
  dimensions: readonly Dimension[];
}>;
export type Level = Named & Readonly<{ elevationCm: number; order: number }>;
export type HousePlan = Readonly<{
  schemaVersion: 1;
  revision: number;
  levels: readonly Level[];
  storeys: readonly Storey[];
}>;
export type ResolvedRoom = Room &
  Readonly<{
    bounds: Bounds;
    areaCm2: number;
    perimeterCm: number;
    face: readonly Point[];
  }>;
export type ResolvedStorey = Omit<Storey, "rooms"> &
  Readonly<{ rooms: readonly ResolvedRoom[]; bounds: Bounds }>;
export type ResolvedPlan = Omit<HousePlan, "storeys"> &
  Readonly<{ storeys: readonly ResolvedStorey[] }>;
export type Operation = Readonly<Record<string, unknown>>;
export type Envelope<T> = Readonly<{
  ok: true;
  type: string;
  schemaVersion: 1;
  data: T;
  meta: Readonly<{ revision?: number; diagnostics?: readonly Diagnostic[] }>;
}>;
export type Failure = Readonly<{
  ok: false;
  schemaVersion: 1;
  error: Readonly<{
    type: string;
    message: string;
    hint: string;
    diagnostics?: readonly Diagnostic[];
  }>;
}>;
