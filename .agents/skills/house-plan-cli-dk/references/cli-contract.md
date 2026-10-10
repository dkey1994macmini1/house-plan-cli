<contract>
`house-plan` 0.1.0 as implemented in `src/bin.ts`. Build with `pnpm build`, then invoke `node dist/bin.js` from the repo root for clean JSON. `pnpm cli` invokes the source but pnpm itself emits banners. `--help` is human-readable, not an envelope.

| Command | Inputs | Output `type` / key fields |
|---|---|---|
| `init --out FILE` | output plan path | `plan.initialized`, `data.path`, `meta.revision: 0` |
| `apply --plan FILE --input FILE --expected-revision N [--dry-run]` | JSON array on disk; no stdin | `plan.applied` or `plan.dry_run`, `data.plan`, `meta.revision`, optional `meta.diagnostics` |
| `validate --plan FILE` | plan path | `plan.validation`, `data.valid`, optional `meta.diagnostics` |
| `report --plan FILE` | plan path | `plan.report`, `data.plan` (resolved), `data.valid`, optional `meta.diagnostics` |
| `survey --plan FILE` | plan path | `plan.survey`, `data.revision`, `data.valid`, `data.levels` (compact spatial reading). Does not write the plan. |
| `render --plan FILE --level LEVEL --out FILE [--style technical|presentation] [--format svg|png] [--width N] [--allow-invalid] [--overwrite]` | level name + output path | `plan.rendered`, `data.level`, `data.path`, `data.format`; PNG also `data.width`, `data.height` |
| `render --plan FILE --all-levels --out-dir DIR [--style technical|presentation] [--format svg|png] [--width N] [--allow-invalid] [--overwrite]` | directory | `plan.rendered_all_levels`, `data.directory`, `data.files`; manifest records revision and per-file format/PNG dimensions |
| `commands` | none | `commands`, supported grammar and exit codes |
| `schema` | none | `schema`, Draft-07 JSON Schema for the **operation array** in `data` |

Every successful application envelope has `ok:true`, `type`, `schemaVersion:1`, `data`, `meta`. The saved plan itself has `revision`, `levels`, `storeys`. `apply --dry-run` includes a proposed plan whose revision is advanced, but `meta.revision` is the **unchanged on-disk revision**; never use the proposed revision as the next write precondition. Read the actual plan or the committed apply result. `report` derives room faces, dimensions and bounds without modifying the file. `survey` is the reading to use when describing the plan: per level it gives footprint `bounds`, `faceAreaCm2` (each derived face once), `roomClaimAreaCm2` (sum of room claims, which double-counts a shared face), rooms, connections, exterior doors, windows, and objects. Field meanings are in `references/survey.md`. Use `report` only when the next edit needs authored coordinates.
</contract>

<errors>
A failure writes **no stdout**, one JSON envelope on stderr: `{ "ok": false, "schemaVersion": 1, "error": { "type": "...", "message": "...", "hint": "...", "diagnostics": [...] } }`. `diagnostics` is optional; each item has `code`, `severity`, `message` and possibly `location`, `measured`, `suggestion`. Warning diagnostics can accompany successful responses in `meta.diagnostics`.

- Exit 0: command completed. For `validate`/`report`, still inspect `data.valid`.
- Exit 2: `invalid_input` (parser/schema/geometry failure). Fix using `error.hint` and diagnostics. An invalid mutation does not write the plan.
- Exit 5: `revision_conflict` or `not_found`. Distinguish by `error.type`; on conflict reread state, on not-found inspect names/level references.
- Exit 1: `internal`, often filesystem/render failure; investigate and verify disk state before retry.
- 3/4 are not emitted by this local-first CLI. Do not retry an unchanged deterministic failure with backoff.

`init` refuses to overwrite an existing plan: it exits 2 with `invalid_input` and a hint to use `apply` instead. `apply` is transactional with one revision increment per accepted batch. Upserts replace entities of the same name within a storey; they are not an append operation.

`render` artifact safety: an export never overwrites a protected input (the plan — matched by realpath AND dev/ino identity, so symlink and hardlink aliases are caught) and refuses to replace any existing output without `--overwrite` (exit 2, `invalid_input`). All-levels filenames derive from slugified level names (`../x` refuses; `a\b` → `a--b`; collisions get `-2` suffixes); the manifest maps filenames back to the real level names. The bundle publishes only after every artifact rendered; a non-empty out-dir refuses without `--overwrite`.
</errors>

<version_drift>
If `commands`, `schema`, or per-command `--help` differs from this reference, trust the running executable. Update the repo-local skill in the same change that alters the public CLI surface. The MVP spec describes aspirations that the current executable does not implement; never infer availability from the spec alone.
</version_drift>
