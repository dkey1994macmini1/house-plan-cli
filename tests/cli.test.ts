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
    expect(envelope.data["$schema"]).toBe(
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
});
