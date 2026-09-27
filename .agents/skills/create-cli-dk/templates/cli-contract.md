<cli_contract>
## Identity
- Executable:
- Intended consumers:
- Installation/entry point:
- Runtime and existing parser:

## Command grammar
- Commands:
- Required arguments:
- Optional flags and defaults:
- stdin/batch behavior:
- Root and subcommand examples:

## Success output
- Default format:
- Envelope `type`:
- `schemaVersion`:
- `data` shape:
- `meta` shape:
- Empty result:
- Partial success:
- Projection/compact/stream modes:

## Errors and exit codes
- Error vocabulary:
- Recovery hints:
- `0` success:
- `2` invalid input:
- `3` auth/permission:
- `4` retryable:
- `5` not-found/conflict:

## Bounds and network
- Default/max limit:
- Pagination/cursor:
- Per-request and overall timeout:
- Retryable statuses:
- Retry cap and `Retry-After` policy:

## Side effects and safety
- Read/write/destructive:
- Idempotency or conflict policy:
- Preview/confirmation:
- Atomicity:
- Untrusted input sources and sinks:
- Credential source and redaction:

## Discovery and observability
- `--help`:
- Machine command discovery:
- JSON Schema:
- verbose/debug/log format:
- correlation identifiers:

## Verification
- Process-level tests:
- Fixture/unit tests:
- TTY-less test:
- Secret scan:
- Relevant repository checks:
</cli_contract>
