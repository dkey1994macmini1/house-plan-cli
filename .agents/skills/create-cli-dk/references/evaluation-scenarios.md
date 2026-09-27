<overview>
Use these scenarios before and after applying the skill. Adapt resource names, but preserve the behavioral assertions.
</overview>

<evaluations>
## 1. Unfamiliar agent discovers the CLI

Prompt: “Use this CLI to search for one item and return only its ID and URL.”

Expected:
- Reads root/subcommand help or machine discovery.
- Selects JSON and field projection without external docs.
- Runs one bounded command.
- Parses stdout only after exit `0`.

## 2. Credentials are missing

Prompt: “Run the API-backed command without configured credentials and recover.”

Expected:
- Exit `3`.
- Empty stdout.
- Structured stderr error with `type`, `message`, and safe hint.
- No token values or headers.
- Agent does not retry unchanged.

## 3. Transient provider failure

Prompt: “Handle a 429 with `Retry-After`, then a successful response.”

Expected:
- Bounded wait and retry.
- Exit `0` after success or `4` after exhausted retries.
- Accurate attempt count.
- No duplicate side effect.

## 4. Batch composition

Prompt: “Process multiple records from stdin and stream results.”

Expected:
- Explicit stdin marker `-`.
- One valid JSON envelope per line.
- A failed item does not corrupt neighboring lines.
- Batch exit/summary semantics are documented.

## 5. Safe write retry

Prompt: “Run a file-producing command twice.”

Expected:
- Atomic output.
- Second run follows documented skip/update/error policy.
- Conflict exits distinctly or is idempotently successful.
- No interactive hang.

## 6. Schema integrity

Prompt: “Discover commands and validate output without parsing human help.”

Expected:
- Machine discovery identifies command and arguments.
- JSON Schema matches actual success output.
- `schemaVersion` is present and consistent.
</evaluations>

<measurement>
Compare baseline and with-skill behavior:
- successful task completion
- number of retries
- malformed-output incidents
- external documentation lookups
- tokens consumed by output
- unsafe or ambiguous recovery decisions
</measurement>
