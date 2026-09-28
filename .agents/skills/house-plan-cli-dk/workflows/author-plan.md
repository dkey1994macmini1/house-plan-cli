# Workflow: Author a HousePlan

<required_reading>
Read `references/cli-contract.md` and `references/operations.md`. Query the running CLI with `commands`, `schema`, and `apply --help` when uncertain about installed version or argument shape.
</required_reading>

<process>
1. **Choose source and output.** Work from the repo root; run `pnpm build` then `node dist/bin.js ...` for parseable JSON. Confirm that the target plan path is new before `init`; if existing, inspect it instead of reinitializing. Keep scratch operations and drafts outside tracked project files unless the user wants them committed. Do not use unrelated `out/` artifacts.
2. **Create or inspect.** For a new plan: `node dist/bin.js init --out plan.json`; read its returned revision 0. For an existing plan: `node dist/bin.js report --plan plan.json`; inspect `data.plan.revision`, levels, storeys and `meta.diagnostics`. Do not confuse `report`'s resolved plan with the persisted JSON.
3. **Make explicit design choices.** Translate requirements into named levels, orthogonal centerline walls, room seed points strictly inside zones, accessible doors, objects and paired stairs/voids where needed. Put an operation **array** in `ops.json` following `schema`; order level upserts before dependent entities. To modify an existing plan, include only the necessary upserts, not the entire previous batch.
4. **Preview.** `node dist/bin.js apply --plan plan.json --input ops.json --expected-revision N --dry-run`. Parse stdout if exit 0. Examine `meta.diagnostics` and proposed `data.plan`; preview does not write or advance the on-disk revision. On exit 2 use stderr's `error.diagnostics` to revise the operations file. On exit 5 reread plan and re-evaluate the proposal.
5. **Commit once.** With the unchanged actual revision N, run the same `apply` without `--dry-run`. Read `data.plan.revision` / `meta.revision`; a successful accepted batch advances once. On failure, do not report success or reuse the proposal blindly. Read back the persisted plan via `report` to confirm the intended entities/revision.
6. **Validate and render.** `node dist/bin.js validate --plan plan.json`; require `data.valid === true`, inspect warnings. For each requested level run `render --plan plan.json --level LEVEL --out FILE.svg`, or `render --plan plan.json --all-levels --out-dir DIR`. Read the returned file paths and verify files exist. Return the plan path, revision, SVG path(s), diagnostics and any scope limits to the user.
</process>

<success_criteria>
- No existing plan was overwritten by initialization; the accepted batch and read-back match the user's intended layout.
- Final `validate.data.valid` is true; warnings are explicitly described, not silently ignored.
- Every requested output was actually rendered and checked on disk. Invalid or incomplete drafts are reported honestly.
</success_criteria>
