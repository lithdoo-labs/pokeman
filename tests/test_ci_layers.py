"""Offline Fast/Full/Release checks; no browser, npm install, or API keys."""

from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "scripts/ci/run-pokeman.sh"
BROWSER = ROOT / "scripts/ci/setup-playwright.sh"
CI = ROOT / ".github/workflows/ci.yml"
PWA = ROOT / ".github/workflows/pwa-staging.yml"
AGENT = ROOT / "scripts/issue_agent/agent.py"


class VerificationTierTest(unittest.TestCase):
    def test_scripts_parse_with_bash(self):
        for path in (RUNNER, BROWSER):
            with self.subTest(path=path.name):
                subprocess.run(["bash", "-n", str(path)], check=True)

    def test_help_without_preparing_workspace(self):
        result = subprocess.run(["bash", str(RUNNER), "--help"],
                                cwd=ROOT, capture_output=True,
                                text=True, check=True)
        for command in ("fast battle", "fast battle-browser", "fast map",
                        "fast product", "full", "release"):
            self.assertIn(command, result.stdout)

    def test_invalid_mode_and_scope_do_not_bootstrap(self):
        for args in (("unknown",), ("fast", "unknown"), ("release", "battle")):
            with self.subTest(args=args):
                result = subprocess.run(["bash", str(RUNNER), *args], cwd=ROOT,
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, 2)

    def test_scoped_battle_tests_discover_new_unit_files(self):
        runner = RUNNER.read_text()
        self.assertIn("find game-libs/battle/test -maxdepth 1", runner)
        self.assertIn("! -name '*browser*'", runner)
        self.assertIn("-name '*browser*.test.mjs'", runner)
        self.assertIn('source "$root/scripts/ci/setup-playwright.sh"', runner)

    def test_full_keeps_original_four_test_groups(self):
        runner = RUNNER.read_text()
        for suite in ("test/*.test.mjs", "game-libs/map/test/*.test.mjs",
                      "test/essentials-map/tools/fixtures/essentials-v21.1/*.test.mjs",
                      "game-libs/battle/test/*.test.mjs"):
            with self.subTest(suite=suite):
                self.assertIn(suite, runner)

    def test_release_has_only_pwa_specific_tests(self):
        runner = RUNNER.read_text()
        self.assertIn("node --test --test-concurrency=1 scripts/pwa/test/*.test.mjs",
                      runner)
        self.assertIn('  release)\n    source "$root/scripts/ci/setup-playwright.sh"',
                      runner)

    def test_browser_install_has_no_package_manager_deps_step(self):
        browser = BROWSER.read_text()
        self.assertIn("npx --no-install playwright install chromium", browser)
        self.assertIn("chromium.launch", browser)
        self.assertNotIn("playwright install --with-deps", browser)
        self.assertNotIn("playwright install --with-deps", RUNNER.read_text())

    def test_ci_and_pwa_use_distinct_tiers(self):
        ci, pwa = CI.read_text(), PWA.read_text()
        self.assertIn("run: bash scripts/ci/run-pokeman.sh full", ci)
        self.assertIn("bash scripts/ci/run-pokeman.sh release", pwa)
        self.assertNotIn("bash scripts/ci/run-pokeman.sh full", pwa)
        self.assertNotIn("node --test scripts/pwa/test/*.test.mjs", pwa)
        self.assertIn('workflows: ["CI"]', pwa)
        self.assertIn("github.event.workflow_run.conclusion == 'success'", pwa)

    def test_pinned_runners_and_browser_cache(self):
        for workflow in (CI.read_text(), PWA.read_text()):
            self.assertIn("runs-on: ubuntu-24.04", workflow)
            self.assertIn("~/.cache/ms-playwright", workflow)
            self.assertIn("hashFiles('loom-realm/package-lock.json')", workflow)

    def test_issue_agent_prompts_for_fast_then_full(self):
        agent = AGENT.read_text()
        self.assertIn("run-pokeman.sh fast battle", agent)
        self.assertIn("run-pokeman.sh full", agent)


if __name__ == "__main__":
    unittest.main()
