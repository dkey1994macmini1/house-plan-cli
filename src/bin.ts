#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Effect } from "effect";
import * as Either from "effect/Either";
import { loadPlan, savePlan } from "./modules/filesystem/plan-file.js";
import type { Failure, HousePlan } from "./modules/plan/index.js";
import {
  apply,
  emptyPlan,
  failure,
  resolvePlan,
  success,
  validate,
} from "./modules/plan/index.js";
import {
  decodeOperations,
  hasGridMeasurements,
  hasValidLevelOrders,
  operationJsonSchema,
} from "./modules/plan/schema.js";
import {
  renderAllLevelsToDirectory,
  renderLevelToFile,
} from "./modules/render/render-service.js";

type Exit = Readonly<{
  stream: "stdout" | "stderr";
  status: number;
  value: unknown;
}>;

const commandNames = [
  "init",
  "apply",
  "validate",
  "render",
  "report",
  "commands",
  "schema",
] as const;
const asExit = (
  stream: Exit["stream"],
  status: number,
  value: unknown,
): Exit => ({ stream, status, value });
const succeeded = <T>(type: string, data: T, revision?: number): Exit =>
  asExit("stdout", 0, success(type, data, revision));
const failed = (value: Failure, status: number): Exit =>
  asExit("stderr", status, value);
const readArgument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const hasFlag = (name: string): boolean => process.argv.includes(name);
const invalidInput = (message: string, hint: string): Exit =>
  failed(failure("invalid_input", message, hint), 2);
const isExit = (value: unknown): value is Exit =>
  typeof value === "object" && value !== null && "stream" in value;
const isFailure = (value: HousePlan | Failure): value is Failure =>
  "ok" in value && !value.ok;

const requireArgument = (name: string): string | Exit =>
  readArgument(name) ??
  invalidInput(`Missing ${name}`, `Pass ${name} with a value.`);
const jsonHelp = (): Exit =>
  succeeded("help", {
    commands: [
      "init --out plan.json",
      "apply --plan plan.json --input operations.json --expected-revision N [--dry-run]",
      "validate --plan plan.json",
      "render --plan plan.json --level LEVEL --out level.svg",
      "render --plan plan.json --all-levels --out-dir svgs",
      "report --plan plan.json",
      "commands",
      "schema",
    ],
    examples: [
      "house-plan init --out plan.json",
      "house-plan apply --plan plan.json --input operations.json --expected-revision 0",
      "house-plan render --plan plan.json --level ground --out ground.svg",
    ],
  });

const initializePlan = async (): Promise<Exit> => {
  const path = requireArgument("--out");
  if (isExit(path)) return path;
  await savePlan(path, emptyPlan());
  return succeeded("plan.initialized", { path }, 0);
};

const loadRequestedPlan = async (): Promise<HousePlan | Exit> => {
  const path = requireArgument("--plan");
  return isExit(path) ? path : loadPlan(path);
};

const validateRequestedPlan = (plan: HousePlan): Exit => {
  const diagnostics = validate(plan);
  return asExit(
    "stdout",
    0,
    success(
      "plan.validation",
      {
        valid: !diagnostics.some(
          (diagnostic) => diagnostic.severity === "error",
        ),
      },
      plan.revision,
      diagnostics,
    ),
  );
};

const reportRequestedPlan = (plan: HousePlan): Exit => {
  const diagnostics = validate(plan);
  return asExit(
    "stdout",
    0,
    success(
      "plan.report",
      {
        plan: resolvePlan(plan),
        valid: !diagnostics.some(
          (diagnostic) => diagnostic.severity === "error",
        ),
      },
      plan.revision,
      diagnostics,
    ),
  );
};

const applyRequestedOperations = async (plan: HousePlan): Promise<Exit> => {
  const inputPath = requireArgument("--input");
  const revision = Number(readArgument("--expected-revision"));
  if (isExit(inputPath)) return inputPath;
  if (!Number.isInteger(revision))
    return invalidInput(
      "apply requires integer --expected-revision",
      "Pass the current plan revision.",
    );
  let rawOperations: unknown;
  try {
    rawOperations = JSON.parse(await readFile(inputPath, "utf8"));
  } catch {
    return invalidInput(
      "Operation document is not valid JSON",
      "Pass a JSON array of HousePlan operations.",
    );
  }
  const decoded = decodeOperations(rawOperations);
  if (Either.isLeft(decoded))
    return invalidInput(
      "Operation document does not match the HousePlan schema",
      decoded.left.message,
    );
  if (!hasGridMeasurements(decoded.right))
    return invalidInput(
      "Operation dimensions must use a 0.1 cm grid",
      "Use finite centimetres with at most one decimal place.",
    );
  if (!hasValidLevelOrders(decoded.right))
    return invalidInput(
      "Level order must be an integer",
      "Pass an integer order for every level.upsert operation.",
    );
  const result = apply(plan, revision, decoded.right);
  if (isFailure(result))
    return failed(
      result,
      result.error.type === "revision_conflict" ||
        result.error.type === "not_found"
        ? 5
        : 2,
    );
  if (hasFlag("--dry-run"))
    return asExit(
      "stdout",
      0,
      success(
        "plan.dry_run",
        { plan: result },
        plan.revision,
        validate(result),
      ),
    );
  const planPath = readArgument("--plan");
  if (!planPath) return invalidInput("Missing --plan", "Pass --plan plan.json");
  await savePlan(planPath, result);
  return asExit(
    "stdout",
    0,
    success(
      "plan.applied",
      { plan: result },
      result.revision,
      validate(result),
    ),
  );
};

const renderRequestedPlan = async (plan: HousePlan): Promise<Exit> => {
  if (hasFlag("--all-levels")) {
    const directory = requireArgument("--out-dir");
    if (isExit(directory)) return directory;
    const files = await renderAllLevelsToDirectory(plan, directory);
    return succeeded(
      "plan.rendered_all_levels",
      { directory, files },
      plan.revision,
    );
  }
  const level = requireArgument("--level");
  const path = requireArgument("--out");
  if (isExit(level)) return level;
  if (isExit(path)) return path;
  const file = await renderLevelToFile(plan, level, path);
  return succeeded("plan.rendered", file, plan.revision);
};

const executePlanCommand = async (command: string): Promise<Exit> => {
  const plan = await loadRequestedPlan();
  if (isExit(plan)) return plan;
  if (command === "apply") return applyRequestedOperations(plan);
  if (command === "validate") return validateRequestedPlan(plan);
  if (command === "report") return reportRequestedPlan(plan);
  if (command === "render") return renderRequestedPlan(plan);
  return invalidInput(`Unknown command '${command}'`, "Run house-plan --help");
};

const execute = async (): Promise<Exit> => {
  const command = process.argv[2];
  if (!command || command === "--help" || command === "help") return jsonHelp();
  if (command === "commands")
    return succeeded("commands", { commands: commandNames });
  if (command === "schema") return succeeded("schema", operationJsonSchema());
  if (command === "init") return initializePlan();
  return executePlanCommand(command);
};

const writeExit = (result: Exit): void => {
  const output = `${JSON.stringify(result.value)}\n`;
  (result.stream === "stdout" ? process.stdout : process.stderr).write(output);
  process.exitCode = result.status;
};

Effect.runPromise(Effect.tryPromise({ try: execute, catch: (cause) => cause }))
  .then(writeExit)
  .catch((cause) =>
    writeExit(
      failed(
        failure(
          "internal",
          String(cause),
          "Run with valid JSON and arguments.",
        ),
        1,
      ),
    ),
  );
