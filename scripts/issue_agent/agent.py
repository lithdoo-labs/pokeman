#!/usr/bin/env python3
"""Issue-driven, owner-gated OpenCode executor and GitHub publisher.

Preflight/publish run on GitHub-hosted runners. Execute runs without GitHub
write credentials on the persistent lithdoo-labs organization runner.
"""
import argparse
import json
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

REPO = "lithdoo-labs/pokeman"
OWNER_LOGIN = "lithdoo"
OWNER_ID = 130959182
MARKER = "<!-- pokeman-issue-agent:issue={issue} -->"
STATUS_RE = re.compile(r"<!-- pokeman-agent-turn:issue=(\d+);comment=(\d+);turn=(\d+) -->")
STATUS_COMMAND_RE = re.compile(r"<!-- pokeman-agent-status:issue=(\d+);comment=(\d+) -->")
RUN_TIMEOUT_SECONDS = 14400
STATUS_TIMEOUT_SECONDS = 600
SESSION_RE = re.compile(r"^ses_[A-Za-z0-9_-]+$")
# The public PokeMan repo already contains game assets and a pinned framework.
# Agents may edit gameplay, tests and documentation, but must not rewrite the
# privileged control-plane, CI bootstrap, submodule or tracked FSDB asset tree.
PROTECTED = (".github/", "scripts/issue_agent/", "scripts/ci/",
             ".git/", ".gitmodules", ".gitignore", ".env", ".raw/",
             "loom-realm", "[FSDB]PokeMan", "AGENTS.md",
             "opencode.json", "opencode.jsonc")
MAX_FILES = 40
MAX_PATCH_BYTES = 900_000


def git(*args, cwd=None, env=None, check=True):
    return subprocess.run(["git", *map(str, args)], cwd=cwd, env=env,
                          check=check, capture_output=True, text=True)


