<overview>
Practical evidence behind the contract, including patterns observed during the `image-search` session.
</overview>

<case_studies>
## `agynio/pexels-cli`

Strong patterns:
- Hierarchical command discovery with root examples.
- Global pagination, timeout, retries, field projection, and output controls.
- Stable `{data, meta}` list envelope.
- Heavy fields omitted by default.
- Unit tests for output shaping and pagination parsing.

Do not copy mechanically:
- YAML default is convenient for humans, but agent-first tools should default to JSON.
- `--raw` as an upstream HTTP body conflicts with context-efficient compact JSON semantics; name raw HTTP output explicitly.
- Auth/config commands expand scope and secret risk. Add them only when persistent profiles are an actual requirement.

## `english-lessons`

Strong patterns:
- Concise root help and realistic command names.
- Errors routed to stderr.
- Process-level tests execute the built CLI, asserting exit status, stdout, stderr, persistence, and TTY input.
- `-y` supports non-interactive destructive operation.

Observed limitations for agent-first use:
- Human tables and prose lack a JSON contract.
- Exit codes collapse distinct failures into `1`.
- Some success paths mix primary output with integration diagnostics.
- Manual argument parsing makes consistent option validation harder as the surface grows.

Use its subprocess testing discipline, not its output contract.

## `image-search`

Useful decisions:
- Provider adapters normalize into one candidate schema.
- Independent providers run concurrently and expose partial failures in metadata.
- Open-license filtering occurs before candidates enter the normalized result.
- Search and batch share one contract; JSONL makes batch composable.
- Credentials remain in environment variables and never enter manifests.
- Machine discovery and schema commands reduce help-text parsing.

Implementation lessons:
- Introspection must describe actual arguments and schemas, not only command names.
- Attempt counts must be measured in the retry loop, not inferred from configured retries.
- A top-level `schemaVersion` is clearer than only a nested format version.
- Default source priority is transparent but is not semantic relevance. Expose score reasons and never imply that an image depicts a place without verification.
</case_studies>

<decision_rules>
- **JSON default:** Use for agent-first CLIs. Human-first tools may default to text only if `--json` is universally available and reliable.
- **Introspection:** Add for reusable or growing CLIs. A tiny two-command personal script can rely on excellent help.
- **Dry-run:** Required for material writes/destruction, irrelevant for pure retrieval.
- **Idempotency:** Applies to state changes, not searches.
- **Partial success:** Exit `0` only when returned data is useful and component status is explicit; otherwise use the relevant non-zero code.
- **Dependencies:** Prefer the repository's parser/framework. Do not add a framework solely for cosmetic help.
- **MCP vs CLI:** Prefer CLI for a small stateless surface available to shell agents. Prefer MCP for large dynamic tool catalogs, stateful sessions, or protocol composition.
</decision_rules>

<source_notes>
Synthesized from:
- agent-first CLI design research and its 2026 best-practices synthesis
- “Writing CLI Tools That AI Agents Actually Want to Use”
- `github.com/agynio/pexels-cli`
- local `english-lessons/src/cli` and its process-level tests
- implementation and review of local `image-search`
</source_notes>
