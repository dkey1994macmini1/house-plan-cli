#!/usr/bin/env node
/**
 * `house-plan` command-line process.
 *
 * The CLI surface is built with `@effect/cli`. Each command is an
 * `Effect.gen` program with strongly typed errors; argument parsing,
 * help, JSON Schema output, and exit-code mapping are typed at the
 * boundary. Domain operations live in `src/modules/*` as pure FP
 * functions; Effect enters only here at the entry point.
 */
import { readFile } from "node:fs/promises";
import { Command, HelpDoc, Options, ValidationError } from "@effect/cli";
import { NodeFileSystem, NodePath, NodeTerminal } from "@effect/platform-node";
import { Console, Effect, Layer, pipe } from "effect";
import * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import * as Option from "effect/Option";
import { loadPlan, savePlan } from "./modules/filesystem/plan-file.js";
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
  operationJsonSchema,
} from "./modules/plan/schema.js";
import {
  PlanValidationError,
  renderAllLevelsToDirectory,
  renderLevelToFile,
  UnknownLevelError,
} from "./modules/render/render-service.js";

/** Tagged error used in the `E` channel of CLI handlers. */
class CommandError extends Data.TaggedError("CommandError")<{
  readonly type:
    | "invalid_input"
    | "revision_conflict"
    | "not_found"
    | "internal";
  readonly message: string;
  readonly hint: string;
  readonly diagnostics?: Parameters<typeof failure>[3];
  readonly exit: 1 | 2 | 5;
  readonly cause?: unknown;
}> {}

const fail = (error: CommandError) => Effect.fail(error);

const writeSuccess = <T>(
  type: string,
  data: T,
  revision?: number,
  diagnostics?: Parameters<typeof success>[3],
): Effect.Effect<void, never, never> =>
  Effect.sync(() => {
    process.stdout.write(
      `${JSON.stringify(success(type, data, revision, diagnostics))}\n`,
    );
  });

const writeFailureAndExit = (error: CommandError) =>
  Effect.sync(() => {
    process.stderr.write(
      `${JSON.stringify(
        failure(error.type, error.message, error.hint, error.diagnostics),
      )}\n`,
    );
    process.exitCode = error.exit;
  });

const loadPlanFromDisk = (path: string) =>
  Effect.tryPromise({
    try: () => loadPlan(path),
    catch: (cause) =>
      new CommandError({
        type: "invalid_input",
        message: `Cannot read plan at '${path}': ${String(cause)}`,
        hint: "Provide a readable HousePlan JSON file path.",
        exit: 2,
      }),
  });

const savePlanToDisk = (path: string, plan: Parameters<typeof savePlan>[1]) =>
  Effect.tryPromise({
    try: () => savePlan(path, plan),
    catch: (cause) =>
      new CommandError({
        type: "internal",
        message: `Cannot write plan at '${path}': ${String(cause)}`,
        hint: "Check filesystem permissions.",
        exit: 1,
        cause,
      }),
  });

const initHandler = ({ out }: { readonly out: string }) =>
  Effect.gen(function* () {
    yield* savePlanToDisk(out, emptyPlan());
    yield* writeSuccess("plan.initialized", { path: out }, 0);
  });

const operationsFile = Options.text("input");
const readOperations = (path: string) =>
  Effect.gen(function* () {
    const text = yield* Effect.tryPromise({
      try: () => readFile(path, "utf8"),
      catch: (cause) =>
        new CommandError({
          type: "invalid_input",
          message: `Cannot read operation document '${path}'`,
          hint: `Provide a readable JSON file: ${String(cause)}`,
          exit: 2,
        }),
    });
    return yield* Effect.try({
      try: (): unknown => JSON.parse(text),
      catch: (cause) =>
        new CommandError({
          type: "invalid_input",
          message: "Operation document is not valid JSON",
          hint: `Pass a JSON array of HousePlan operations: ${String(cause)}`,
          exit: 2,
        }),
    });
  });
const revisionFlag = Options.integer("expected-revision").pipe(
  Options.optional,
);
const dryRunFlag = Options.boolean("dry-run").pipe(Options.withDefault(false));

