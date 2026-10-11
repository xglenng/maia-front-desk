# AI failure diagnostics

Failed live AI runs emit `maia_agent_failed` in deployment logs and save the
same diagnostic codes in `agent_runs.error`. Filter by the event and run ID
to investigate delayed SMS failures. Historical `AgentExecutionError` rows
cannot be reconstructed by this change.

Diagnostics include tenant/conversation/run/job IDs, allowlisted error and tool
names, HTTP failure status, and allowlisted invalid availability fields. They
exclude customer text, tool arguments, error messages, provider response bodies,
URLs, and credentials. Unknown error names remain generic. Cause chains are
bounded and circular causes are ignored.

This adds observability only. It does not retry failed jobs, send messages, or
change consent, scheduling, or availability. A new owner-initiated test after
deployment is needed to identify the missing-reply failure.
