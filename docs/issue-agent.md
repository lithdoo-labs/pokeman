# Issue-driven OpenCode 2 Agent

This repository supports a one-Issue / one-Draft-PR / one-persistent-session workflow.

## Usage

1. Create an ordinary Issue **as lithdoo**, with requirements and acceptance criteria.
2. Comment **/agent start** on the Issue. Only comments made by GitHub user ID 130959182 are authorized.
   - Comment **/agent status** at any time to ask the existing OpenCode session for a read-only progress report and a recommendation on whether/how to continue. Status does not consume owner feedback or advance the coding checkpoint.
3. GitHub-hosted preflight validates the live Issue and author, finds the canonical branch, and snapshots the Issue.
4. A separate GitHub-hosted **Prepare** job creates or recovers **agent/issue-N**, pushes an empty turn-0 initialization commit when needed, and opens the Draft PR **before** OpenCode starts. A retry reuses the same branch and PR.
5. Organization Runner **opencode-lithdoo-labs** runs OpenCode 2 with persistent metadata. GitHub write tokens are not provided to the AI runner.
6. GitHub-hosted publisher validates and publishes a complete or partial patch to the prepared branch, then reports the outcome on the original Issue. A failed coding run never closes or deletes the Draft PR or branch.
7. Review the Issue and PR. Add feedback to the Issue, a PR conversation, a PR review, or inline review comments.
8. Comment **/agent revise** on the *same Issue*. The next run collects feedback since the previous report, resumes the same OpenCode session, and pushes to the same PR branch.
9. Comment **/agent status** to query the same session without publishing code. The command reports completed work, blockers, whether continuation is feasible, and exact next steps; it never creates a new session if the old one cannot be recovered.
10. Review the changes and manually merge. No automatic merge is implemented.

An owner-only alternative is Actions → Issue Agent (OpenCode 2) → Run workflow, with Issue number and **start**, **revise**, or **status** inputs.

## GitHub and Runner prerequisites

- Organization Runner Group permits **lithdoo-labs/pokeman** and has the **labs** runner tag.
- Configure Runner Group **Selected workflows** to allow the trusted workflow at **lithdoo-labs/pokeman/.github/workflows/issue-agent.yml@refs/heads/main**, where supported. Public-repository self-hosted runners have significant exposure to untrusted code. Do not relax the preflight author restrictions.
- Repository Actions settings must permit the publisher to create Pull Requests, with Contents / Issues / Pull requests write rights. An optional secret named **AGENT_GITHUB_TOKEN** can supply a minimum-scope PAT if repository policy prevents the default GITHUB_TOKEN from creating PRs or triggering other workflows.
- The Runner must contain **opencode2** (OpenCode V2), a valid GLM config, and persistent read/write data under /runner/state/lithdoo-labs-org. The model provider requires its own configured credential; the optional real Battle provider checks use **DEEPSEEK_API_KEY** from the dedicated **battle-live-test** environment. Neither secret may be committed or logged. OpenCode tool execution is not a strong security sandbox.
- A publisher commit made using the default GITHUB_TOKEN might not trigger new push/PR workflows. Use a properly scoped GitHub App/PAT if CI-triggering commits are required.

## Privilege separation

| Stage | Runner | GitHub token |
| --- | --- | --- |
| Preflight | ubuntu-latest | Read-only |
| Prepare | ubuntu-latest | Contents / Pull requests write; creates the initial branch commit and Draft PR |
| Execute | self-hosted, linux, x64, opencode, labs | Read-only checkout, no write token forwarded |
| Publish | ubuntu-latest | Contents / Issues / Pull requests write; pushes complete or partial checkpoints |

The publisher rejects changes to .github/, scripts/issue_agent/, scripts/ci/, the pinned loom-realm gitlink, the tracked [FSDB]PokeMan/ asset tree, .gitmodules, .gitignore, .raw/, AGENTS.md, .env*, and OpenCode config, as well as symlinks, submodules, oversize patches, and stale PR HEAD SHAs. An owner-authored Issue is the only permitted entry for OpenCode execution.

## Persistent mapping

