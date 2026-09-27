<overview>
Score each principle `0` absent, `1` partial, `2` complete, or `N/A` genuinely irrelevant. Maximum is 14 before exclusions.
</overview>

<scorecard>
| Principle | 0 | 1 | 2 |
|---|---|---|---|
| Machine-readable | Mixed/prose-only | JSON exists but inconsistent | Stable success/error envelopes; strict streams |
| Non-interactive | Prompts/hangs | Bypass exists but gaps remain | TTY-less by default; explicit interactive mode |
| Replayable | Unsafe retries | Some conflict handling | Idempotent writes and bounded retrieval |
| Safe defaults | Destructive/secret exposure | Partial safeguards | Explicit preview/force, validated inputs, redacted secrets |
| Observable | Generic failures | Some diagnostics/codes | Categorized exits, structured logs, actionable hints |
| Context-efficient | Unbounded/full dumps | Limit or projection | Bounds, projection, compact JSON, streaming/pagination |
| Introspectable | Weak help | Complete human help | Examples plus accurate machine discovery/schema |
</scorecard>

<release_blockers>
Treat these as blockers regardless of score:
- Invalid or unstable JSON on documented machine-output paths.
- Errors or progress mixed into result stdout.
- Exit `0` on failure.
- Non-interactive execution can hang.
- Credentials or sensitive payloads appear in output/logs.
- Untrusted input reaches shell, path, URL, template, or query sinks unsafely.
- Destructive operation lacks explicit safeguard.
- Retrieval can return unbounded data by default.
- Documented schema/help differs materially from runtime output.
</release_blockers>

<report_format>
For each finding include:
1. Severity and violated contract.
2. Exact observed command or code/test location.
3. Agent failure scenario.
4. Smallest remediation.

Then provide score, blockers, and optional enhancements separately.
</report_format>
