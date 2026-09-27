<overview>
Use this pattern when one CLI both retrieves evidence from a corpus and changes a plan or other authoritative state. The command boundary becomes an authority boundary, not merely an ergonomic interface.
</overview>

<pattern>
1. **Split modes**
   - `ask` is read-only and returns evidence.
   - `propose` creates a canonical, non-mutating change set.
   - `apply` accepts only an approved proposal ID or hash.

2. **Treat citations as data**
   - Every retrieved claim includes stable document URI/path, revision/hash, heading or line range, exact excerpt, and citation ID.
   - Responses and proposals cite returned IDs.
   - Evidence and assumptions are represented separately.

3. **Expose typed operations only**
   - Never accept free-form execution, arbitrary shell, or arbitrary SQL.
   - Invoke fixed executables with argument arrays.
   - Model intent maps to supported domain operations.

4. **Bind optimistic preconditions**
   - A proposal records the expected state revision.
   - Revalidate the revision immediately before apply.
   - Reject stale proposals rather than silently rebasing intent.

5. **Validate before and after**
   - Before apply: schema, identity, dependency/DAG, authorization, and policy checks.
   - After apply: verify resulting state is equivalent to the approved change set.
   - Evaluate outcomes, not a prescribed internal call sequence.

6. **Capability-gate writes**
   - Default credentials/scopes are read-only.
   - Write approval is short-lived, single-use, and bound to principal, proposal hash, target revision, and operation scope.
   - Show exact inputs, affected entities, diff, evidence, and validation result before approval.

7. **Keep append-only provenance**
   - Record request/run ID, citations and source revisions, normalized arguments, result hashes, validator version/verdict, approval identity, executor identity, and final state revision.
   - Link evidence to the exact executed effect.
</pattern>

<transport>
MCP may expose this contract for interoperability, but it must not create a second mutation path. CLI and MCP surfaces share schemas, authorization, validation, and provenance. Do not rely on server-declared behavior annotations as authorization.
</transport>

<success_criteria>
- Retrieval cannot mutate state.
- Unapproved or stale proposals cannot be applied.
- Every applied effect is traceable to evidence, approval, validation, and final state.
- No free-form execution path bypasses typed operations.
</success_criteria>