- Git branch: **agent/issue-N**
- PR: one Draft PR per Issue, with explicit marker in its body; created before the first OpenCode run
- Initial checkpoint: an empty turn-0 commit makes the branch and Draft PR durable before model execution begins
- Session metadata: **/runner/state/lithdoo-labs-org/agent-projects/pokeman/issue-agent/issues/issue-N/metadata.json**
- Execution worktree: **$GITHUB_WORKSPACE** in the organization Runner job (the trusted checkout is refreshed each turn). OpenCode runs directly in this worktree; its **session data**, not the checkout, is persisted separately.
- OpenCode data: **/runner/state/lithdoo-labs-org/agent-projects/pokeman/issue-agent/opencode-data**
- Per-Issue NDJSON execution logs: **issues/issue-N/logs/** under the same persistent state root. Logs stay on the organization Runner and are not uploaded as artifacts. Session metadata is atomically written before execution and updated as soon as the first session ID event is observed.
- Published Issue comments contain a marker identifying the processed turn and triggering comment. Only markers from the Actions bot or authorized owner are trusted; other public commenters cannot forge checkpoints.

A revision refuses to start if the original session has been lost; it does not pretend a new model session has the same context. If metadata is missing or the session ID was not saved, the Runner attempts a unique recovery using `opencode2 session list --max-count 100 --format json`, matching the exact Issue title and project directory. Ambiguous matches are never guessed. After a failed first publication with no PR, a fresh /agent start resumes a recovered session rather than discarding it. PRs that are already closed or merged cannot be revised. Use a new Issue for a new task.

The OpenCode subprocess timeout is **240 minutes (4 hours)**; the organization Runner Execute job timeout is **270 minutes**, leaving 30 minutes for graceful termination, patch capture, result-artifact upload, and cleanup. Output is streamed to a Runner-local NDJSON log, a one-minute heartbeat is printed to Actions, and the process group is terminated on timeout. On any caught execution failure, the executor attempts to stage and package all safe workspace changes rather than clearing the patch. Only allowlisted paths from the existing PokeMan policy can be published. The publisher commits a valid failure-time patch as a `wip(agent)` checkpoint to the same branch and Draft PR. If no patch artifact is available (including a hard Runner interruption), the pre-created branch and Draft PR remain open and the Issue receives a failure report. Executor failures still exit non-zero.

GitHub Actions concurrency avoids overlapping running jobs for the same Issue, but GitHub can replace pending jobs. The next accepted revision includes all owner-authored feedback since the most recent published checkpoint. A changed PR HEAD makes the current publication fail rather than overwriting human commits.

## Testing

For each iteration, select the relevant **Fast** scope (`bash scripts/ci/run-pokeman.sh fast battle`, or `fast battle-browser` for UI changes, `fast map`, `fast product`). Before claiming final implementation acceptance run **Full** (`bash scripts/ci/run-pokeman.sh full`) and report actual results or blockers. The **Release** tier is owned by PWA Staging and never reruns Full. Details: [verification tiers](verification.md).

### Offline CI tests

Open a PR with these changes. The **Issue Agent Validation** workflow exercises:
- Owner and Issue authorization
- Branch / Issue mapping and checkpoint handling
- Protected-path rejection
- Prepare creates and pushes an initial branch commit and opens one Draft PR before model execution
- Two consecutive OpenCode turns update the same prepared PR branch
- Timeout captures a partial working-tree patch for publication
- Failed execution publishes a `wip(agent)` checkpoint without losing the PR
- Missing result artifacts and publisher apply failures leave the existing branch and Draft PR intact
- Start retries reuse the existing open PR instead of creating duplicates
- Resume of the exact same session and rejection of missing session state
- Orphan-session discovery, read-only `/agent status`, status idempotence, and early session persistence on timeout

These tests do **not** use the real GLM API or consume the organization's Runner.

### Real end-to-end verification

After reviewing and merging the implementation to main, the owner should:

1. Create an Issue as lithdoo, for example: *Add docs/issue-agent-e2e.md with one short Hello World paragraph, without changing other files.*
2. Comment **/agent start**. Verify a run at Actions → Issue Agent (OpenCode 2) completes on **opencode-lithdoo-labs**, creates the Draft PR before model execution, then comments the execution summary back on the Issue.
3. In that Issue, comment: *Change the paragraph to say Hello PokeMan.* Then comment **/agent revise**.
4. Verify the second run updates the **same PR number** and branch, and reports **Session: resumed**. Confirm the real implementation diff changed.
5. Do not merge the test PR automatically. If desired, close and clean up the test Issue/PR only after storing required session data.

