# Issue Agent DeepSeek API Key Check

> Diagnostics report for Issue #8. Sanitized: contains no secret value, length,
> prefix/suffix, request header, raw API response, or other secret-derived material.

Date: 2026-11-05
Repository: lithdoo-labs/pokeman

## Result

**`missing`** — `DEEPSEEK_API_KEY` is not present in the environment available to
the Issue Agent's execution process. No credential existed to validate, so the
authenticated `/models` probe and the real Call A + Call B smoke test could not run.

## Execution context

| Item | Value |
| --- | --- |
| Orchestration | GitHub Actions (CI) |
| Workflow | `Issue Agent (OpenCode 2)` (`.github/workflows/issue-agent.yml`) |
| Job | `execute` (runs the OpenCode turn) |
| Runner | self-hosted, `RUNNER_NAME=opencode-lithdoo-labs`, `RUNNER_ENVIRONMENT=self-hosted` |
| Platform | Linux x64 (WSL2 kernel), user `runner` |
| Toolchain | node v22.23.4, npm 10.9.9 |
| Agent spawn path | `scripts/issue_agent/agent.py execute` → `opencode2 run` with `env = os.environ.copy()` (GitHub-token variables removed) |

## Key availability

Checked in the agent's own execution process only (no environment dump, no shell
tracing, no git/artifact/log search):

- Shell parameter-expansion presence check on `DEEPSEEK_API_KEY`: **unset**.
- `/proc/self/environ` of the agent process: **no `DEEPSEEK_API_KEY` entry**.

Both checks report only presence/absence; the variable was never printed or exported
into logs. Corroborating configuration facts:

- The `execute` job step env (`issue-agent.yml`, "Run isolated OpenCode turn and
  generate patch") sets only `OPENCODE_BIN`, `XDG_DATA_HOME`, `ISSUE_AGENT_STATE`.
- No `DEEPSEEK` reference exists anywhere under `.github/`; the only secret mapped
  in the workflow is `AGENT_GITHUB_TOKEN` (publish job only).
- No `.env` file exists in the repository root (existence check only; contents not
  inspected).

Because `agent.py` copies the job's environment through to the agent process
(removing only GitHub-token names), absence here means the variable is not provided
by the workflow, the runner service environment, or any environment-level injection.

## API validation

Not performed. An authenticated `GET https://api.deepseek.com/models` requires a
credential; none is available in this context. An unauthenticated request would say
nothing about the Issue Agent's key, so none was sent.

- API HTTP status: **not checked (no credential)**.
- `deepseek-flash` listed in `/models`: **not checked (no credential)**.

## Real Call A + Call B smoke test

Not run — gated off by design. The credential-gated smoke
(`game-libs/battle/test/decision.test.mjs`, "optional credential-gated real
DeepSeek smoke") skips unless `BATTLE_DEEPSEEK_SMOKE=1` **and**
`DEEPSEEK_API_KEY` are both present.

Evidence that the gate holds: executed the suite with the flag forced on and the key
absent:

```bash
BATTLE_DEEPSEEK_SMOKE=1 npm --prefix game-libs/battle test
```

Result: 85 tests — 83 pass, 1 skipped, 1 fail.

- `ok 14 - optional credential-gated real DeepSeek smoke # SKIP` — skipped because
  the key is absent, exactly as the gate intends.
- All `DeepSeekDecision` unit tests (fake transport, including the exact two-call
  Call A/Call B profile assertions) pass.
- The single failure is `browser-e2e.test.mjs`
  ("RenderDomain state traverses WebProjector into battle custom elements"):
  headless Chromium cannot start on this runner because the container lacks
  `libglib-2.0.so.0`. This is a runner OS-package limitation, unrelated to DeepSeek
  or the key check.

## Where the secret would need to be injected

To make a real key reachable by the agent process:

1. Create the secret, e.g. repository secret `DEEPSEEK_API_KEY`
   (Settings → Secrets and variables → Actions), or an Actions **Environment**
   secret if the `execute` job is first bound to that environment (the job
   currently declares no `environment:`).
2. Map it into the `execute` job in `.github/workflows/issue-agent.yml`, in the
   `env:` of the "Run isolated OpenCode turn and generate patch" step:
   `DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}`. `agent.py` passes this
   name through to the OpenCode process, so a step-level mapping reaches the agent.
3. Confirm the self-hosted runner group (`labs`) is permitted to access repository
   secrets — runner groups can be configured to withhold secrets from self-hosted
   runners.

Operational note for whoever performs the injection (no changes made in this task):
`safe_summary()` in `scripts/issue_agent/agent.py` redacts only GLM/GitHub token
values from the agent summary that is published to the PR/Issue; it does not yet
redact `DEEPSEEK_API_KEY`. Extend that redaction list before injecting the secret so
a key echoed in agent output cannot leak into published comments.

## Sanitization statement

No key value or derived material (length, prefix/suffix, headers, raw responses)
appears in terminal output, logs, artifacts, or this file. The only repository
change for this task is this report.
