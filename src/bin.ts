#!/usr/bin/env node
// @ts-nocheck
import { readFile, writeFile } from "node:fs/promises";
import { Effect } from "effect";
import {
  apply,
  emptyPlan,
  failure,
  loadPlan,
  renderSvg,
  savePlan,
  success,
  validate,
} from "./house-plan.js";

const output = (value: unknown, code = 0): never => {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exit(code);
};
const error = (value: ReturnType<typeof failure>, code: number): never => {
  process.stderr.write(`${JSON.stringify(value)}\n`);
  process.exit(code);
};
const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const help = (): never =>
  output(
    success("help", {
      commands: [
        "init --out plan.json",
        "apply --plan plan.json --input operations.json --expected-revision N [--dry-run]",
        "validate --plan plan.json",
        "render --plan plan.json --level LEVEL --out level.svg",
        "report --plan plan.json",
        "commands",
        "schema",
      ],
      examples: [
        "house-plan init --out plan.json",
        "house-plan apply --plan plan.json --input operations.json --expected-revision 0",
        "house-plan render --plan plan.json --level parter --out parter.svg",
      ],
    }),
  );
const main = async (): Promise<void> => {
  const command = process.argv[2];
  if (!command || command === "--help" || command === "help") help();
  if (command === "commands")
    output(
      success("commands", {
        commands: ["init", "apply", "validate", "render", "report", "schema"],
      }),
    );
  if (command === "schema")
    output(
      success("schema", {
        schemaVersion: 1,
        unit: "cm",
        precision: 0.1,
        operations: [
          "level.upsert",
          "wall.upsert",
          "room.upsert",
          "opening.upsert",
          "object.upsert",
          "stair.upsert",
          "void.upsert",
        ],
      }),
    );
  if (command === "init") {
    const out = arg("--out");
    if (!out)
      error(
        failure(
          "invalid_input",
          "Missing --out",
          "Run house-plan init --out plan.json",
        ),
        2,
      );
    await savePlan(out, emptyPlan());
    output(success("plan.initialized", { path: out }, 0));
  }
  const path = arg("--plan");
  if (!path)
    error(
      failure("invalid_input", "Missing --plan", "Pass --plan plan.json"),
      2,
    );
  const plan = await loadPlan(path);
  if (command === "validate") {
    const diagnostics = validate(plan);
    output(
      success(
        "plan.validation",
        { valid: !diagnostics.some((d) => d.severity === "error") },
        plan.revision,
        diagnostics,
      ),
    );
  }
  if (command === "report") {
    const diagnostics = validate(plan);
    output(
      success(
        "plan.report",
        {
          levels: plan.levels.map((level) => ({
            name: level.name,
            elevationCm: level.elevationCm,
            storey: plan.storeys.find((storey) => storey.levelId === level.id),
          })),
          valid: !diagnostics.some((d) => d.severity === "error"),
        },
        plan.revision,
        diagnostics,
      ),
    );
  }
  if (command === "apply") {
    const input = arg("--input");
    const revision = Number(arg("--expected-revision"));
    if (!input || !Number.isInteger(revision))
      error(
        failure(
          "invalid_input",
          "apply requires --input and integer --expected-revision",
          "Pass a JSON operations file and current plan revision.",
        ),
        2,
      );
    const operations = JSON.parse(await readFile(input, "utf8")) as Record<
      string,
      unknown
    >[];
    const result = apply(plan, revision, operations);
    if ("ok" in result && !result.ok)
      error(result, result.error.type === "revision_conflict" ? 5 : 2);
    if (process.argv.includes("--dry-run"))
      output(
        success(
          "plan.dry_run",
          { plan: result },
          plan.revision,
          validate(result),
        ),
      );
    await savePlan(path, result);
    output(
      success(
        "plan.applied",
        { plan: result },
        result.revision,
        validate(result),
      ),
    );
  }
  if (command === "render") {
    const levelName = arg("--level");
    const out = arg("--out");
    const level = plan.levels.find((value) => value.name === levelName);
    const storey = level
      ? plan.storeys.find((value) => value.levelId === level.id)
      : undefined;
    if (!level || !storey || !out)
      error(
        failure(
          "invalid_input",
          "render requires an existing --level and --out",
          "Use report to inspect levels, then pass a writable output path.",
        ),
        2,
      );
    const diagnostics = validate(plan);
    if (diagnostics.some((d) => d.severity === "error"))
      error(
        failure(
          "invalid_input",
          "Cannot render an invalid plan",
          "Run validate and fix errors first.",
          diagnostics,
        ),
        2,
      );
    await writeFile(out, renderSvg(plan, storey), "utf8");
    output(
      success(
        "plan.rendered",
        { path: out, level: level.name },
        plan.revision,
        diagnostics,
      ),
    );
  }
  error(
    failure(
      "invalid_input",
      `Unknown command '${command}'`,
      "Run house-plan --help",
    ),
    2,
  );
};
Effect.runPromise(
  Effect.tryPromise({ try: main, catch: (cause) => cause }),
).catch((cause) =>
  error(
    failure("internal", String(cause), "Run with valid JSON and arguments."),
    1,
  ),
);