The owner can trigger the workflow using a regular Issue comment or GitHub Actions manual dispatch. A connected GitHub integration may also post owner-authored Issue comments when permitted; the server-side owner-ID and live Issue checks remain authoritative.

## Safe cancellation

Closing the ordinary Issue prevents new `/agent` commands from passing preflight. If an Agent run is already executing, close any associated Draft PR separately; closure alone is not a guaranteed cancellation of an already-running GitHub Actions job. Inspect the run status before assuming execution has stopped.

## Troubleshooting

- Preflight rejects unauthorized, closed, duplicate, or non-ordinary Issues, and revisions without fresh owner feedback.
- Execute errors are reported back to the Issue when the publisher has permission; check OpenCode availability and state-volume permissions without printing API keys. A timeout is now 240 minutes (270-minute job ceiling); inspect the Runner-local `issues/issue-N/logs/` file and `metadata.json` before retrying.
- To ask the AI for a progress assessment, comment `/agent status`. It resumes only a uniquely identified existing session, posts a read-only report, and does not advance the coding checkpoint. If no unique session is recoverable, it explicitly reports unavailable and does not silently create a new session.
- Prepare failures: verify GitHub Action PR creation policy and write permissions. The branch is pushed before PR creation; if PR creation is denied, the branch is retained. Enable the repository PR creation setting (or supply AGENT_GITHUB_TOKEN), then comment **/agent start** again to recover the same branch and open its Draft PR.
- Execute failures: the 4-hour OpenCode timeout leaves 30 minutes of Runner job headroom for partial patch capture and upload. Check the Issue failure report and the Runner-local log before retrying. If the runner is forcibly terminated before upload, the empty initial commit and Draft PR still remain; the latest successfully published WIP checkpoint is the recovery point.
- Publisher failures: the Issue report retains the PR number and branch. Check the reported apply/push error; never delete the branch or close the Draft PR as a cleanup step.
- The model's session content lives on the self-hosted Runner; do not delete persistent state when cleaning a PR.

## Coexistence with original Design PR workflows

The new Issue Agent listens to **ordinary Issue comments**, whereas PokeMan has its own existing `CI` workflow for LoomRealm contract and map testing. The Issue Agent is separate from that CI and does not replace it. Each PokeMan Issue session stays in its own `issue-agent/` state namespace.

The organization's shared Runner handles one job at a time. If you enable a Runner Group selected-workflow allowlist, include **both** this new workflow and the existing authorized Agent Implement / Revise workflows; otherwise existing jobs may remain queued.

## PokeMan-specific boundaries

This repository includes tracked FSDB game assets and the LoomRealm git submodule pinned to `37d16bac49959a56d01ee02357cdd0872807a3b0`. The Issue Agent checkout initializes that submodule and validates it against the approved Git link. AI patches must not alter `loom-realm/`, `[FSDB]PokeMan/`, `.github/`, `scripts/ci/`, `scripts/issue_agent/`, or repository security configuration. Game source such as `subsystems/`, `game-libs/`, `test/`, `doc/`, launch manifests, and product design documents may be changed for owner-approved Issues.

The existing `.github/workflows/ci.yml` remains independent and runs the PokeMan and Map contract tests. CI setup may download/build dependencies, and a full CI run is considerably larger than the lightweight Issue Agent unit tests. A default GitHub `GITHUB_TOKEN`-created PR may not trigger additional PR CI automatically because of GitHub's Actions event recursion rules; use a minimally scoped GitHub App token or explicitly run CI when required.

**Prerequisites before production use:** the organization Runner Group must allow the new `lithdoo-labs/pokeman` repository, and if it uses Selected workflows, allow `lithdoo-labs/pokeman/.github/workflows/issue-agent.yml@refs/heads/main`. The repository must allow Actions to create Pull Requests or provide the narrowly scoped `AGENT_GITHUB_TOKEN` secret.
