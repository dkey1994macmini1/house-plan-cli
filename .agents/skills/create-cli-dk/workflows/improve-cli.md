<required_reading>
Read now:
1. `references/agent-cli-contract.md`
2. `references/review-scorecard.md`
3. `references/evidence-and-tradeoffs.md`
4. `templates/cli-contract.md`

If the CLI retrieves evidence and changes authoritative state, also read
`references/trustworthy-cli-pattern.md`.
</required_reading>

<process>
1. **Baseline current behavior**
   - Run existing tests and representative CLI invocations.
   - Preserve compatible behavior unless the user explicitly approves a breaking change.
   - Complete the contract template with current and target behavior.

2. **Prioritize**
   - Fix release blockers first: mixed stdout/stderr, invalid JSON, leaked secrets, hanging prompts, ambiguous exit codes, unbounded output, or unsafe destructive defaults.
   - Then address discoverability, projection, compact output, introspection, and observability.
   - Skip features that do not serve a real operation.

3. **Change through tests**
   - Add one failing process-level test per behavior gap.
   - Implement the smallest change that passes.
   - Keep compatibility aliases only when they have a clear removal or support policy.
   - Version the response schema for breaking output changes.

4. **Verify migration**
   - Run old and new usage paths where compatibility is expected.
   - Verify structured success/error envelopes, exit mapping, help examples, non-interactive behavior, and secret redaction.
   - Update documentation and generated schemas together with behavior.
</process>

<success_criteria>
- Every changed behavior has a failing-then-passing process-level test.
- No unapproved breaking changes were introduced.
- Blockers are fixed before optional ergonomics.
- Documentation, schemas, and runtime output agree.
- Full relevant verification passes.
</success_criteria>
