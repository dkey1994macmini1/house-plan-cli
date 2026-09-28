# Workflow: Inspect, diagnose and render

<required_reading>
Read `references/cli-contract.md`. Read `references/operations.md` if diagnosing geometry or proposing an edit.
</required_reading>

<process>
1. Run `node dist/bin.js commands` after `pnpm build` to confirm the surface, then `node dist/bin.js report --plan FILE` to inspect `data.plan`, `data.valid`, `meta.revision`, `meta.diagnostics`. Use `validate --plan FILE` when only validity/diagnostics are needed. Neither command writes the plan.
2. Separate process status from plan validity: `validate` or `report` may exit 0 with `data.valid:false`. Sort diagnostic entries by `severity`, then group by `code` and `location`; report the measured value and suggestion when present. Do not invent a fix: choose explicit operations that preserve the user's layout intent.
3. For a failed apply, parse the **stderr** error envelope and use exit code 2 for invalid input/geometry versus 5 for conflict/not-found. On revision conflict, rerun `report` and re-evaluate against the new plan before previewing again. On geometry failure, update a separate operations JSON file, preview via `apply --dry-run` with the actual revision, then commit only if preview is acceptable. No silent geometry correction.
4. Run `validate --plan FILE` on the final persisted revision and render only after its `data.valid:true`: `render --plan FILE --level LEVEL --out FILE.svg` for a single storey, or `--all-levels --out-dir DIR` for all. Check command output and file existence; inspect the SVG in a viewer if visual quality matters. Do not treat the SVG or CLI diagnostics as engineering/legal certification.
</process>

<success_criteria>
- The diagnosis names the actual returned code, severity and location; the reported revision is current.
- An attempted correction has been previewed, committed, read back and revalidated (or explicitly remains an unresolved draft).
- Render paths and artifacts are verified before being given to the user.
</success_criteria>
