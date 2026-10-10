/**
 * Presentation colors. Floor tints key on the authored room `type` string;
 * unknown types fall back to the neutral paper tone. Nothing here is tied to
 * one plan, name, language or count.
 */

export type PresentationPalette = Readonly<{
  background: string;
  floorFallback: string;
  floors: Readonly<Record<string, string>>;
  furniture: Readonly<{
    fill: string;
    outline: string;
    label: string;
  }>;
  wall: string;
  door: string;
  window: string;
  openingCut: string;
  labelPrimary: string;
  labelArea: string;
  heading: string;
  headingMuted: string;
  panel: Readonly<{ background: string; border: string; text: string }>;
}>;

export const presentationPalette: PresentationPalette = {
  background: "#faf9f6",
  floorFallback: "#eee9df",
  floors: {
    bedroom: "#ede7e0",
    bathroom: "#e4eef0",
    kitchen: "#f1e7d6",
    dining: "#f1e7d6",
    living: "#f1e7d6",
    office: "#e9efe1",
    circulation: "#f4f1eb",
    garage: "#e1e5e4",
    utility: "#eee9df",
    porch: "#e6dccb",
  },
  furniture: {
    fill: "#d7d3c8",
    outline: "#7d8981",
    label: "#45503f",
  },
  wall: "#394847",
  door: "#687f80",
  window: "#79a9b5",
  openingCut: "#faf9f6",
  labelPrimary: "#455650",
  labelArea: "#8a6d3b",
  heading: "#394847",
  headingMuted: "#66746e",
  panel: {
    background: "#f4f2ec",
    border: "#c9c4b6",
    text: "#4d554f",
  },
};

export const floorFillFor = (
  roomTypesOnFace: readonly string[],
  palette: PresentationPalette,
): string => {
  const known = roomTypesOnFace
    .toSorted()
    .map((type) => palette.floors[type])
    .find((fill): fill is string => fill !== undefined);
  return known ?? palette.floorFallback;
};