const applyHandler = ({
  plan: planPath,
  input,
  expectedRevision,
  dryRun,
}: {
  readonly plan: string;
  readonly input: string;
  readonly expectedRevision: Option.Option<number>;
  readonly dryRun: boolean;
}) =>
  Effect.gen(function* () {
    const rawOperations = yield* readOperations(input);
    const decoded = decodeOperations(rawOperations);
    if (decoded._tag === "Left") {
      yield* fail(
        new CommandError({
          type: "invalid_input",
          message: `Operation document does not match the HousePlan schema: ${decoded.left}`,
          hint: "Pass a JSON array of HousePlan operations.",
          exit: 2,
        }),
      );
      return;
    }
    if (Option.isNone(expectedRevision)) {
      yield* fail(
        new CommandError({
          type: "invalid_input",
          message: "apply requires --expected-revision",
          hint: "Pass the current plan revision.",
          exit: 2,
        }),
      );
      return;
    }
    const plan = yield* loadPlanFromDisk(planPath);
    const result = apply(plan, expectedRevision.value, decoded.right);
    if ("ok" in result) {
      const exitCode: 2 | 5 =
        result.error.type === "revision_conflict" ||
        result.error.type === "not_found"
          ? 5
          : 2;
      yield* fail(
        new CommandError({
          type: exitCode === 5 ? "revision_conflict" : "invalid_input",
          message: result.error.message,
          hint: result.error.hint,
          ...(result.error.diagnostics !== undefined
            ? { diagnostics: result.error.diagnostics }
            : {}),
          exit: exitCode,
        }),
      );
      return;
    }
    const diagnostics = validate(result);
    const hasErrors = diagnostics.some((d) => d.severity === "error");
    if (hasErrors) {
      yield* fail(
        new CommandError({
          type: "invalid_input",
          message: "Mutation would violate plan invariants",
          hint: "Fix diagnostics and retry; no changes were written.",
          diagnostics,
          exit: 2,
        }),
      );
      return;
    }
    if (dryRun) {
      yield* writeSuccess(
        "plan.dry_run",
        { plan: result },
        plan.revision,
        diagnostics,
      );
      return;
    }
    yield* savePlanToDisk(planPath, result);
    yield* writeSuccess(
      "plan.applied",
      { plan: result },
      result.revision,
      diagnostics,
    );
  });

const validateHandler = ({ plan: planPath }: { readonly plan: string }) =>
  Effect.gen(function* () {
    const plan = yield* loadPlanFromDisk(planPath);
    const diagnostics = validate(plan);
    yield* writeSuccess(
      "plan.validation",
      { valid: !diagnostics.some((d) => d.severity === "error") },
      plan.revision,
      diagnostics,
    );
  });

const reportHandler = ({ plan: planPath }: { readonly plan: string }) =>
  Effect.gen(function* () {
    const plan = yield* loadPlanFromDisk(planPath);
    const diagnostics = validate(plan);
    yield* writeSuccess(
      "plan.report",
      {
        plan: resolvePlan(plan),
        valid: !diagnostics.some((d) => d.severity === "error"),
      },
      plan.revision,
      diagnostics,
    );
  });

const renderHandler = ({
  plan: planPath,
  level,
  out,
  allLevels,
  outDir,
}: {
  readonly plan: string;
  readonly level: Option.Option<string>;
  readonly out: Option.Option<string>;
  readonly allLevels: boolean;
  readonly outDir: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const plan = yield* loadPlanFromDisk(planPath);
    if (allLevels) {
      if (Option.isNone(outDir)) {
        yield* fail(
          new CommandError({
            type: "invalid_input",
            message: "render --all-levels requires --out-dir",
            hint: "Pass --out-dir with a directory path.",
            exit: 2,
          }),
        );
        return;
      }
      const files = yield* Effect.tryPromise({
        try: () => renderAllLevelsToDirectory(plan, outDir.value),
        catch: (cause) =>
          cause instanceof PlanValidationError
            ? new CommandError({
                type: "invalid_input",
                message: "Plan has validation errors",
                hint: "Fix diagnostics and retry.",
                diagnostics: cause.diagnostics,
                exit: 2,
                cause,
              })
            : new CommandError({
                type: "internal",
                message: String(cause),
                hint: "Check render output path and permissions.",
                exit: 1,
                cause,
              }),
      });
      yield* writeSuccess(
        "plan.rendered_all_levels",
        { directory: outDir.value, files },
        plan.revision,
      );
      return;
    }
    if (Option.isNone(level) || Option.isNone(out)) {
      yield* fail(
        new CommandError({
          type: "invalid_input",
          message: "render requires --level LEVEL and --out FILE",
          hint: "Pass --level and --out together, or --all-levels with --out-dir.",
          exit: 2,
        }),
      );
      return;
    }
    const rendered = yield* Effect.tryPromise({
      try: () => renderLevelToFile(plan, level.value, out.value),
      catch: (cause) =>
        cause instanceof PlanValidationError
          ? new CommandError({
              type: "invalid_input",
              message: "Plan has validation errors",
              hint: "Fix diagnostics and retry.",
              diagnostics: cause.diagnostics,
              exit: 2,
              cause,
            })
          : cause instanceof UnknownLevelError
            ? new CommandError({
                type: "not_found",
                message: cause.message,
                hint: "Create the level or fix the argument.",
                exit: 5,
                cause,
              })
            : new CommandError({
                type: "internal",
                message: String(cause),
                hint: "Check render output path and permissions.",
                exit: 1,
                cause,
              }),
    });
    yield* writeSuccess("plan.rendered", rendered, plan.revision);
  });

