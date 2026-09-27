---
name: create-cli-dk
description: Use when designing, implementing, reviewing, or improving a command-line interface intended for AI agents, automation, CI, or reliable programmatic composition.
---

<objective>
Create and improve CLIs that agents can discover, invoke, parse, retry, and debug without guesswork. Treat the CLI as a versioned API: command grammar, stdout, stderr, exit codes, schemas, and side effects are all public contracts.

It incorporates lessons from building `image-search`, reviewing `agynio/pexels-cli`, testing the `english-lessons` CLI, and designing trustworthy knowledge-and-planning command boundaries.
</objective>

<essential_principles>
## Unavoidable contract

1. **Machine output is an API**
   - Agent-first CLIs default to JSON. Every command supports `--json`.
   - Success uses a stable envelope with `ok`, `type`, `data`, and `schemaVersion`.
   - stdout contains results only. stderr contains errors, warnings, progress, and diagnostics only.
   - Errors on stderr are structured and include `type`, `message`, and a recovery `hint`.

2. **Exit codes are control flow**
   - Prefer: `0` success, `2` invalid input, `3` auth/permission, `4` retryable/transient, `5` not-found/conflict.
   - Document deviations. Never require parsing prose to distinguish retry from permanent failure.

3. **Non-interactive and replayable**
   - Never prompt by default. TTY-less execution must work.
   - Writes are idempotent or expose explicit conflict policy.
   - Destructive actions require preview plus explicit confirmation bypass such as `--force`.
   - Do not add `--dry-run` to read-only commands merely to satisfy a checklist.

4. **Bounded and context-efficient**
   - Retrieval is bounded with `--limit`; add cursor pagination or `--all` when the API supports it.
   - Support projection with `--fields` or `--select`.
   - Support compact JSON with `--raw`; use JSONL/NDJSON for streams and batch output.
   - Return summaries by default and details explicitly.

5. **Self-describing**
   - Root and subcommand `--help` contain copy-pasteable examples.
   - Prefer consistent noun-verb command grammar for broad resource CLIs.
   - Mature agent CLIs expose machine discovery (`commands --json`) and JSON Schema (`schema --command ...`).

6. **Errors teach recovery**
   - State what failed, why, the failing safe identifier/input, and the next valid action.
   - Never include credentials, authorization headers, signed URLs, or raw sensitive responses.

7. **Implementation follows the repository**
   - Inspect local runtime, packaging, test, naming, and documentation conventions first.
   - Use existing dependencies and HTTP/data layers. New dependencies require explicit approval and package vetting.
   - Write contract tests before implementation and observe them fail for the intended reason.

8. **Evidence-backed writes need an authority boundary**
   - For CLIs that retrieve knowledge and mutate plans/state, separate read-only evidence retrieval, non-mutating proposals, and approved application.
   - Bind proposals to source citations and expected state revisions; revalidate before applying.
   - Read `references/trustworthy-cli-pattern.md` whenever a CLI combines retrieval with state changes.
</essential_principles>

<quick_start>
Identify intent, then follow the matching workflow:

- New CLI or new command surface → `workflows/create-cli.md`
- Defect-first compatibility review → `workflows/review-cli.md`
- Targeted upgrade of an existing CLI → `workflows/improve-cli.md`

Before writing code, read `references/agent-cli-contract.md` and produce the contract using `templates/cli-contract.md`.
</quick_start>

<routing>
| User intent | Workflow |
|---|---|
| Create, build, design, add a CLI | `workflows/create-cli.md` |
| Audit, review, score, check agent-friendliness | `workflows/review-cli.md` |
| Improve, modernize, fix, make agent-friendly | `workflows/improve-cli.md` |

If intent is ambiguous, ask one focused question. After reading the selected workflow, follow it exactly.
</routing>

<reference_index>
- `references/agent-cli-contract.md` — normative output, error, command, safety, and observability contract
- `references/evidence-and-tradeoffs.md` — practical lessons and justified exceptions
- `references/review-scorecard.md` — 14-point assessment and release blockers
- `references/evaluation-scenarios.md` — representative behavior tests
- `references/trustworthy-cli-pattern.md` — authority boundary for evidence-backed state changes
- `templates/cli-contract.md` — contract to complete before implementation
</reference_index>

<workflows_index>
| Workflow | Purpose |
|---|---|
| `create-cli.md` | Design and implement a new agent-first CLI |
| `review-cli.md` | Review a CLI against observable behavior |
| `improve-cli.md` | Close identified contract gaps with minimal changes |
</workflows_index>

<success_criteria>
- The selected workflow was followed.
- Behavior is tested through the real process boundary, not only helper functions.
- JSON output and structured errors are schema-stable and stream-safe.
- Help, exit codes, non-interactive operation, and secret handling are verified.
- The implementation makes the smallest repository-consistent change.
</success_criteria>
