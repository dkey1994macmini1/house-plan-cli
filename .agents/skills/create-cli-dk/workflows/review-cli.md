<required_reading>
Read now:
1. `references/agent-cli-contract.md`
2. `references/review-scorecard.md`
3. `references/evidence-and-tradeoffs.md`
4. `references/evaluation-scenarios.md`

If the CLI retrieves evidence and changes authoritative state, also read
`references/trustworthy-cli-pattern.md`.
</required_reading>

<process>
1. **Define scope**
   - Identify the executable, commands, intended consumers, and whether review covers design, implementation, or both.
   - Do not mutate files unless the user also asks for fixes.

2. **Observe the process boundary**
   - Run root and subcommand help.
   - Exercise one success, invalid input, missing auth, retryable failure where safely reproducible, empty result, and TTY-less invocation.
   - Capture stdout, stderr, and exit code separately.
   - Inspect tests and implementation only after observing behavior.

3. **Score**
   - Apply `references/review-scorecard.md`.
   - Mark each item `0`, `1`, `2`, or `N/A` with concrete evidence.
   - Do not deduct for irrelevant features such as dry-run on read-only commands.

4. **Report defects first**
   - Report only actionable issues, ordered by impact.
   - Include the failing contract, exploit/failure scenario, evidence, and smallest remediation.
   - Separate release blockers from enhancements.
   - State explicitly when no actionable defects were found.
</process>

<success_criteria>
- Findings are based on observed behavior and exact code/test evidence.
- stdout, stderr, schemas, exit codes, retries, TTY behavior, and secrets were checked.
- The score distinguishes missing requirements from non-applicable ones.
- Recommendations are minimal, concrete, and prioritized.
</success_criteria>
