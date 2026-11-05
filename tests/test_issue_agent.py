"""Offline integration and authorization tests for the Issue Agent."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("issue_agent", ROOT / "scripts/issue_agent/agent.py")
agent = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(agent)


def run(*args, cwd=None):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, check=True)


class AuthTests(unittest.TestCase):
    def test_owner_issue_command(self):
        event = {"issue": {"number": 42, "user": {"id": agent.OWNER_ID}},
                 "comment": {"id": 1234, "user": {"id": agent.OWNER_ID},
                             "body": "/agent start"}}
        self.assertEqual(agent.event_request(event, "issue_comment", {}, "lithdoo"),
                         (42, "start", 1234))

    def test_owner_issue_status_command(self):
        event = {"issue": {"number": 42, "user": {"id": agent.OWNER_ID}},
                 "comment": {"id": 1235, "user": {"id": agent.OWNER_ID},
                             "body": "/agent status"}}
        self.assertEqual(agent.event_request(event, "issue_comment", {}, "lithdoo"),
                         (42, "status", 1235))

    def test_status_comment_does_not_advance_coding_checkpoint(self):
        body = agent.result_comment(
            {"issue": 42, "operation": "status", "command_id": 1235},
            {"status": "ok", "continuity": "recovered",
             "summary": "Can continue: YES."})
        comments = [{"id": 999, "created_at": "2026-11-01T00:00:00Z",
                     "user": {"id": 41898282}, "body": body}]
        self.assertIsNone(agent.get_last_checkpoint(comments, 42, 0))

    def test_preflight_status_does_not_require_pr_or_consume_feedback(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            event = root / "event.json"
            output = root / "input.json"
            github_output = root / "out"
            event.write_text(json.dumps({
                "issue": {"number": 43, "user": {"id": agent.OWNER_ID}},
                "comment": {"id": 777, "body": "/agent status",
                            "user": {"id": agent.OWNER_ID}}
            }))
            main_sha = "b" * 40

            def fake_api(method, route, payload=None):
                if route.endswith("/issues/43"):
                    return {"number": 43, "state": "open", "title": "Status test",
                            "body": "Do work", "user": {"id": agent.OWNER_ID}}
                if route.endswith("/issues/comments/777"):
                    return {"id": 777, "user": {"id": agent.OWNER_ID},
                            "issue_url": "https://api.github.com/repos/lithdoo-labs/pokeman/issues/43"}
                if "/pulls?" in route:
                    return []
                if route.endswith("/git/ref/heads/agent/issue-43"):
                    raise LookupError(route)
                if route.endswith("/git/ref/heads/main"):
                    return {"object": {"sha": main_sha}}
                raise AssertionError("Unexpected API: " + route)

            with patch.object(agent, "api", side_effect=fake_api), \
                 patch.object(agent, "pages", return_value=[]), \
                 patch.dict(os.environ, {"GITHUB_EVENT_NAME": "issue_comment",
                                         "ACTOR": "lithdoo"}, clear=False):
                agent.preflight(SimpleNamespace(event=str(event), output=str(output),
                                                github_output=str(github_output)))
            payload = json.loads(output.read_text())
            self.assertEqual(payload["operation"], "status")
            self.assertEqual(payload["base_sha"], main_sha)
            self.assertEqual(payload["feedback"], [])
            self.assertIn("operation=status", github_output.read_text())

    def test_reject_fork_comment_or_untrusted_issue(self):
        base = {"issue": {"number": 42, "user": {"id": agent.OWNER_ID}},
                "comment": {"id": 1234, "user": {"id": 12}, "body": "/agent start"}}
        with self.assertRaises(RuntimeError):
            agent.event_request(base, "issue_comment", {}, "stranger")
        base["comment"]["user"]["id"] = agent.OWNER_ID
        base["issue"]["user"]["id"] = 12
        with self.assertRaises(RuntimeError):
            agent.event_request(base, "issue_comment", {}, "lithdoo")
        base["issue"]["user"]["id"] = agent.OWNER_ID
        base["issue"]["pull_request"] = {}
        # Even if a malformed event lacks a truthy pull_request field,
        # preflight checks GitHub's live Issue object separately.
        self.assertEqual(agent.event_request(base, "issue_comment", {}, "lithdoo")[0], 42)
        base["issue"]["pull_request"] = {"url": "https://example.com"}
        with self.assertRaises(RuntimeError):
            agent.event_request(base, "issue_comment", {}, "lithdoo")

    def test_dispatch_only_owner(self):
        with self.assertRaises(RuntimeError):
            agent.event_request({}, "workflow_dispatch",
                                {"issue_number": "1", "operation": "start"}, "stranger")
        self.assertEqual(agent.event_request({}, "workflow_dispatch",
                           {"issue_number": "42", "operation": "revise"}, "lithdoo"),
                         (42, "revise", 0))

    def test_protected_patch_paths(self):
        agent.validate_paths(["src/main.py", "docs/features.md", "game.json", "subsystems/map.mjs", "test/map-smoke.test.mjs", "game-libs/map/src/index.ts"])
        for name in (".github/workflows/malicious.yml", ".env", "AGENTS.md",
                     "scripts/issue_agent/agent.py", "scripts/ci/run-pokeman.sh",
                     ".gitmodules", ".gitignore", ".raw/client.bin",
                     "loom-realm/packages/subsystem/src/model.ts",
                     "[FSDB]PokeMan/[resource]Graphics/Characters/Player.png",
                     "opencode.json", "tools/.env.secret",
                     "../escape", "a/AGENTS.md"):
            with self.subTest(name=name), self.assertRaises(RuntimeError):
                agent.validate_paths([name])


    def test_safe_summary_redacts_deepseek_api_key(self):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "mock-deepseek-token"}, clear=False):
            self.assertNotIn("mock-deepseek-token", agent.safe_summary("value=mock-deepseek-token"))

    def test_checkpoint_feedback_and_session_event(self):
        checkpoint = {"id": 900, "created_at": "2026-11-01T00:00:00Z", "turn": 1}
        comments = [
            {"id": 900, "created_at": "2026-11-01T00:00:00Z",
             "user": {"id": 41898282},
             "body": "<!-- pokeman-agent-turn:issue=42;comment=100;turn=1 -->"},
            {"id": 901, "created_at": "2026-11-01T00:01:00Z",
             "user": {"id": agent.OWNER_ID}, "body": "Change the display label"},
            {"id": 902, "created_at": "2026-11-01T00:02:00Z",
             "user": {"id": agent.OWNER_ID}, "body": "/agent revise"},
            {"id": 903, "created_at": "2026-11-01T00:03:00Z",
             "user": {"id": 2}, "body": "Untrusted extra input"}
        ]
        found = agent.get_last_checkpoint(comments, 42, 902)
        self.assertEqual(found["turn"], 1)
        feedback = agent.collect_feedback(42, "revise", 902, None, comments, checkpoint)
        self.assertEqual(len(feedback), 1)
        self.assertIn("display label", feedback[0]["text"])
        self.assertEqual(agent.session_id_from_events(
            '{"type":"text","part":{"sessionID":"ses_testabc"}}\n'), "ses_testabc")

    def test_unauthorized_checkpoint_spoof_ignored(self):
        comments = [
            {"id": 100, "created_at": "2026-11-01T00:00:00Z",
             "user": {"id": 41898282},
             "body": "<!-- pokeman-agent-turn:issue=42;comment=100;turn=1 -->"},
            {"id": 200, "created_at": "2026-11-01T00:01:00Z",
             "user": {"id": 99999},
             "body": "<!-- pokeman-agent-turn:issue=42;comment=200;turn=9000 -->"}
        ]
        checkpoint = agent.get_last_checkpoint(comments, 42, 0)
        self.assertEqual(checkpoint["id"], 100)
        self.assertEqual(checkpoint["turn"], 1)

    def test_recover_orphan_branch_without_running_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            event = root / "event.json"
            output = root / "out"
            snapshot = root / "input.json"
            event.write_text(json.dumps({
                "issue": {"number": 42, "user": {"id": agent.OWNER_ID}},
                "comment": {"id": 250, "body": "/agent start",
                            "user": {"id": agent.OWNER_ID}}
            }))
            sha = "a" * 40
            def fake_api(method, route, payload=None):
                if route.endswith("/issues/42"):
                    return {"number": 42, "state": "open", "title": "Agent test",
                            "body": "Implement docs", "user": {"id": agent.OWNER_ID}}
                if route.endswith("/issues/comments/250"):
                    return {"id": 250, "user": {"id": agent.OWNER_ID},
                            "issue_url": "https://api.github.com/repos/lithdoo-labs/pokeman/issues/42"}
                if "/pulls?" in route:
                    return []
                if route.endswith("/git/ref/heads/agent/issue-42"):
                    return {"object": {"sha": sha}}
                if route.endswith("/commits/" + sha):
                    return {"author": {"login": "github-actions[bot]"},
                            "commit": {"message": "feat(agent): issue #42 turn 1"}}
                raise AssertionError("Unexpected API: " + route)
            with patch.object(agent, "api", side_effect=fake_api), \
                 patch.object(agent, "pages", return_value=[]), \
                 patch.dict(os.environ, {"GITHUB_EVENT_NAME": "issue_comment",
                                         "ACTOR": "lithdoo"}, clear=False):
                agent.preflight(SimpleNamespace(event=str(event), output=str(snapshot),
                                                github_output=str(output)))
            result = json.loads(snapshot.read_text())
            self.assertEqual(result["operation"], "start")
            self.assertEqual(result["base_sha"], sha)
            self.assertIn("operation=start", output.read_text())

    def test_start_retry_reuses_existing_open_draft_pr(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            event = root / "event.json"
            output = root / "input.json"
            github_output = root / "out"
            event.write_text(json.dumps({
                "issue": {"number": 42, "user": {"id": agent.OWNER_ID}},
                "comment": {"id": 300, "user": {"id": agent.OWNER_ID},
                            "body": "/agent start"}
            }))
            head_sha = "c" * 40

            def fake_api(method, route, payload=None):
                if route.endswith("/issues/42"):
                    return {"number": 42, "state": "open", "title": "Retry",
                            "body": "Continue", "user": {"id": agent.OWNER_ID}}
                if route.endswith("/issues/comments/300"):
                    return {"id": 300, "user": {"id": agent.OWNER_ID},
                            "issue_url": "https://api.github.com/repos/lithdoo-labs/pokeman/issues/42"}
                if "/pulls?" in route:
                    return [{
                        "number": 88, "state": "open",
                        "head": {"ref": "agent/issue-42", "sha": head_sha,
                                 "repo": {"full_name": agent.REPO}},
                        "base": {"ref": "main"},
                        "body": agent.MARKER.format(issue=42)
                    }]
                raise AssertionError("Unexpected API: " + route)

            with patch.object(agent, "api", side_effect=fake_api), \
                 patch.object(agent, "pages", return_value=[]), \
                 patch.dict(os.environ, {"GITHUB_EVENT_NAME": "issue_comment",
                                         "ACTOR": "lithdoo"}, clear=False):
                agent.preflight(SimpleNamespace(event=str(event), output=str(output),
                                                github_output=str(github_output)))
            prepared = json.loads(output.read_text())
            self.assertEqual(prepared["operation"], "start")
            self.assertEqual(prepared["pr"], 88)
            self.assertEqual(prepared["base_sha"], head_sha)

    def test_four_hour_executor_timeout_has_runner_headroom(self):
        self.assertEqual(agent.RUN_TIMEOUT_SECONDS, 4 * 60 * 60)
        workflow = (ROOT / ".github/workflows/issue-agent.yml").read_text()
        self.assertIn("timeout-minutes: 270", workflow)
        self.assertIn("Create or recover Issue branch and Draft PR", workflow)
        self.assertIn("issue-agent-prepared-input", workflow)

    def test_preflight_start_and_same_pr_revision(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            event = root / "event.json"
            state = root / "input.json"
            output = root / "out"
            event.write_text(json.dumps({
                "issue": {"number": 42, "user": {"id": agent.OWNER_ID}},
                "comment": {"id": 201, "user": {"id": agent.OWNER_ID},
                            "body": "/agent start"}
            }))
            calls = []
            def fake_api(method, route, payload=None):
                calls.append(route)
                if route.endswith("/issues/42"):
                    return {"number": 42, "state": "open", "title": "Test",
                            "body": "Implement test", "user": {"id": agent.OWNER_ID}}
                if route.endswith("/issues/comments/201"):
                    return {"id": 201, "user": {"id": agent.OWNER_ID},
                            "issue_url": "https://api.github.com/repos/lithdoo-labs/pokeman/issues/42"}
                if route.startswith("/repos/lithdoo-labs/pokeman/pulls?"):
                    return []
                if route.endswith("/git/ref/heads/agent/issue-42"):
                    raise LookupError(route)
                if route.endswith("/git/ref/heads/main"):
                    return {"object": {"sha": "abc123"}}
                return []
            args = SimpleNamespace(event=str(event), output=str(state),
                                   github_output=str(output))
            with patch.object(agent, "api", side_effect=fake_api), \
                 patch.object(agent, "pages", return_value=[]), \
                 patch.dict(os.environ, {"GITHUB_EVENT_NAME": "issue_comment",
                                         "ACTOR": "lithdoo"}, clear=False):
                agent.preflight(args)
            result = json.loads(state.read_text())
            self.assertEqual(result["branch"], "agent/issue-42")
            self.assertEqual(result["turn"], 1)
            self.assertIsNone(result["pr"])
            self.assertIn("allowed=true", output.read_text())




class PrepareIntegrationTests(unittest.TestCase):
    def test_prepare_pushes_recoverable_branch_and_creates_draft_before_ai(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            remote = root / "origin.git"
            run("git", "init", "--bare", "-q", str(remote))
            local = root / "checkout"
            run("git", "clone", "-q", str(remote), str(local))
            run("git", "config", "user.name", "Test", cwd=local)
            run("git", "config", "user.email", "test@example.com", cwd=local)
            (local / "README.md").write_text("baseline\n")
            run("git", "add", ".", cwd=local)
            run("git", "commit", "-qm", "initial", cwd=local)
            run("git", "push", "-q", "origin", "HEAD:refs/heads/main", cwd=local)
            base_sha = run("git", "rev-parse", "HEAD", cwd=local).stdout.strip()
            input_path = root / "input.json"
            input_path.write_text(json.dumps({
                "issue": 42, "turn": 1, "operation": "start", "command_id": 77,
                "issue_title": "Prepare test", "issue_body": "Implement safely",
                "branch": "agent/issue-42", "base_sha": base_sha, "pr": None
            }))
            output_path = root / "prepared.json"
            github_output = root / "github-output"
            created = []

            def fake_api(method, route, payload=None):
                if method == "GET" and "/pulls?" in route:
                    return []
                if method == "GET" and route.endswith("/git/ref/heads/agent/issue-42"):
                    raise LookupError(route)
                if method == "POST" and route.endswith("/pulls"):
                    created.append(payload)
                    return {"number": 88}
                raise AssertionError(f"Unexpected API call: {method} {route}")

            old_cwd = Path.cwd()
            os.chdir(local)
            try:
                with patch.object(agent, "api", side_effect=fake_api), \
                     patch.dict(os.environ, {"GH_TOKEN": "test-token"}, clear=False):
                    agent.prepare(SimpleNamespace(input=str(input_path), output=str(output_path),
                                                  github_output=str(github_output)))
            finally:
                os.chdir(old_cwd)
            prepared = json.loads(output_path.read_text())
            self.assertEqual(prepared["pr"], 88)
            self.assertNotEqual(prepared["base_sha"], base_sha)
            self.assertEqual(len(created), 1)
            self.assertTrue(created[0]["draft"])
            self.assertIn("pokeman-issue-agent:issue=42", created[0]["body"])
            remote_sha = run("git", "ls-remote", "origin", "refs/heads/agent/issue-42", cwd=local).stdout.split()[0]
            self.assertEqual(remote_sha, prepared["base_sha"])
            subject = run("git", "show", "-s", "--format=%s", remote_sha, cwd=local).stdout.strip()
            self.assertIn("turn 0", subject)
            self.assertIn("pr_number=88", github_output.read_text())


class RunnerIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        run("git", "init", "-q", self.source)
        run("git", "config", "user.name", "Test", cwd=self.source)
        run("git", "config", "user.email", "test@example.com", cwd=self.source)
        (self.source / "README.md").write_text("baseline\n")
        run("git", "add", ".", cwd=self.source)
        run("git", "commit", "-qm", "initial", cwd=self.source)
        self.binary = self.root / "fake-opencode"
        self.binary.write_text(
            "#!/usr/bin/env python3\n"
            "import json,sys,pathlib\n"
            "a=sys.argv[1:]\n"
            "if a[0]=='session':\n"
            "    assert 'ses_testabc' in a\n"
            "    print('{}')\n"
            "else:\n"
            "    assert a[0]=='run'\n"
            "    if '--session' in a: assert a[a.index('--session')+1]=='ses_testabc'\n"
            "    p=pathlib.Path('README.md')\n"
            "    p.write_text(p.read_text()+'OpenCode changed the project.\\n')\n"
            "    print(json.dumps({'type':'text','part':{'type':'text','text':'Implemented and checked the changes.'},'sessionID':'ses_testabc'}))\n"
        )
        self.binary.chmod(0o755)
        self.state = self.root / "state"

    def execute(self, operation, turn):
        path = self.root / f"input-{turn}.json"
        path.write_text(json.dumps({
            "issue": 42, "operation": operation, "turn": turn,
            "issue_title": "Update README", "issue_body": "Make a change",
            "feedback": [{"source": "Issue", "text": "Please refine it"}] if turn > 1 else [],
            "base_sha": run("git", "rev-parse", "HEAD", cwd=self.source).stdout.strip(),
            "branch": "agent/issue-42", "command_id": turn
        }))
        result = self.root / f"result-{turn}.json"
        artifact = self.root / f"patch-{turn}.diff"
        with patch.dict(os.environ, {"ISSUE_AGENT_STATE": str(self.state),
                                     "OPENCODE_BIN": str(self.binary)}, clear=False):
            agent.execute(SimpleNamespace(input=str(path), source=str(self.source),
                                          result=str(result), patch=str(artifact)))
        return json.loads(result.read_text()), artifact.read_bytes()

    def test_status_recovers_orphan_session_and_queries_same_session_read_only(self):
        status_binary = self.root / "fake-status-opencode"
        status_binary.write_text(
            "#!/usr/bin/env python3\n"
            "import json,sys,pathlib\n"
            "a=sys.argv[1:]\n"
            "if a[:2]==['session','list']:\n"
            "    print(json.dumps([{'id':'ses_testabc','title':'pokeman issue #42','directory':str(pathlib.Path.cwd())}]))\n"
            "elif a[:2]==['session','export']:\n"
            "    assert 'ses_testabc' in a\n"
            "    print('{}')\n"
            "elif a[0]=='run':\n"
            "    assert '--session' in a and a[a.index('--session')+1]=='ses_testabc'\n"
            "    assert 'STATUS-ONLY' in a[-1]\n"
            "    print(json.dumps({'type':'text','part':{'type':'text','text':'Completed converter review. Can continue: YES. Next: run the synthetic tests.'},'sessionID':'ses_testabc'}),flush=True)\n"
            "else: raise SystemExit(9)\n"
        )
        status_binary.chmod(0o755)
        path = self.root / "status-input.json"
        path.write_text(json.dumps({
            "issue": 42, "operation": "status", "turn": 1, "command_id": 999,
            "issue_title": "Update README", "issue_body": "Make a change",
            "base_sha": run("git", "rev-parse", "HEAD", cwd=self.source).stdout.strip(),
            "branch": "agent/issue-42", "pr": None, "feedback": []
        }))
        result_path = self.root / "status-result.json"
        patch_path = self.root / "status.patch"
        with patch.dict(os.environ, {"ISSUE_AGENT_STATE": str(self.state),
                                     "OPENCODE_BIN": str(status_binary)}, clear=False):
            result = agent.execute(SimpleNamespace(input=str(path), source=str(self.source),
                                                   result=str(result_path), patch=str(patch_path)))
        self.assertEqual(result["status"], "ok", result)
        self.assertEqual(result["continuity"], "recovered")
        self.assertIn("Can continue: YES", result["summary"])
        self.assertEqual(patch_path.read_bytes(), b"")
        metadata = json.loads((self.state / "issues/issue-42/metadata.json").read_text())
        self.assertEqual(metadata["session_id"], "ses_testabc")
        self.assertEqual(metadata["status"], "available")
        self.assertEqual(run("git", "status", "--porcelain", cwd=self.source).stdout, "")

    def test_status_without_unique_session_never_starts_new_model_session(self):
        status_binary = self.root / "fake-no-session-opencode"
        marker = self.root / "model-was-run"
        status_binary.write_text(
            "#!/usr/bin/env python3\n"
            "import json,sys,pathlib\n"
            "a=sys.argv[1:]\n"
            "if a[:2]==['session','list']:\n"
            "    print('[]')\n"
            "elif a[0]=='run':\n"
            f"    pathlib.Path({str(marker)!r}).write_text('unexpected')\n"
            "    raise SystemExit(9)\n"
            "else: raise SystemExit(9)\n"
        )
        status_binary.chmod(0o755)
        path = self.root / "status-no-session-input.json"
        path.write_text(json.dumps({
            "issue": 42, "operation": "status", "turn": 1, "command_id": 1000,
            "issue_title": "Update README", "issue_body": "Make a change",
            "base_sha": run("git", "rev-parse", "HEAD", cwd=self.source).stdout.strip(),
            "branch": "agent/issue-42", "pr": None, "feedback": []
        }))
        with patch.dict(os.environ, {"ISSUE_AGENT_STATE": str(self.state),
                                     "OPENCODE_BIN": str(status_binary)}, clear=False):
            result = agent.execute(SimpleNamespace(
                input=str(path), source=str(self.source),
                result=str(self.root / "status-no-session-result.json"),
                patch=str(self.root / "status-no-session.patch")))
        self.assertEqual(result["status"], "unavailable")
        self.assertFalse(marker.exists())

    def test_stream_timeout_preserves_early_session_id_and_partial_log(self):
        slow = self.root / "fake-slow-opencode"
        slow.write_text(
            "#!/usr/bin/env python3\n"
            "import json,time\n"
            "print(json.dumps({'type':'session.created','sessionID':'ses_testabc'}),flush=True)\n"
            "time.sleep(5)\n"
        )
        slow.chmod(0o755)
        captured = []
        log = self.root / "timeout.ndjson"
        with self.assertRaises(agent.OpenCodeTimeout):
            agent.stream_opencode([str(slow)], self.source, os.environ.copy(),
                                  1, log, captured.append)
        self.assertEqual(captured, ["ses_testabc"])
        self.assertIn("ses_testabc", log.read_text())


    def test_timeout_captures_partial_workspace_patch_for_publisher(self):
        slow = self.root / "fake-opencode-timeout-with-edits"
        slow.write_text(
            "#!/usr/bin/env python3\n"
            "import json,pathlib,time\n"
            "p=pathlib.Path('README.md')\n"
            "p.write_text(p.read_text()+'partial work before timeout\\n')\n"
            "print(json.dumps({'type':'session.created','sessionID':'ses_testabc'}),flush=True)\n"
            "time.sleep(5)\n"
        )
        slow.chmod(0o755)
        path = self.root / "timeout-input.json"
        path.write_text(json.dumps({
            "issue": 42, "operation": "start", "turn": 1,
            "issue_title": "Update README", "issue_body": "Make a change",
            "feedback": [], "base_sha": run("git", "rev-parse", "HEAD", cwd=self.source).stdout.strip(),
            "branch": "agent/issue-42", "command_id": 222
        }))
        result_path = self.root / "timeout-result.json"
        patch_path = self.root / "timeout.patch"
        with patch.dict(os.environ, {"ISSUE_AGENT_STATE": str(self.state),
                                     "OPENCODE_BIN": str(slow)}, clear=False), \
             patch.object(agent, "RUN_TIMEOUT_SECONDS", 1):
            result = agent.execute(SimpleNamespace(input=str(path), source=str(self.source),
                                                   result=str(result_path), patch=str(patch_path)))
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["session_id"], "ses_testabc")
        self.assertTrue(result["checkpoint_available"])
        self.assertEqual(result["changed_files"], ["README.md"])
        self.assertIn(b"partial work before timeout", patch_path.read_bytes())
        self.assertIn("Recoverable partial code checkpoint captured", result["summary"])

    def test_two_real_git_patches_keep_same_persistent_session(self):
        initial, patch_one = self.execute("start", 1)
        self.assertEqual(initial["status"], "ok", initial)
        self.assertEqual(initial["continuity"], "new")
        self.assertIn(b"OpenCode changed the project", patch_one)
        # Mirror publish: commit the first patch, then Actions checkout resumes
        # from the PR head before turn two.
        run("git", "add", ".", cwd=self.source)
        run("git", "commit", "-qm", "published first turn", cwd=self.source)
        resumed, patch_two = self.execute("revise", 2)
        self.assertEqual(resumed["status"], "ok", resumed)
        self.assertEqual(resumed["continuity"], "resumed")
        self.assertEqual(initial["session_id"], resumed["session_id"])
        self.assertEqual(json.loads((self.state / "issues/issue-42/metadata.json").read_text())["turn"], 2)
        self.assertGreater(len(patch_two), 0)

    def test_python_cache_generated_by_model_tests_is_excluded_from_patch(self):
        contents = self.binary.read_text()
        marker = "    p=pathlib.Path('README.md')\n"
        self.assertIn(marker, contents)
        insertion = (
            "    cache=pathlib.Path('scripts/issue_agent/__pycache__/agent.cpython-311.pyc')\n"
            "    cache.parent.mkdir(parents=True, exist_ok=True)\n"
            "    cache.write_bytes(b'compiled python cache')\n"
        )
        self.binary.write_text(contents.replace(marker, insertion + marker))
        result, patch_data = self.execute("start", 1)
        self.assertEqual(result["status"], "ok", result)
        self.assertEqual(result["changed_files"], ["README.md"])
        self.assertIn(b"OpenCode changed the project", patch_data)
        self.assertNotIn(b"__pycache__", patch_data)
        self.assertTrue((self.source / "scripts/issue_agent/__pycache__/agent.cpython-311.pyc").exists())

    def test_protected_real_script_changes_still_blocked(self):
        contents = self.binary.read_text()
        marker = "    p=pathlib.Path('README.md')\n"
        self.assertIn(marker, contents)
        insertion = (
            "    unsafe=pathlib.Path('scripts/issue_agent/agent.py')\n"
            "    unsafe.parent.mkdir(parents=True, exist_ok=True)\n"
            "    unsafe.write_text('modified by model')\n"
        )
        self.binary.write_text(contents.replace(marker, insertion + marker))
        result, patch_data = self.execute("start", 1)
        self.assertEqual(result["status"], "failed")
        self.assertIn("protected or invalid path", result["summary"])
        self.assertEqual(patch_data, b"")

    def test_failed_first_publication_reuses_session_on_start_retry(self):
        initial, _ = self.execute("start", 1)
        self.assertEqual(initial["status"], "ok", initial)
        run("git", "reset", "--hard", "HEAD", cwd=self.source)
        retry, patch = self.execute("start", 2)
        self.assertEqual(retry["status"], "ok", retry)
        self.assertEqual(retry["continuity"], "resumed")
        self.assertEqual(retry["session_id"], initial["session_id"])
        self.assertGreater(len(patch), 0)

    def test_cli_marks_failed_executor_as_nonzero(self):
        argv = ["agent.py", "execute", "--input", "input.json",
                "--result", "result.json", "--patch", "patch.diff",
                "--source", str(self.source)]
        with patch.object(agent, "execute", return_value={"status": "failed"}), \
             patch.object(sys, "argv", argv), \
             self.assertRaises(SystemExit) as raised:
            agent.main()
        self.assertEqual(raised.exception.code, 1)

    def test_refuses_revision_without_persistent_session(self):
        resumed, patch = self.execute("revise", 2)
        self.assertEqual(resumed["status"], "failed")
        self.assertIn("metadata missing", resumed["summary"])
        self.assertEqual(patch, b"")



class PublishIntegrationTests(unittest.TestCase):
    """Exercise a real bare Git remote across start and revise publications."""

    def test_recover_prepared_draft_without_patch(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            local = root / "checkout"
            local.mkdir()
            run("git", "init", "-q", local)
            run("git", "config", "user.name", "Test", cwd=local)
            run("git", "config", "user.email", "test@example.com", cwd=local)
            (local / "README.md").write_text("Existing AI implementation\n")
            run("git", "add", ".", cwd=local)
            run("git", "commit", "-qm", "feat(agent): issue #42 turn 0", cwd=local)
            sha = run("git", "rev-parse", "HEAD", cwd=local).stdout.strip()
            input_path = root / "input.json"
            input_path.write_text(json.dumps({
                "issue": 42, "turn": 2, "operation": "recover",
                "command_id": 1001, "branch": "agent/issue-42",
                "base_sha": sha, "pr": 88, "issue_title": "Recover test"
            }))
            posts = []
            def fake_api(method, route, payload=None):
                if method == "GET" and route.endswith("/pulls/88"):
                    return {"state": "open", "head": {"sha": sha, "ref": "agent/issue-42"},
                            "body": agent.MARKER.format(issue=42)}
                if method == "POST" and route.endswith("/issues/42/comments"):
                    posts.append(payload["body"])
                    return {"id": 33}
                raise AssertionError(f"Unexpected {method} {route}")
            old_cwd = Path.cwd()
            os.chdir(local)
            try:
                with patch.object(agent, "api", side_effect=fake_api), patch.object(agent, "pages", return_value=[]), patch.dict(os.environ, {"GH_TOKEN": "test-token"}, clear=False):
                    agent.publish(SimpleNamespace(
                        input=str(input_path),
                        result=str(root / "does-not-exist.json"),
                        patch=str(root / "does-not-exist.patch")))
            finally:
                os.chdir(old_cwd)
            self.assertEqual(len(posts), 1)
            self.assertIn("PR: #88", posts[0])
            self.assertIn("Session: **preserved**", posts[0])
            self.assertIn("existing branch and Draft PR retained", posts[0])

    def test_first_turn_opens_draft_and_next_turn_reuses_pr(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            remote = root / "origin.git"
            run("git", "init", "--bare", "-q", str(remote))
            repository = root / "checkout"
            run("git", "clone", "-q", str(remote), str(repository))
            run("git", "config", "user.name", "Test", cwd=repository)
            run("git", "config", "user.email", "test@example.com", cwd=repository)
            (repository / "README.md").write_text("baseline\n")
            # Simulate an existing immutable special Git mode in this repo:
            # a pre-existing symlink must not prevent unrelated README edits.
            (repository / "legacy-reference").symlink_to("README.md")
            run("git", "add", ".", cwd=repository)
            run("git", "commit", "-qm", "base with existing special Git mode", cwd=repository)
            self.assertIn("120000", run("git", "ls-files", "--stage", cwd=repository).stdout)
            run("git", "push", "-q", "origin", "HEAD:refs/heads/main", cwd=repository)
            run("git", "switch", "-c", "agent/issue-42", cwd=repository)
            run("git", "commit", "--allow-empty", "-qm", "feat(agent): issue #42 turn 0", cwd=repository)
            run("git", "push", "-q", "origin", "agent/issue-42", cwd=repository)
            base_sha = run("git", "rev-parse", "HEAD", cwd=repository).stdout.strip()
            comments = []
            pr_number = 88
            current_sha = base_sha

            def fake_api(method, route, payload=None):
                if method == "GET" and route.endswith("/pulls/88"):
                    return {"state": "open", "head": {
                        "sha": current_sha, "ref": "agent/issue-42"},
                        "body": agent.MARKER.format(issue=42)}
                if method == "POST" and route.endswith("/issues/42/comments"):
                    comments.append(payload["body"])
                    return {"id": 1}
                raise AssertionError(f"Unexpected API call: {method} {route}")

            original_cwd = Path.cwd()
            os.chdir(repository)
            try:
                for turn, operation in [(1, "start"), (2, "revise")]:
                    input_path = root / f"publish-{turn}.json"
                    result_path = root / f"result-{turn}.json"
                    patch_path = root / f"patch-{turn}.diff"
                    input_path.write_text(json.dumps({
                        "issue": 42, "turn": turn,
                        "operation": operation, "command_id": 100 + turn,
                        "branch": "agent/issue-42",
                        "base_sha": current_sha,
                        "pr": pr_number,
                        "issue_title": "Test Issue"
                    }))
                    result_path.write_text(json.dumps({
                        "status": "ok", "issue": 42, "turn": turn,
                        "continuity": "resumed" if turn == 2 else "new",
                        "summary": "Verified.", "changed_files": ["README.md"]
                    }))
                    (repository / "README.md").write_text("baseline\n" + "updated\n" * turn)
                    run("git", "add", ".", cwd=repository)
                    patch_path.write_bytes(subprocess.run(
                        ["git", "diff", "--cached", "--binary", "HEAD"],
                        cwd=repository, check=True, capture_output=True).stdout)
                    run("git", "reset", "--hard", "HEAD", cwd=repository)

                    with patch.object(agent, "api", side_effect=fake_api), \
                         patch.object(agent, "pages", return_value=[]), \
                         patch.dict(os.environ, {"GH_TOKEN": "local-test-token"}, clear=False):
                        agent.publish(SimpleNamespace(input=str(input_path),
                                                      result=str(result_path),
                                                      patch=str(patch_path)))
                    self.assertIn("PR: #88", comments[-1])
                    self.assertIn("issue=42", comments[-1])
                    self.assertIn("PR: #88", comments[-1])
                    # Fetch the published branch into the local checkout, as the
                    # next preflight/checkout would do in GitHub Actions.
                    run("git", "fetch", "-q", "origin", "agent/issue-42", cwd=repository)
                    current_sha = run("git", "rev-parse", "FETCH_HEAD", cwd=repository).stdout.strip()
                    run("git", "reset", "--hard", "FETCH_HEAD", cwd=repository)
                self.assertEqual(len(comments), 2, "both turns report to the same pre-created PR")
                self.assertEqual(len(comments), 2)
                self.assertIn("updated\nupdated\n", (repository / "README.md").read_text())
            finally:
                os.chdir(original_cwd)


    def test_failed_execution_pushes_partial_checkpoint_to_existing_draft_pr(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            remote = root / "origin.git"
            run("git", "init", "--bare", "-q", str(remote))
            local = root / "checkout"
            run("git", "clone", "-q", str(remote), str(local))
            run("git", "config", "user.name", "Test", cwd=local)
            run("git", "config", "user.email", "test@example.com", cwd=local)
            (local / "README.md").write_text("baseline\n")
            run("git", "add", ".", cwd=local)
            run("git", "commit", "-qm", "main baseline", cwd=local)
            run("git", "push", "-q", "origin", "HEAD:refs/heads/main", cwd=local)
            run("git", "switch", "-c", "agent/issue-42", cwd=local)
            run("git", "commit", "--allow-empty", "-qm", "feat(agent): issue #42 turn 0", cwd=local)
            run("git", "push", "-q", "origin", "agent/issue-42", cwd=local)
            base_sha = run("git", "rev-parse", "HEAD", cwd=local).stdout.strip()

            (local / "README.md").write_text("baseline\npartial implementation survives timeout\n")
            patch_bytes = subprocess.run(
                ["git", "diff", "--binary", "HEAD"], cwd=local,
                capture_output=True, check=True).stdout
            patch_path = root / "partial.patch"
            patch_path.write_bytes(patch_bytes)
            run("git", "reset", "--hard", "HEAD", cwd=local)

            input_path = root / "input.json"
            input_path.write_text(json.dumps({
                "issue": 42, "turn": 1, "operation": "start", "command_id": 901,
                "branch": "agent/issue-42", "base_sha": base_sha, "pr": 88,
                "issue_title": "Partial checkpoint test"
            }))
            result_path = root / "result.json"
            result_path.write_text(json.dumps({
                "issue": 42, "turn": 1, "status": "failed",
                "session_id": "ses_testabc", "continuity": "interrupted",
                "summary": "OpenCode exceeded its 240-minute execution limit.",
                "changed_files": ["README.md"], "checkpoint_available": True
            }))
            comments = []

            def fake_api(method, route, payload=None):
                if method == "GET" and route.endswith("/pulls/88"):
                    return {"state": "open",
                            "head": {"sha": base_sha, "ref": "agent/issue-42"},
                            "body": agent.MARKER.format(issue=42)}
                if method == "POST" and route.endswith("/issues/42/comments"):
                    comments.append(payload["body"])
                    return {"id": 1}
                raise AssertionError(f"Unexpected API call: {method} {route}")

            old_cwd = Path.cwd()
            os.chdir(local)
            try:
                with patch.object(agent, "api", side_effect=fake_api), \
                     patch.object(agent, "pages", return_value=[]), \
                     patch.dict(os.environ, {"GH_TOKEN": "test-token"}, clear=False):
                    agent.publish(SimpleNamespace(input=str(input_path),
                                                  result=str(result_path),
                                                  patch=str(patch_path)))
            finally:
                os.chdir(old_cwd)

            run("git", "fetch", "-q", "origin", "agent/issue-42", cwd=local)
            remote_sha = run("git", "rev-parse", "FETCH_HEAD", cwd=local).stdout.strip()
            subject = run("git", "show", "-s", "--format=%s", remote_sha, cwd=local).stdout.strip()
            content = run("git", "show", "FETCH_HEAD:README.md", cwd=local).stdout
            self.assertIn("wip(agent): issue #42 turn 1", subject)
            self.assertIn("partial implementation survives timeout", content)
            self.assertEqual(len(comments), 1)
            self.assertIn("Status: **failed / needs attention**", comments[0])
            self.assertIn("PR: #88", comments[0])
            self.assertIn("partial or complete code checkpoint pushed", comments[0])

    def test_publisher_apply_failure_reports_error_without_closing_draft_pr(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            remote = root / "origin.git"
            run("git", "init", "--bare", "-q", str(remote))
            local = root / "checkout"
            run("git", "clone", "-q", str(remote), str(local))
            run("git", "config", "user.name", "Test", cwd=local)
            run("git", "config", "user.email", "test@example.com", cwd=local)
            (local / "README.md").write_text("baseline\n")
            run("git", "add", ".", cwd=local)
            run("git", "commit", "-qm", "main baseline", cwd=local)
            run("git", "push", "-q", "origin", "HEAD:refs/heads/main", cwd=local)
            run("git", "switch", "-c", "agent/issue-42", cwd=local)
            run("git", "commit", "--allow-empty", "-qm", "feat(agent): issue #42 turn 0", cwd=local)
            run("git", "push", "-q", "origin", "agent/issue-42", cwd=local)
            base_sha = run("git", "rev-parse", "HEAD", cwd=local).stdout.strip()
            input_path = root / "input.json"
            input_path.write_text(json.dumps({
                "issue": 42, "turn": 1, "operation": "start", "command_id": 903,
                "branch": "agent/issue-42", "base_sha": base_sha, "pr": 88
            }))
            result_path = root / "result.json"
            result_path.write_text(json.dumps({
                "issue": 42, "turn": 1, "status": "failed",
                "summary": "OpenCode produced a partial patch."
            }))
            patch_path = root / "bad.patch"
            patch_path.write_text("not a valid git patch")
            comments = []

            def fake_api(method, route, payload=None):
                if method == "GET" and route.endswith("/pulls/88"):
                    return {"state": "open",
                            "head": {"sha": base_sha, "ref": "agent/issue-42"},
                            "body": agent.MARKER.format(issue=42)}
                if method == "POST" and route.endswith("/issues/42/comments"):
                    comments.append(payload["body"])
                    return {"id": 1}
                raise AssertionError(f"Unexpected API call: {method} {route}")

            old_cwd = Path.cwd()
            os.chdir(local)
            try:
                with patch.object(agent, "api", side_effect=fake_api), \
                     patch.object(agent, "pages", return_value=[]), \
                     patch.dict(os.environ, {"GH_TOKEN": "test-token"}, clear=False):
                    with self.assertRaises(RuntimeError):
                        agent.publish(SimpleNamespace(input=str(input_path),
                                                      result=str(result_path),
                                                      patch=str(patch_path)))
            finally:
                os.chdir(old_cwd)

            remote_sha = run("git", "ls-remote", "origin", "refs/heads/agent/issue-42", cwd=local).stdout.split()[0]
            self.assertEqual(remote_sha, base_sha)
            self.assertEqual(len(comments), 1)
            self.assertIn("PR: #88", comments[0])
            self.assertIn("Publishing error", comments[0])
            self.assertIn("Publisher could not publish this checkpoint", comments[0])

    def test_missing_runner_artifact_keeps_existing_branch_and_draft_pr(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            remote = root / "origin.git"
            run("git", "init", "--bare", "-q", str(remote))
            local = root / "checkout"
            run("git", "clone", "-q", str(remote), str(local))
            run("git", "config", "user.name", "Test", cwd=local)
            run("git", "config", "user.email", "test@example.com", cwd=local)
            (local / "README.md").write_text("baseline\n")
            run("git", "add", ".", cwd=local)
            run("git", "commit", "-qm", "main baseline", cwd=local)
            run("git", "push", "-q", "origin", "HEAD:refs/heads/main", cwd=local)
            run("git", "switch", "-c", "agent/issue-42", cwd=local)
            run("git", "commit", "--allow-empty", "-qm", "feat(agent): issue #42 turn 0", cwd=local)
            run("git", "push", "-q", "origin", "agent/issue-42", cwd=local)
            base_sha = run("git", "rev-parse", "HEAD", cwd=local).stdout.strip()
            input_path = root / "input.json"
            input_path.write_text(json.dumps({
                "issue": 42, "turn": 1, "operation": "start", "command_id": 902,
                "branch": "agent/issue-42", "base_sha": base_sha, "pr": 88,
                "issue_title": "Runner interruption test"
            }))
            comments = []

            def fake_api(method, route, payload=None):
                if method == "GET" and route.endswith("/pulls/88"):
                    return {"state": "open",
                            "head": {"sha": base_sha, "ref": "agent/issue-42"},
                            "body": agent.MARKER.format(issue=42)}
                if method == "POST" and route.endswith("/issues/42/comments"):
                    comments.append(payload["body"])
                    return {"id": 1}
                raise AssertionError(f"Unexpected API call: {method} {route}")

            old_cwd = Path.cwd()
            os.chdir(local)
            try:
                with patch.object(agent, "api", side_effect=fake_api), \
                     patch.object(agent, "pages", return_value=[]), \
                     patch.dict(os.environ, {"GH_TOKEN": "test-token"}, clear=False):
                    agent.publish(SimpleNamespace(input=str(input_path),
                                                  result=str(root / "missing-result.json"),
                                                  patch=str(root / "missing.patch")))
            finally:
                os.chdir(old_cwd)

            remote_sha = run("git", "ls-remote", "origin", "refs/heads/agent/issue-42", cwd=local).stdout.split()[0]
            self.assertEqual(remote_sha, base_sha)
            self.assertEqual(len(comments), 1)
            self.assertIn("PR: #88", comments[0])
            self.assertIn("no new code checkpoint; existing branch and Draft PR retained", comments[0])
            self.assertIn("Executor did not produce a result artifact", comments[0])

    def test_status_publisher_posts_issue_report_without_creating_pr(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            input_path = root / "input.json"
            result_path = root / "result.json"
            patch_path = root / "empty.patch"
            input_path.write_text(json.dumps({
                "issue": 42, "turn": 1, "operation": "status",
                "command_id": 987, "pr": None, "branch": "agent/issue-42"
            }))
            result_path.write_text(json.dumps({
                "issue": 42, "turn": 1, "status": "unavailable",
                "continuity": "unavailable",
                "summary": "No unique existing session was found."
            }))
            patch_path.write_bytes(b"")
            posted = []

            def fake_api(method, route, payload=None):
                if method == "POST" and route.endswith("/issues/42/comments"):
                    posted.append(payload["body"])
                    return {"id": 1}
                raise AssertionError(f"Unexpected API call: {method} {route}")

            with patch.object(agent, "api", side_effect=fake_api), \
                 patch.object(agent, "pages", return_value=[]), \
                 patch.dict(os.environ, {"GH_TOKEN": "test-token"}, clear=False):
                agent.publish(SimpleNamespace(input=str(input_path),
                                              result=str(result_path),
                                              patch=str(patch_path)))
            self.assertEqual(len(posted), 1)
            self.assertIn("existing AI session unavailable", posted[0])
            self.assertIn("No unique existing session", posted[0])
            self.assertIn("does not consume owner feedback", posted[0])


if __name__ == "__main__":
    unittest.main()
