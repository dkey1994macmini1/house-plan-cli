/**
 * Artifact filesystem safety — render/export writes never clobber protected
 * inputs and never escape the canonical output root (handoff §4.1, §4.2).
 *
 * Layer boundary: filesystem adapter for the render module. Domain names
 * (e.g. level names) are separated from filenames by `safeLevelSlug`;
 * every guarded write compares the target against its protected inputs by
 * realpath AND file identity (hardlinks), so a plain text/`resolve()`
 * comparison is never the only defence.
 */
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export type ArtifactSafetyKind =
  | "source-alias"
  | "unsafe-level-name"
  | "output-exists"
  | "output-escape";

/** Structured refusal — the CLI maps it to `invalid_input` (exit 2). */
export class ArtifactSafetyError extends Error {
  constructor(
    readonly kind: ArtifactSafetyKind,
    readonly rejection: { message: string; hint: string },
  ) {
    super(rejection.message);
    this.name = "ArtifactSafetyError";
  }
}

const tryStat = async (
  path: string,
): Promise<
  (import("node:fs").Stats & { isSymbolicLink(): boolean }) | undefined
> => {
  try {
    return (await lstat(path)) as import("node:fs").Stats & {
      isSymbolicLink(): boolean;
    };
  } catch {
    return undefined;
  }
};

const tryRealpath = async (path: string): Promise<string | undefined> => {
  try {
    return await realpath(path);
  } catch {
    return undefined;
  }
};

/**
 * Identity of a possibly-symlinked existing file, following the link:
 * `stat` resolves symlinks, so a symlinked output that points at a
 * protected input is detected (handoff: resolve() alone is insufficient).
 */
const followingStat = async (
  path: string,
): Promise<import("node:fs").Stats | undefined> => {
  try {
    return await stat(path);
  } catch {
    return undefined;
  }
};

/** True when two paths name THE SAME existing file (symlink or hardlink alias). */
const sameExistingFile = async (
  left: string,
  right: string,
): Promise<boolean> => {
  const leftAbs = resolve(left);
  const rightAbs = resolve(right);
  if (leftAbs === rightAbs) return true;
  const [leftTarget, rightTarget] = await Promise.all([
    followingStat(leftAbs),
    followingStat(rightAbs),
  ]);
  // Both must name the same existing regular file; a missing input has no
  // alias (nothing to protect) and a directory match is not a file alias.
  if (!leftTarget?.isFile() || !rightTarget?.isFile()) return false;
  const [leftReal, rightReal] = await Promise.all([
    tryRealpath(leftAbs),
    tryRealpath(rightAbs),
  ]);
  if (leftReal !== undefined && leftReal === rightReal) return true;
  return (
    leftTarget.dev === rightTarget.dev && leftTarget.ino === rightTarget.ino
  );
};

export interface GuardedWriteOptions {
  /** Inputs this operation must never overwrite (plan, checks, ops…). */
  readonly protect: readonly string[];
  /** Replace an existing generated artifact; protected inputs stay protected. */
  readonly overwrite: boolean;
}

/**
 * Writes `contents` to `path` after: (1) alias refusal against every
 * protected input, (2) existing-output refusal unless explicitly allowed.
 * Preflight happens before any write — a refusal never leaves partial bytes.
 */
export const guardedWriteFile = async (
  path: string,
  contents: string | Uint8Array,
  options: GuardedWriteOptions,
): Promise<void> => {
  const target = resolve(path);
  for (const protectedPath of options.protect) {
    if (await sameExistingFile(target, protectedPath)) {
      throw new ArtifactSafetyError("source-alias", {
        message: `Refusing to write an artifact over the protected input '${protectedPath}'`,
        hint: "Choose an output path that is not the plan/inputs of this command.",
      });
    }
  }
  const existing = await tryStat(target);
  if (existing !== undefined && !options.overwrite) {
    throw new ArtifactSafetyError("output-exists", {
      message: `Output artifact already exists at '${target}'`,
      hint: "Pass --overwrite to replace generated artifacts; protected inputs are never replaced.",
    });
  }
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, contents);
};

/** Windows reserved device names (case-insensitive, stem-level). */
const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

/**
 * Level display name → safe filename stem. Separator-path names decode
 * deterministically ("parter\\podloga" → "parter--podloga"); whole-segment
 * ".." is an escape attempt and is refused (never silently renamed);
 * "." segments map to "_"; control characters and Windows-reserved stems
 * are neutralised; collisions get a deterministic "-2"/"-3" suffix.
 * The plan keeps the authored level name — only the FILENAME is derived.
 */
export const safeLevelSlug = (
  name: string,
  taken: ReadonlySet<string> = new Set<string>(),
): string => {
  const segments = name
    .split(/[\\/]+/u)
    .filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "..")) {
    throw new ArtifactSafetyError("unsafe-level-name", {
      message: `Level name '${name}' would encode a parent-directory escape`,
      hint: "Rename the level in the plan; file names must stay inside the export directory.",
    });
  }
  let stem = segments
    .map((segment) => (segment === "." ? "_" : segment))
    .join("--")
    .replace(/[^\P{C}]/gu, "_")
    .replace(/[. ]+$/u, "");
  if (stem.length === 0) stem = "level";
  if (WINDOWS_RESERVED_NAMES.has(stem.split(".")[0]?.toUpperCase() ?? "")) {
    stem = `_${stem}`;
  }
  if (taken.has(stem)) {
    let suffix = 2;
    while (taken.has(`${stem}-${suffix}`)) suffix += 1;
    stem = `${stem}-${suffix}`;
  }
  return stem;
};

/**
 * Joins a relative filename onto the canonical output root and asserts the
 * result stays inside it (belt in addition to slug sanitising).
 */
export const confinedJoin = (
  root: string,
  ...names: readonly string[]
): string => {
  const rootAbsolute = resolve(root);
  const target = resolve(join(rootAbsolute, ...names));
  if (target !== rootAbsolute && !target.startsWith(`${rootAbsolute}${sep}`)) {
    throw new ArtifactSafetyError("output-escape", {
      message: `Computed artifact path '${target}' escapes the output root '${rootAbsolute}'`,
      hint: "This is a bug in path derivation; report it with the level names involved.",
    });
  }
  return target;
};

export interface RenderWriteOptions {
  readonly protectInputs?: readonly string[];
  readonly overwrite?: boolean;
}

export const defaultRenderWriteOptions: RenderWriteOptions = {};

/**
 * All-levels export: stage every artifact under a fresh directory, publish
 * the complete set only after all writes succeed, then remove the staging
 * directory. A failed run leaves no half-published bundle.
 */
export const stagePublishAll = async (
  directory: string,
  writeArtifacts: (stagingDirectory: string) => Promise<readonly string[]>,
  options: RenderWriteOptions,
): Promise<readonly string[]> => {
  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  const existingEntries = await readdir(root);
  if (existingEntries.length > 0 && !(options.overwrite ?? false)) {
    throw new ArtifactSafetyError("output-exists", {
      message: `Output directory '${root}' is not empty`,
      hint: "Pass --overwrite to republish the export bundle.",
    });
  }
  const staging = await mkdtemp(join(root, ".staging-"));
  try {
    const stagedNames = await writeArtifacts(staging);
    const published: string[] = [];
    for (const name of stagedNames) {
      const target = confinedJoin(root, name);
      await rm(target, { recursive: true, force: true });
      await rename(join(staging, name), target);
      published.push(target);
    }
    return published;
  } catch (cause) {
    await rm(staging, { recursive: true, force: true });
    throw cause;
  }
};