const commandsHandler = () =>
  writeSuccess("commands", {
    commands: [
      "init --out FILE",
      "apply --plan FILE --input FILE --expected-revision N [--dry-run]",
      "validate --plan FILE",
      "render --plan FILE --level LEVEL --out FILE",
      "render --plan FILE --all-levels --out-dir DIR",
      "report --plan FILE",
      "commands",
      "schema",
    ],
    exitCodes: {
      "0": "success",
      "1": "internal error",
      "2": "invalid input or plan has validation errors",
      "5": "revision conflict or unknown level",
    },
  });

const schemaHandler = () =>
  Effect.gen(function* () {
    const value = operationJsonSchema();
    yield* Effect.sync(() => {
      process.stdout.write(`${JSON.stringify(success("schema", value))}\n`);
    });
  });

const initCommand = Command.make(
  "init",
  { out: Options.text("out") },
  initHandler,
).pipe(
  Command.withDescription("Create an empty HousePlan JSON file at --out."),
);

const applyCommand = Command.make(
  "apply",
  {
    plan: Options.file("plan"),
    input: operationsFile,
    expectedRevision: revisionFlag,
    dryRun: dryRunFlag,
  },
  applyHandler,
).pipe(
  Command.withDescription(
    "Apply a JSON operation document to a plan (transactional; requires --expected-revision).",
  ),
);

const validateCommand = Command.make(
  "validate",
  { plan: Options.file("plan") },
  validateHandler,
).pipe(
  Command.withDescription(
    "Validate a plan; print diagnostics and a valid flag.",
  ),
);

const renderCommand = Command.make(
  "render",
  {
    plan: Options.file("plan"),
    level: Options.text("level").pipe(Options.optional),
    out: Options.text("out").pipe(Options.optional),
    allLevels: Options.boolean("all-levels").pipe(Options.withDefault(false)),
    outDir: Options.text("out-dir").pipe(Options.optional),
  },
  renderHandler,
).pipe(
  Command.withDescription(
    "Render a single level to SVG (--level + --out) or all levels to a directory (--all-levels + --out-dir).",
  ),
);

const reportCommand = Command.make(
  "report",
  { plan: Options.file("plan") },
  reportHandler,
).pipe(Command.withDescription("Print the resolved plan plus diagnostics."));

const commandsCommand = Command.make("commands", {}, commandsHandler).pipe(
  Command.withDescription("List command grammar and exit-code semantics."),
);

const schemaCommand = Command.make("schema", {}, schemaHandler).pipe(
  Command.withDescription("Emit the JSON Schema for HousePlan operations."),
);

const housePlanCommand = Command.make("house-plan").pipe(
  Command.withDescription(
    "Deterministic 2D house-plan geometry and validation CLI for LLM agents.",
  ),
  Command.withSubcommands([
    initCommand,
    applyCommand,
    validateCommand,
    renderCommand,
    reportCommand,
    commandsCommand,
    schemaCommand,
  ]),
);

const cli = Command.run(housePlanCommand, {
  name: "house-plan",
  version: "0.1.0",
});

const cliProgram = Console.consoleWith((console) =>
  pipe(
    cli([
      process.argv[0] ?? "node",
      process.argv[1] ?? "house-plan",
      ...process.argv.slice(2),
    ]),
    // @effect/cli prints ValidationError prose before failing. The adapter owns
    // stderr so every failure is emitted exactly once as a JSON envelope.
    Console.withConsole({ ...console, error: () => Effect.void }),
    Effect.catchAllCause((cause) =>
      Option.match(Cause.failureOption(cause), {
        onSome: (error) =>
          error instanceof CommandError
            ? writeFailureAndExit(error)
            : writeFailureAndExit(
                new CommandError({
                  type: "invalid_input",
                  message: ValidationError.isValidationError(error)
                    ? HelpDoc.toAnsiText(error.error).trim()
                    : String(error),
                  hint: "Run house-plan --help for valid arguments and flags.",
                  exit: 2,
                }),
              ),
        onNone: () =>
          writeFailureAndExit(
            new CommandError({
              type: "internal",
              message: String(cause),
              hint: "Report this unexpected failure.",
              exit: 1,
              cause,
            }),
          ),
      }),
    ),
  ),
);

const mainLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  NodeTerminal.layer,
  NodePath.layer,
);

Effect.runPromise(cliProgram.pipe(Effect.provide(mainLayer)));
