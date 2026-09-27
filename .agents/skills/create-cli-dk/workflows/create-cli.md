<required_reading>
Read now:
1. `references/agent-cli-contract.md`
2. `references/evidence-and-tradeoffs.md`
3. `references/evaluation-scenarios.md`
4. `templates/cli-contract.md`

If the CLI retrieves evidence and changes authoritative state, also read
`references/trustworthy-cli-pattern.md`.
</required_reading>

<process>
1. **Establish ownership and conventions**
   - Confirm the owning repository and intended installation surface.
   - Inspect existing CLIs, runtime, package manager, tests, docs, secret handling, and executable naming.
   - Ask only about decisions that materially alter the contract.

2. **Define the contract**
   - Complete `templates/cli-contract.md`.
   - Decide command grammar, inputs, output envelope, error vocabulary, exit codes, bounded retrieval, side effects, idempotency, and credential sources.
   - Mark checklist items as applicable or deliberately not applicable; do not add ceremonial flags.

3. **Research external APIs**
   - Fetch current official documentation for every API, SDK, framework, or CLI involved.
   - Record authentication, limits, pagination, retries, required attribution, and terms that affect behavior.
   - Never infer license or attribution metadata absent from the source.

4. **Write failing contract tests**
   - Exercise the installed/real executable as a subprocess.
   - Cover root and subcommand help, stdout/stderr separation, success envelope, structured errors, exit codes, non-interactive execution, and one representative command.
   - Add fixture-backed provider/API tests; no live requests in unit tests.
   - Run each new test and confirm the expected failure before implementation.

5. **Implement minimally**
   - Keep parsing, domain behavior, transport, formatting, and process exit mapping separable.
   - Use argument arrays for subprocesses and typed/parameterized APIs for external sinks.
   - Load credentials internally from approved environment or secret storage; never interpolate them into model-visible shell commands.
   - Add retries only for explicitly transient failures and respect `Retry-After`.

6. **Document discovery**
   - Make `--help` sufficient for first use, including realistic examples and environment variables.
   - Document schemas, output modes, exit codes, partial-success semantics, and destructive behavior.
   - Explain where credentials are obtained and configured without including values.

7. **Verify**
   - Run focused tests, full relevant tests, static checks, and `--help`.
   - Exercise JSON, compact JSON, structured failure, stdin/batch where supported, and a TTY-less invocation.
   - Scan changed files and examples for secrets.
   - Test applicable scenarios from `references/evaluation-scenarios.md`.
</process>

<success_criteria>
- Contract exists before implementation and matches actual behavior.
- Every production behavior was driven by an observed failing test.
- The CLI is discoverable, parseable, non-interactive, bounded, and recoverable.
- Official API constraints and repository conventions are respected.
- All relevant checks pass without secrets or live-network unit tests.
</success_criteria>