def api(method, route, payload=None):
    token = os.environ.get("GH_TOKEN", "")
    if not token:
        raise RuntimeError("GH_TOKEN missing from GitHub-hosted job")
    data = None if payload is None else json.dumps(payload).encode()
    req = Request("https://api.github.com" + route, data=data, method=method,
                  headers={"Authorization": "Bearer " + token,
                           "Accept": "application/vnd.github+json",
                           "X-GitHub-Api-Version": "2022-11-28",
                           "Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except HTTPError as ex:
        if ex.code == 404:
            raise LookupError(route) from ex
        text = ex.read(1024).decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API {method} {route}: HTTP {ex.code}: {text}") from ex


def pages(route, limit=5):
    result = []
    for page in range(1, limit + 1):
        joiner = "&" if "?" in route else "?"
        batch = api("GET", f"{route}{joiner}per_page=100&page={page}")
        if not isinstance(batch, list):
            raise RuntimeError("unexpected GitHub API pagination response")
        result.extend(batch)
        if len(batch) < 100:
            break
    return result


def authorized_author(item):
    return (item.get("user") or {}).get("id") == OWNER_ID


def is_protected(path):
    name = path.replace("\\", "/")
    return (name.startswith("/") or "../" in name or name.startswith("../")
            or any(name == p or name.startswith(p) for p in PROTECTED)
            or "/.github/" in name or "/.env" in ("/" + name)
            or name.endswith("/AGENTS.md") or name.endswith("/opencode.json")
            or name.endswith("/opencode.jsonc")
            or name.startswith(".."))


def validate_paths(paths):
    if len(paths) > MAX_FILES:
        raise RuntimeError(f"too many changed files ({len(paths)} > {MAX_FILES})")
    for path in paths:
        if not path or is_protected(path):
            raise RuntimeError(f"protected or invalid path: {path!r}")


def event_request(event, name, inputs, actor):
    if name == "issue_comment":
        comment = event.get("comment") or {}
        issue = event.get("issue") or {}
        if issue.get("pull_request") or issue.get("user", {}).get("id") != OWNER_ID:
            raise RuntimeError("not an owner-authored ordinary Issue")
        if not authorized_author(comment):
            raise RuntimeError("not a comment from the authorized owner")
        command = str(comment.get("body", "")).strip()
        if command not in ("/agent start", "/agent revise", "/agent status"):
            raise RuntimeError("not an Issue Agent command")
        return int(issue["number"]), command.split()[-1], int(comment["id"])
    if name == "workflow_dispatch" and actor == OWNER_LOGIN:
        number = int(inputs.get("issue_number", 0))
        operation = inputs.get("operation")
        if operation not in ("start", "revise", "status"):
            raise RuntimeError("invalid dispatch operation")
        return number, operation, 0
    raise RuntimeError("unauthorized event")

def branch_name(issue):
    return f"agent/issue-{issue}"


def find_agent_pr(issue):
    path = f"/repos/{REPO}/pulls?{urlencode({'state':'all','head':'lithdoo-labs:'+branch_name(issue),'base':'main','per_page':100})}"
    matches = api("GET", path)
    valid = [p for p in matches if p.get("head", {}).get("ref") == branch_name(issue)]
    if len(valid) > 1:
        raise RuntimeError("multiple PRs exist for the same Issue branch")
    return valid[0] if valid else None


def get_last_checkpoint(comments, issue, before_id):
    result = None
    for item in comments:
        if before_id and item["id"] >= before_id:
            continue
        # A public repository allows arbitrary users to comment. Only the
        # Actions bot or the authorized human can publish trusted checkpoints.
        if (item.get("user") or {}).get("id") not in (41898282, OWNER_ID):
            continue
        match = STATUS_RE.search(item.get("body") or "")
        if match and int(match[1]) == issue:
            if result is None or item["id"] > result["id"]:
                result = {"id": item["id"], "turn": int(match[3]),
                          "created_at": item["created_at"]}
    return result


def collect_feedback(issue, operation, command_id, pr, comments, checkpoint):
    if operation != "revise":
        return []
    watermark = checkpoint["id"] if checkpoint else 0
    output = []
    for item in comments:
        if not authorized_author(item) or item["id"] <= watermark:
            continue
        if command_id and item["id"] > command_id:
            continue
        body = (item.get("body") or "").strip()
        if body in ("/agent start", "/agent revise", "/agent status") or not body:
            continue
        output.append((item["created_at"], "Issue comment", body))
    if pr:
        prn = pr["number"]
        for route, label, time_key in [
            (f"/repos/{REPO}/issues/{prn}/comments", "PR conversation", "created_at"),
            (f"/repos/{REPO}/pulls/{prn}/reviews", "PR review", "submitted_at"),
            (f"/repos/{REPO}/pulls/{prn}/comments", "PR inline review", "created_at")
        ]:
            for item in pages(route):
                if not authorized_author(item):
                    continue
                stamp = item.get(time_key) or item.get("created_at") or ""
                if checkpoint and stamp <= checkpoint["created_at"]:
                    continue
                body = (item.get("body") or "").strip()
                if not body:
                    continue
                where = item.get("path")
                output.append((stamp, label + (f" ({where})" if where else ""), body))
    output.sort()
    return [{"source": src, "text": text[:10000]} for _, src, text in output][-60:]


def preflight(args):
    Path(args.github_output).write_text("allowed=false\n")
    event = json.loads(Path(args.event).read_text(encoding="utf-8"))
    issue_number, operation, comment_id = event_request(
        event, os.environ.get("GITHUB_EVENT_NAME", ""),
        {"issue_number": os.environ.get("INPUT_ISSUE_NUMBER", ""),
         "operation": os.environ.get("INPUT_OPERATION", "")},
        os.environ.get("ACTOR", ""))
    if issue_number < 1:
        raise RuntimeError("invalid Issue number")
    issue = api("GET", f"/repos/{REPO}/issues/{issue_number}")
    if issue.get("pull_request") or issue.get("state") != "open" or not authorized_author(issue):
        raise RuntimeError("Issue must be open and authored by lithdoo")
    if comment_id:
        comment = api("GET", f"/repos/{REPO}/issues/comments/{comment_id}")
        if not authorized_author(comment) or int(comment.get("issue_url", "").split("/")[-1]) != issue_number:
            raise RuntimeError("trigger comment was altered or mismatched")
    pr = find_agent_pr(issue_number)
    if pr and pr.get("state") != "open":
        raise RuntimeError("Issue already has a closed Agent PR; use a new Issue")
    if operation == "revise" and (not pr or pr.get("state") != "open"):
        raise RuntimeError("Issue has no open Agent PR; use /agent start")
    if pr:
        if (pr.get("head", {}).get("repo", {}).get("full_name") != REPO
                or pr.get("base", {}).get("ref") != "main"
                or MARKER.format(issue=issue_number) not in (pr.get("body") or "")):
            raise RuntimeError("Agent PR provenance mismatch")
    orphan_sha = None
    if operation in ("start", "status") and not pr:
        try:
            existing_ref = api("GET", f"/repos/{REPO}/git/ref/heads/{branch_name(issue_number)}")
        except LookupError:
            pass
        else:
            candidate_sha = existing_ref["object"]["sha"]
            committed = api("GET", f"/repos/{REPO}/commits/{candidate_sha}")
            message = committed.get("commit", {}).get("message", "")
            if (committed.get("author", {}).get("login") != "github-actions[bot]"
                    or not message.startswith(f"feat(agent): issue #{issue_number} turn ")):
                raise RuntimeError("existing Issue branch was not published by this Agent")
            orphan_sha = candidate_sha
            # Keep start: prepare creates/recovers the Draft PR before execution.
    comments = pages(f"/repos/{REPO}/issues/{issue_number}/comments")
    checkpoint = get_last_checkpoint(comments, issue_number, comment_id)
    if operation == "revise":
        feedback = collect_feedback(issue_number, operation, comment_id, pr, comments, checkpoint)
        if not feedback:
            raise RuntimeError("No new owner feedback found since the last Agent result")
    else:
        feedback = []
    ref = (pr["head"]["sha"] if pr else orphan_sha or
           api("GET", f"/repos/{REPO}/git/ref/heads/main")["object"]["sha"])
    command_marker_id = (comment_id or int(os.environ.get("GITHUB_RUN_ID", "0"))
                         if operation == "status" else comment_id)
    payload = {"repository": REPO, "issue": issue_number, "operation": operation,
               "command_id": command_marker_id, "issue_title": issue["title"][:300],
               "issue_body": (issue.get("body") or "")[:30000],
               "branch": branch_name(issue_number), "pr": pr["number"] if pr else None,
               "base_sha": ref,
               "turn": (checkpoint["turn"] + 1 if checkpoint else 1),
               "feedback": feedback}
    Path(args.output).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    with Path(args.github_output).open("a") as out:
        out.write(f"allowed=true\nbase_sha={ref}\nissue_number={issue_number}\noperation={operation}\n")
    print(f"Authorized {operation} for Issue #{issue_number}; expected source SHA {ref[:12]}")

def session_id_from_events(events):
    for line in events.splitlines():
        try:
            obj = json.loads(line)
        except ValueError:
            continue
        stack = [obj]
        while stack:
            item = stack.pop()
            if isinstance(item, dict):
                for k, v in item.items():
                    if k in ("sessionID", "sessionId", "session_id") and isinstance(v, str) and SESSION_RE.fullmatch(v):
                        return v
                    if isinstance(v, (dict, list)):
                        stack.append(v)
            elif isinstance(item, list):
                stack.extend(item)
    return None


def response_from_events(events):
    messages = []
    for line in events.splitlines():
        try:
            item = json.loads(line)
        except ValueError:
            continue
        part = item.get("part") if isinstance(item, dict) else None
        if item.get("type") in ("text", "message.part.updated") and isinstance(part, dict):
            if part.get("type") == "text" and isinstance(part.get("text"), str):
                messages.append(part["text"])
        elif item.get("type") == "text" and isinstance(item.get("text"), str):
            messages.append(item["text"])
    return "\n".join(messages)[-5000:]


def write_json_atomic(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    try:
        os.chmod(temporary, 0o600)
    except OSError:
        pass
    temporary.replace(path)


class OpenCodeTimeout(RuntimeError):
    def __init__(self, seconds, output):
        super().__init__(f"OpenCode exceeded its {seconds // 60}-minute execution limit")
        self.output = output


def discover_session_id(binary, issue, workspace, env):
    """Recover an orphaned session by its exact title and project directory."""
    try:
        completed = subprocess.run(
            [binary, "session", "list", "--max-count", "100", "--format", "json"],
            cwd=workspace, env=env, capture_output=True, text=True,
            timeout=40, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if completed.returncode != 0:
        return None
    try:
        payload = json.loads(completed.stdout)
    except ValueError:
        return None
    expected_title = f"pokeman issue #{issue}".casefold()
    expected_directory = str(Path(workspace).resolve())
    candidates = []
    stack = [payload]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            session_id = item.get("id") or item.get("sessionID") or item.get("sessionId")
            title = item.get("title")
            directory = item.get("directory") or item.get("cwd") or item.get("path")
            if (isinstance(session_id, str) and SESSION_RE.fullmatch(session_id)
                    and isinstance(title, str)
                    and title.strip().casefold() == expected_title):
                candidates.append((session_id, str(directory) if directory else None))
            stack.extend(value for value in item.values() if isinstance(value, (dict, list)))
        elif isinstance(item, list):
            stack.extend(item)
    exact_directory = [sid for sid, directory in candidates
                       if directory and str(Path(directory).resolve()) == expected_directory]
    if len(exact_directory) == 1:
        return exact_directory[0]
    if len(exact_directory) > 1:
        return None
    if len(candidates) == 1 and not candidates[0][1]:
        return candidates[0][0]
    return None


def terminate_process_group(process):
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()


def stream_opencode(command, cwd, env, timeout_seconds, log_path, on_session=None):
    """Run OpenCode with bounded streaming logs and early session persistence."""
    log_path = Path(log_path)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    output_tail = bytearray()
    pending = bytearray()
    started = time.monotonic()
    last_heartbeat = started
    process = None
    selector = selectors.DefaultSelector()

    def consume_line(raw_line):
        line = raw_line.decode("utf-8", errors="replace")
        session_id = session_id_from_events(line)
        if session_id and on_session:
            on_session(session_id)
        try:
            event = json.loads(line)
        except ValueError:
            event = None
        if isinstance(event, dict) and event.get("type"):
            print(f"[issue-agent] OpenCode event: {str(event['type'])[:80]}", flush=True)

    with log_path.open("ab") as log:
        try:
            try:
                os.chmod(log_path, 0o600)
            except OSError:
                pass
            process = subprocess.Popen(
                command, cwd=cwd, env=env, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, bufsize=0, start_new_session=True)
            selector.register(process.stdout, selectors.EVENT_READ)
            os.set_blocking(process.stdout.fileno(), False)
            while selector.get_map() or process.poll() is None:
                elapsed = time.monotonic() - started
                if elapsed >= timeout_seconds and process.poll() is None:
                    terminate_process_group(process)
                    output = output_tail.decode("utf-8", errors="replace")
                    raise OpenCodeTimeout(timeout_seconds, output)
                ready = selector.select(timeout=1)
                if not ready:
                    if time.monotonic() - last_heartbeat >= 60:
                        print(f"[issue-agent] OpenCode still running ({int(elapsed)}s elapsed)",
                              flush=True)
                        last_heartbeat = time.monotonic()
                    continue
                for key, _ in ready:
                    try:
                        chunk = os.read(key.fd, 65536)
                    except BlockingIOError:
                        continue
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    log.write(chunk)
                    log.flush()
                    output_tail.extend(chunk)
                    if len(output_tail) > 2_000_000:
                        del output_tail[:-2_000_000]
                    pending.extend(chunk)
                    while b"\n" in pending:
                        line, _, remainder = pending.partition(b"\n")
                        pending = bytearray(remainder)
                        consume_line(line)
            if pending:
                consume_line(bytes(pending))
        finally:
            selector.close()
            if process is not None:
                if process.poll() is None:
                    terminate_process_group(process)
                if process.stdout is not None and not process.stdout.closed:
                    process.stdout.close()
    return output_tail.decode("utf-8", errors="replace"), process.wait()
def status_prompt(inp):
    return (
        f"Repository: {REPO}\nIssue #{inp['issue']}: {inp['issue_title']}\n"
        f"Original task specification:\n{inp.get('issue_body', '')}\n\n"
        "This is a STATUS-ONLY request in the existing Issue Agent session. "
        "Review the prior conversation and the current checked-out repository state. "
        "Do not edit, create, delete, rename, format, or otherwise modify any files. "
        "Do not run mutating commands, git add/commit/push, or publish anything. "
        "Use read-only inspection only.\n\n"
        "Return a concise, evidence-based report with these headings:\n"
        "1. Work completed (distinguish committed/published from uncommitted work).\n"
        "2. Current task phase and the last known concrete action.\n"
        "3. Current blockers, errors, or uncertainty.\n"
        "4. Can the original task continue? Answer YES, NO, or CONDITIONAL and explain.\n"
        "5. The exact next steps needed to continue safely.\n"
        "6. Any missing information or Runner prerequisites.\n"
        "Do not claim a test passed unless the prior session or current checkout contains evidence."
    )

def snapshot_workspace_patch(workspace, patch_path, base_sha):
    """Capture every safe tracked/untracked workspace change, including on failure."""
    git("add", "-A", "--", ".",
        ":(exclude,glob)**/__pycache__/**",
        ":(exclude,glob)**/*.pyc",
        ":(exclude,glob)**/.pytest_cache/**",
        ":(exclude,glob)**/.mypy_cache/**",
        cwd=workspace)
    paths = git("diff", "--cached", "--name-only", "-z", base_sha, cwd=workspace).stdout.split("\0")
    paths = [path for path in paths if path]
    validate_paths(paths)
    git("diff", "--cached", "--check", base_sha, cwd=workspace)
    if paths:
        modes = git("ls-files", "--stage", "-z", "--", *paths, cwd=workspace).stdout
        for row in modes.split("\0"):
            if row and row.split(" ", 1)[0] in ("120000", "160000"):
                raise RuntimeError("symlinks or submodules are not publishable")
    patch = subprocess.run(
        ["git", "diff", "--cached", "--binary", base_sha], cwd=workspace,
        capture_output=True, check=True).stdout
    if len(patch) > MAX_PATCH_BYTES:
        raise RuntimeError("generated patch exceeds maximum allowed size")
    Path(patch_path).write_bytes(patch)
    return paths, patch


def safe_summary(summary):
    for key in ("GLM_API_KEY", "DEEPSEEK_API_KEY", "GITHUB_ACCESS_TOKEN", "GITHUB_ORG_ACCESS_TOKEN", "GH_TOKEN"):
        secret = os.environ.get(key, "")
        if secret:
            summary = summary.replace(secret, "[REDACTED]")
    return summary[:5000]


def execute(args):
    inp = json.loads(Path(args.input).read_text())
    result_path = Path(args.result)
    patch_path = Path(args.patch)
    result_path.parent.mkdir(parents=True, exist_ok=True)
    patch_path.parent.mkdir(parents=True, exist_ok=True)
    patch_path.write_bytes(b"")
    state = Path(os.environ["ISSUE_AGENT_STATE"]) / "issues" / f"issue-{inp['issue']}"
    workspace = Path(args.source).resolve()
    metadata = state / "metadata.json"
    result = {"status": "failed", "issue": inp["issue"], "turn": inp["turn"],
              "session_id": None, "continuity": "unavailable", "summary": ""}
    prior = None
    env = os.environ.copy()
    for key in ("GH_TOKEN", "GITHUB_TOKEN", "AGENT_GITHUB_TOKEN",
                "GITHUB_ACCESS_TOKEN", "GITHUB_ORG_ACCESS_TOKEN"):
        env.pop(key, None)
    env["OPENCODE_DISABLE_PROJECT_CONFIG"] = "1"
    env["OPENCODE_DISABLE_EXTERNAL_SKILLS"] = "1"
    binary = os.getenv("OPENCODE_BIN", "opencode2")
    log_path = state / "logs" / (
        f"{inp['operation']}-{inp['turn']}-{inp.get('command_id') or 'dispatch'}.ndjson")
    metadata_payload = None
    try:
        state.mkdir(parents=True, exist_ok=True)
        prior = json.loads(metadata.read_text()) if metadata.exists() else None
        if prior and prior.get("issue") != inp["issue"]:
            raise RuntimeError("persistent session belongs to a different Issue")

        if inp["operation"] == "status":
            candidate = (prior or {}).get("session_id", "")
            if not SESSION_RE.fullmatch(candidate):
                candidate = discover_session_id(binary, inp["issue"], workspace, env)
            if not candidate:
                result.update(
                    status="unavailable", continuity="unavailable",
                    summary=("No unique existing OpenCode session could be recovered for this Issue. "
                             "No new model session was started. The previous run may have timed out "
                             "before its session ID was persisted; check the Runner OpenCode session "
                             "store and local execution log before attempting a fresh start."))
                result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
                return result
            verify = subprocess.run(
                [binary, "session", "export", "--standalone", candidate],
                cwd=workspace, env=env, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, timeout=40, check=False)
            if verify.returncode:
                result.update(
                    status="unavailable", continuity="unavailable",
                    session_id=candidate,
                    summary=("A matching session entry was found, but OpenCode could not export it. "
                             "The session was not queried and no replacement session was created."))
                result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
                return result
            if git("rev-parse", "--show-toplevel", cwd=workspace).stdout.strip() != str(workspace):
                raise RuntimeError("status checkout is not the expected Git worktree root")
            if git("rev-parse", "HEAD", cwd=workspace).stdout.strip() != inp["base_sha"]:
                raise RuntimeError("status checkout differs from preflight approved SHA")
            if git("status", "--porcelain", "--untracked-files=all", cwd=workspace).stdout.strip():
                raise RuntimeError("status checkout is not clean; refusing read-only session query")
            continuity = "resumed" if (prior or {}).get("session_id") == candidate else "recovered"
            metadata_payload = dict(prior or {})
            metadata_payload.update({
                "issue": inp["issue"], "session_id": candidate,
                "status": "status_query_running", "last_status_started_at": time.time(),
                "workspace": str(workspace), "last_log": str(log_path)
            })
            write_json_atomic(metadata, metadata_payload)
            result.update(session_id=candidate, continuity=continuity)
            command = [binary, "run", "--standalone", "--auto", "--format", "json",
                       "--session", candidate, status_prompt(inp)]
            output, returncode = stream_opencode(
                command, workspace, env, STATUS_TIMEOUT_SECONDS, log_path)
            if returncode != 0:
                raise RuntimeError(f"OpenCode status query failed with exit code {returncode}")
            summary = safe_summary(response_from_events(output))
            if not summary.strip():
                raise RuntimeError("OpenCode status query completed without a readable report")
            dirty = git("status", "--porcelain", "--untracked-files=all", cwd=workspace).stdout.strip()
            if dirty:
                git("reset", "--hard", "HEAD", cwd=workspace)
                git("clean", "-fd", cwd=workspace)
                raise RuntimeError("status query attempted to modify the checkout; changes were discarded")
            result.update(status="ok", summary=summary, changed_files=[])
            metadata_payload.update({
                "status": "available", "last_status_at": time.time(),
                "last_status_summary": summary[:5000]
            })
            write_json_atomic(metadata, metadata_payload)
            result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
            return result

        if prior:
            candidate = prior.get("session_id", "")
            if not SESSION_RE.fullmatch(candidate):
                candidate = discover_session_id(binary, inp["issue"], workspace, env)
                if not candidate:
                    raise RuntimeError("persistent session ID missing and no unique Runner session could be recovered")
                result["continuity"] = "recovered"
            else:
                result["continuity"] = "resumed"
            verify = subprocess.run(
                [binary, "session", "export", "--standalone", candidate],
                cwd=workspace, env=env, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, timeout=40, check=False)
            if verify.returncode:
                raise RuntimeError("existing OpenCode session missing; not silently starting a new one")
            result["session_id"] = candidate
        elif inp["operation"] == "revise":
            candidate = discover_session_id(binary, inp["issue"], workspace, env)
            if not candidate:
                raise RuntimeError("persistent Issue session metadata missing and no unique session could be recovered")
            result.update(session_id=candidate, continuity="recovered")

        if git("rev-parse", "--show-toplevel", cwd=workspace).stdout.strip() != str(workspace):
            raise RuntimeError("Actions checkout is not the expected Git worktree root")
        if git("rev-parse", "HEAD", cwd=workspace).stdout.strip() != inp["base_sha"]:
            raise RuntimeError("Actions checkout differs from preflight approved SHA")
        if git("status", "--porcelain", cwd=workspace).stdout.strip():
            raise RuntimeError("Actions checkout has unexpected pre-existing changes")
        prompt = (
            f"Repository: {REPO}\nIssue #{inp['issue']}: {inp['issue_title']}\n"
            f"Original specification:\n{inp['issue_body']}\n\n"
            f"Turn {inp['turn']}: {inp['operation']}\n"
            f"Owner feedback / PR review (ordered):\n{json.dumps(inp['feedback'], ensure_ascii=False)}\n\n"
            "Implement the requested changes in the checked-out workspace. "
            "On revisions, preserve existing implementation except for requested fixes. "
            "During iterative development prefer scoped Fast checks with `bash scripts/ci/run-pokeman.sh fast battle` (or `fast battle-browser`, `fast map`, `fast product` as relevant). Before claiming final acceptance run `bash scripts/ci/run-pokeman.sh full` or explicitly report blockers. The Release tier is for PWA qualification, not repeated during every iteration. "
            "Never change .github/, scripts/issue_agent/, scripts/ci/, loom-realm/, "
            "[FSDB]PokeMan/, AGENTS.md, .env or OpenCode config. "
            "Do not run git push, git commit, gh or attempt to publish a PR. "
            "Report what changed, what tests ran and remaining risks."
        )
        metadata_payload = {
            "issue": inp["issue"], "session_id": result["session_id"],
            "turn": inp["turn"], "status": "running",
            "started_at": time.time(), "workspace": str(workspace),
            "last_log": str(log_path)
        }
        write_json_atomic(metadata, metadata_payload)

        def persist_session(session_id):
            result["session_id"] = session_id
            metadata_payload["session_id"] = session_id
            metadata_payload["status"] = "running"
            metadata_payload["last_event_at"] = time.time()
            write_json_atomic(metadata, metadata_payload)

        command = [binary, "run", "--standalone", "--auto", "--format", "json"]
        if result["session_id"]:
            command.extend(["--session", result["session_id"]])
        else:
            command.extend(["--title", f"pokeman issue #{inp['issue']}"])
        command.append(prompt)
        output, returncode = stream_opencode(
            command, workspace, env, RUN_TIMEOUT_SECONDS, log_path, persist_session)
        if returncode != 0:
            raise RuntimeError("OpenCode process failed with exit code " + str(returncode))
        session_id = result["session_id"] or session_id_from_events(output)
        if not session_id:
            raise RuntimeError("OpenCode completed without a recoverable session ID")
        summary = safe_summary(response_from_events(output))
        paths, patch = snapshot_workspace_patch(workspace, patch_path, inp["base_sha"])
        if inp["operation"] == "start" and not patch:
            raise RuntimeError("OpenCode produced no working-tree changes in Actions checkout")
        result.update(status="ok", session_id=session_id,
                      continuity=result["continuity"] if result["continuity"] != "unavailable"
                      else ("resumed" if prior else "new"),
                      changed_files=paths, checkpoint_available=bool(patch),
                      summary=summary or "OpenCode completed successfully.")
        metadata_payload.update({
            "session_id": session_id, "turn": inp["turn"],
            "status": "completed", "completed_at": time.time()
        })
        write_json_atomic(metadata, metadata_payload)
    except Exception as ex:
        result["status"] = "failed"
        partial = getattr(ex, "output", "")
        partial_summary = safe_summary(response_from_events(partial)) if partial else ""
        result["summary"] = "Executor failed: " + str(ex)[:500]
        if partial_summary:
            result["summary"] += "\nLast model output before failure:\n" + partial_summary[:2500]
        if result.get("session_id"):
            result["continuity"] = "interrupted"
        if metadata_payload is None:
            metadata_payload = dict(prior or {})
        metadata_payload.update({
            "issue": inp["issue"], "session_id": result.get("session_id"),
            "turn": inp.get("turn"), "status": "interrupted",
            "last_error": str(ex)[:1000], "last_interrupted_at": time.time(),
            "last_log": str(log_path)
        })
        try:
            write_json_atomic(metadata, metadata_payload)
        except Exception:
            pass
        try:
            paths, partial_patch = snapshot_workspace_patch(workspace, patch_path, inp["base_sha"])
            result["changed_files"] = paths
            result["checkpoint_available"] = bool(partial_patch)
            if partial_patch:
                result["summary"] += (
                    f"\nRecoverable partial code checkpoint captured: "
                    f"{len(paths)} files, {len(partial_patch)} bytes. "
                    "The publisher can preserve this work in the existing Draft PR."
                )
        except Exception as snapshot_error:
            patch_path.write_bytes(b"")
            result["checkpoint_available"] = False
            result["checkpoint_error"] = str(snapshot_error)[:500]
            result["summary"] += (
                "\nWorkspace changes could not be packaged safely: "
                + str(snapshot_error)[:500]
            )
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"Issue #{inp['issue']} {inp['operation']} {inp['turn']}: {result['status']} "
          f"({len(result.get('changed_files', []))} files)")
    return result

def git_push(branch):
    token = os.environ["GH_TOKEN"]
    # Never persist the token in .git/config. GitHub Actions logs mask secrets.
    cred = __import__("base64").b64encode(f"x-access-token:{token}".encode()).decode()
    git("-c", "credential.helper=", "-c",
        "http.https://github.com/.extraheader=AUTHORIZATION: basic " + cred,
        "push", "origin", "HEAD:refs/heads/" + branch)


def prepare(args):
    """Create the Issue branch and Draft PR before OpenCode starts."""
    inp = json.loads(Path(args.input).read_text())
    workspace = Path.cwd().resolve()
    operation = inp["operation"]
    if git("rev-parse", "--show-toplevel", cwd=workspace).stdout.strip() != str(workspace):
        raise RuntimeError("prepare checkout is not the repository root")
    if git("rev-parse", "HEAD", cwd=workspace).stdout.strip() != inp["base_sha"]:
        raise RuntimeError("prepare checkout differs from the approved preflight SHA")

    if operation != "status":
        branch = inp["branch"]
        pr = find_agent_pr(inp["issue"])
        if pr:
            if (pr.get("state") != "open"
                    or pr.get("head", {}).get("ref") != branch
                    or pr.get("head", {}).get("repo", {}).get("full_name") != REPO
                    or pr.get("base", {}).get("ref") != "main"
                    or MARKER.format(issue=inp["issue"]) not in (pr.get("body") or "")):
                raise RuntimeError("existing Agent PR failed provenance or open-state validation")
            head_sha = pr.get("head", {}).get("sha")
            if head_sha != inp["base_sha"]:
                raise RuntimeError("existing Agent PR head changed after preflight")
            number = pr["number"]
        else:
            try:
                branch_ref = api("GET", f"/repos/{REPO}/git/ref/heads/{branch}")
            except LookupError:
                if operation != "start":
                    raise RuntimeError("Agent branch is missing; refusing to create a PR without its code")
                git("switch", "-c", branch, cwd=workspace)
                git("config", "user.name", "github-actions[bot]", cwd=workspace)
                git("config", "user.email",
                    "41898282+github-actions[bot]@users.noreply.github.com", cwd=workspace)
                git("commit", "--allow-empty", "-m",
                    f"feat(agent): issue #{inp['issue']} turn 0 (initialize recoverable Draft PR)",
                    cwd=workspace)
                git_push(branch)
                head_sha = git("rev-parse", "HEAD", cwd=workspace).stdout.strip()
            else:
                head_sha = branch_ref["object"]["sha"]
                if head_sha != inp["base_sha"]:
                    raise RuntimeError("existing Agent branch moved after preflight")
                committed = api("GET", f"/repos/{REPO}/commits/{head_sha}")
                message = committed.get("commit", {}).get("message", "")
                if (committed.get("author", {}).get("login") != "github-actions[bot]"
                        or not message.startswith(f"feat(agent): issue #{inp['issue']} turn ")):
                    raise RuntimeError("existing Issue branch was not published by this Agent")

            title = f"agent: {inp['issue_title']}"[:200]
            body = (
                MARKER.format(issue=inp["issue"]) + "\n\n"
                f"Implements #{inp['issue']} using OpenCode 2 on the organization runner.\n\n"
                "Draft PR is created before AI execution so the Issue branch and review surface "
                "survive model errors, timeouts, and missing result artifacts. Partial safe "
                "checkpoints are pushed here; subsequent turns update this same PR.\n\n"
                "Post feedback on the linked Issue or in PR review, then comment "
                "/agent revise on the Issue. Never auto-merge."
            )
            created = api("POST", f"/repos/{REPO}/pulls",
                          {"title": title, "head": branch, "base": "main",
                           "body": body, "draft": True})
            number = created["number"]

        inp["pr"] = number
        inp["base_sha"] = head_sha
        inp["prepared_at"] = time.time()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(inp, ensure_ascii=False, indent=2) + "\n")
    with Path(args.github_output).open("a") as stream:
        stream.write(f"base_sha={inp['base_sha']}\n")
        if inp.get("pr") is not None:
            stream.write(f"pr_number={inp['pr']}\n")
    print(f"Prepared Issue #{inp['issue']} operation={operation} "
          f"branch={inp['branch']} PR={inp.get('pr')} SHA={inp['base_sha'][:12]}")


def result_comment(inp, result, pr=None, error=None):
    issue = inp["issue"]
    command = inp["command_id"]
    if inp.get("operation") == "status":
        marker = f"<!-- pokeman-agent-status:issue={issue};comment={command} -->"
        status = result.get("status")
        if status == "ok":
            label = "AI status retrieved"
        elif status == "unavailable":
            label = "existing AI session unavailable"
        else:
            label = "status query failed"
        return "\n".join([
            marker,
            "### OpenCode Issue Agent — status check",
            f"- Status: **{label}**",
            f"- Session: **{result.get('continuity', 'unavailable')}**",
            f"- Existing PR: {'#' + str(pr) if pr else 'not published'}",
            f"- GitHub Actions run: {os.environ.get('GITHUB_RUN_ID', 'unknown')}",
            "",
            "#### AI progress and recommendation",
            safe_summary(result.get("summary", "") or "No status report available."),
            "",
            "This status check does not consume owner feedback, modify the code patch, "
            "or advance the coding checkpoint."
        ])[:12000]
    turn = inp["turn"]
    success = not error and result.get("status") == "ok"
    changed = result.get("changed_files", [])
    continuity = result.get("continuity", "unavailable")
    if not success and result.get("session_id"):
        continuity = "interrupted; session ID persisted for recovery"
    if result.get("checkpoint_published"):
        checkpoint = "partial or complete code checkpoint pushed to the PR branch"
    elif result.get("checkpoint_available"):
        checkpoint = "recoverable code checkpoint was captured; see publishing result"
    else:
        checkpoint = "no new code checkpoint; existing branch and Draft PR retained"
    body = [
        f"<!-- pokeman-agent-turn:issue={issue};comment={command};turn={turn} -->",
        f"### OpenCode Issue Agent — turn {turn}",
        f"- Status: **{'completed' if success else 'failed / needs attention'}**",
        f"- Session: **{continuity}**",
        f"- PR: {'#' + str(pr) if pr else 'not available'}",
        f"- Branch: `{inp.get('branch', 'unknown')}`",
        f"- Checkpoint: {checkpoint}",
        f"- Changed files: {len(changed)}",
        f"- GitHub Actions run: {os.environ.get('GITHUB_RUN_ID', 'unknown')}",
        "",
        "#### Agent summary",
        safe_summary(result.get("summary", "") or "No agent summary available.")
    ]
    if error:
        body.extend(["", "#### Publishing error", str(error)[:1000]])
    body.append("\nHuman review and merge are required; this workflow never auto-merges.")
    return "\n".join(body)[:12000]

def publish(args):
    inp = json.loads(Path(args.input).read_text())
    candidate_path = Path(args.result)
    result = json.loads(candidate_path.read_text()) if candidate_path.is_file() else {
        "status": "failed", "continuity": "unavailable",
        "summary": "Executor did not produce a result artifact; the pre-created Draft PR is retained.",
        "changed_files": []
    }
    if result.get("issue") not in (None, inp["issue"]):
        raise RuntimeError("result artifact belongs to another Issue")
    if result.get("turn") not in (None, inp["turn"]):
        raise RuntimeError("result artifact turn mismatch")
    for comment in pages(f"/repos/{REPO}/issues/{inp['issue']}/comments"):
        if (comment.get("user") or {}).get("id") not in (41898282, OWNER_ID):
            continue
        body = comment.get("body") or ""
        turn_match = STATUS_RE.search(body)
        status_match = STATUS_COMMAND_RE.search(body)
        if inp.get("operation") == "status":
            if (status_match and int(status_match[1]) == inp["issue"]
                    and int(status_match[2]) == inp["command_id"]):
                print("This status command already has a published result; skipping duplicate comment.")
                return
        elif turn_match and (int(turn_match[1]), int(turn_match[2]), int(turn_match[3])) == (
                inp["issue"], inp["command_id"], inp["turn"]):
            print("This command already has a published result; skipping duplicate push.")
            return

    number = inp.get("pr")
    if inp.get("operation") == "status":
        api("POST", f"/repos/{REPO}/issues/{inp['issue']}/comments",
            {"body": result_comment(inp, result, number)})
        print(f"Published read-only status report for Issue #{inp['issue']}")
        if result.get("status") == "failed":
            raise RuntimeError("OpenCode status query failed; diagnostic report was posted")
        return

    if inp["operation"] == "recover":
        result = {
            "status": "ok", "continuity": "preserved",
            "summary": "Recovered the existing Agent branch and prepared its Draft PR without rerunning OpenCode.",
            "changed_files": [], "issue": inp["issue"], "turn": inp["turn"],
            "checkpoint_published": False
        }

    failure = None
    try:
        if not number:
            raise RuntimeError("prepared Draft PR number is missing; refusing an unreviewed code push")
        if git("rev-parse", "HEAD").stdout.strip() != inp["base_sha"]:
            raise RuntimeError("publisher checkout SHA differs from the prepared PR head")
        current = api("GET", f"/repos/{REPO}/pulls/{number}")
        if (current.get("state") != "open"
                or current.get("head", {}).get("sha") != inp["base_sha"]
                or current.get("head", {}).get("ref") != inp["branch"]
                or MARKER.format(issue=inp["issue"]) not in (current.get("body") or "")):
            raise RuntimeError("Draft PR changed or failed provenance validation; refusing stale push")

        patch = Path(args.patch)
        patch_bytes = patch.read_bytes() if patch.is_file() else b""
        if len(patch_bytes) > MAX_PATCH_BYTES:
            raise RuntimeError("patch artifact exceeds maximum allowed size")
        if patch_bytes:
            git("apply", "--check", "--index", patch)
            git("apply", "--index", patch)
            paths = [x for x in git("diff", "--cached", "--name-only", "-z").stdout.split("\0") if x]
            validate_paths(paths)
            git("diff", "--cached", "--check")
            modes = git("ls-files", "--stage", "-z", "--", *paths).stdout
            for row in modes.split("\0"):
                if row and row.split(" ", 1)[0] in ("120000", "160000"):
                    raise RuntimeError("symlinks or submodules are not publishable")
            git("config", "user.name", "github-actions[bot]")
            git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com")
            if result.get("status") == "ok":
                message = f"feat(agent): issue #{inp['issue']} turn {inp['turn']}"
            else:
                message = f"wip(agent): issue #{inp['issue']} turn {inp['turn']} (partial checkpoint)"
            git("commit", "-m", message)
            git_push(inp["branch"])
            result["checkpoint_published"] = True
            result["checkpoint_commit"] = git("rev-parse", "HEAD").stdout.strip()
            result["changed_files"] = paths
        else:
            result["checkpoint_published"] = False
            result["changed_files"] = result.get("changed_files", [])
            if result.get("status") == "ok" and inp["operation"] == "start":
                result["status"] = "failed"
                result["summary"] = (
                    (result.get("summary", "") + "\n"
                     "OpenCode completed without a code diff. The pre-created Draft PR and branch remain available.")
                ).strip()
    except Exception as ex:
        failure = str(ex)
        result["status"] = "failed"
        result["summary"] = (
            (result.get("summary", "") + "\nPublisher could not publish this checkpoint: " + failure[:800])
        ).strip()
        print(f"Publish failure for Issue #{inp['issue']}: {failure}", file=sys.stderr)

    # Even when execution or publication failed, always report against the
    # already-created PR. Never delete or close the branch/PR as cleanup.
    api("POST", f"/repos/{REPO}/issues/{inp['issue']}/comments",
        {"body": result_comment(inp, result, number, failure)})
    if failure:
        raise RuntimeError(failure)
    print(f"Preserved Issue #{inp['issue']} on PR #{number}; "
          f"checkpoint_published={result.get('checkpoint_published', False)}")

def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="action", required=True)
    pre = commands.add_parser("preflight")
    pre.add_argument("--event", required=True)
    pre.add_argument("--output", required=True)
    pre.add_argument("--github-output", required=True)
    prep = commands.add_parser("prepare")
    prep.add_argument("--input", required=True)
    prep.add_argument("--output", required=True)
    prep.add_argument("--github-output", required=True)
    exe = commands.add_parser("execute")
    exe.add_argument("--input", required=True)
    exe.add_argument("--result", required=True)
    exe.add_argument("--patch", required=True)
    exe.add_argument("--source", required=True)
    pub = commands.add_parser("publish")
    pub.add_argument("--input", required=True)
    pub.add_argument("--result", required=True)
    pub.add_argument("--patch", required=True)
    args = parser.parse_args()
    if args.action == "preflight":
        preflight(args)
    elif args.action == "prepare":
        prepare(args)
    elif args.action == "publish":
        publish(args)
    else:
        result = execute(args)
        if result.get("status") == "failed":
            raise SystemExit(1)

if __name__ == "__main__":
    main()
