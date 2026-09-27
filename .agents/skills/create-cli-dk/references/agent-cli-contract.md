<overview>
Normative contract for agent-operated CLIs. Apply requirements proportionally to the command's actual behavior.
</overview>

<output_contract>
## Success

Agent-first commands default to JSON. Every command supports `--json`.

```json
{
  "ok": true,
  "type": "image_search_result",
  "schemaVersion": 1,
  "data": [],
  "meta": {}
}
```

- stdout: result data only.
- stderr: warnings, progress, diagnostics, and errors only. On a non-zero exit,
  stderr contains exactly one error envelope; place safe diagnostics inside that
  envelope rather than writing preceding lines.
- Keep field names and types stable. Breaking changes increment `schemaVersion`.
- Prefer shallow semantic objects over provider-shaped nesting.
- Empty results are successful empty data, not errors.
- Batch/stream output uses JSONL: one complete envelope per line.
- `--raw` means compact JSON, not an upstream HTTP body.

## Error

Non-zero exits write a single structured envelope to stderr and no result to
stdout. Suppress standalone verbose/progress events on failure:

```json
{
  "ok": false,
  "error": {
    "type": "invalid_input",
    "message": "Unknown source 'foo'",
    "hint": "Run 'image-search commands --json' for supported sources"
  },
  "schemaVersion": 1
}
```

Never include tokens, headers, signed URLs, full sensitive payloads, or stack traces unless an explicit safe debug mode redacts them.
</output_contract>

<exit_codes>
Use these defaults consistently:

| Code | Meaning | Agent action |
|---|---|---|
| 0 | Success, including empty or documented partial result | Parse stdout |
| 2 | Invalid arguments/input | Correct input; do not retry unchanged |
| 3 | Authentication or permission | Fix credentials/access |
| 4 | Retryable transient/rate limit | Retry with backoff |
| 5 | Not found or conflict | Inspect state or choose conflict policy |

Use `1` only for uncategorized internal failure. If partial success exits `0`, expose every component status in `meta` so the caller can decide whether partial data is sufficient.
</exit_codes>

<command_design>
- Root `--help` lists all commands and examples.
- Subcommand `--help` lists required/optional inputs, defaults, environment variables, examples, output shape, and relevant exit codes.
- Prefer predictable resource-action grammar for broad CLIs (`photo search`, `photo get`). A focused CLI may use direct verbs (`search`, `batch`).
- Accept stdin explicitly with `-`; never guess whether stdin is input.
- Batch operations avoid N process launches.
- `commands --json` should expose names, arguments, flags, examples, and output types when machine discovery adds real value.
- `schema --command NAME --output json-schema` should return the actual command schema, not a generic placeholder.
</command_design>

<retrieval_and_context>
- Bound list/search output with `--limit`.
- Add cursor/page controls when upstream pagination exists; `--all` must still support a safety cap.
- `--fields`/`--select` validates known fields and reduces context.
- Use server-side filters where possible.
- Exclude heavy fields by default; expose explicit includes.
- Support JSONL for incremental or batch output.
</retrieval_and_context>

<side_effects>
- Read-only commands must be deterministic enough to retry and need no confirmation.
- Writes accept an idempotency/dedupe key or explicit `--if-exists skip|update|error`.
- Destructive commands support a structured preview and require explicit confirmation (`--force`, `--confirm ID`) in non-interactive mode.
- Interactive mode is opt-in. Never hang when stdin is not a TTY.
- Atomic file writes use a temporary sibling plus rename; conflict behavior is explicit.
</side_effects>

<network_and_auth>
- Use HTTPS and fixed/allowlisted service origins.
- Validate untrusted query, URL, path, header, and file inputs before dangerous sinks.
- Use argument-array process APIs; never interpolate untrusted data into shell commands.
- Load credentials from approved environment/secret storage inside the executable.
- Retry only transient network errors, 429, and documented 5xx responses. Respect bounded `Retry-After`.
- Report actual attempt counts and per-provider status; do not claim configured maximum attempts as attempts made.
- Apply timeouts per request and, where relevant, an overall command deadline.
</network_and_auth>

<observability>
- `--verbose` reports bounded operational status to stderr.
- `--debug` adds safe diagnostics without secrets.
- `--log-format json` makes diagnostic events parseable.
- Optional trace/request IDs belong in `meta` and logs for correlation.
- Progress output must be disabled or redirected safely when stdout is structured.
</observability>

<testing_contract>
Test through the real executable:

1. Root and each subcommand help.
2. Successful JSON and compact JSON parse.
3. Structured error on stderr and empty stdout.
4. Every documented exit category.
5. Empty and partial success.
6. TTY-less operation.
7. stdin and batch/JSONL when supported.
8. Conflict/idempotency for writes.
9. Retry/`Retry-After` with a fake transport.
10. Credential redaction.

Unit-test normalization and domain helpers with fixtures. Do not make live external calls in automated unit tests.
</testing_contract>
