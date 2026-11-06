# Fast / Full / Release verification

PokeMan keeps every existing regression test. These tiers change **when** a
test runs rather than deleting the tests to make CI faster.

## Fast — develop and revise

From the PokeMan root:

```sh
bash scripts/ci/run-pokeman.sh fast battle
bash scripts/ci/run-pokeman.sh fast battle-browser
bash scripts/ci/run-pokeman.sh fast map
bash scripts/ci/run-pokeman.sh fast product
```

- **battle** builds LoomRealm + tile presentation + Battle, and discovers all
  Battle `*.test.mjs` files except browser tests. It never installs Chromium.
- **battle-browser** builds those packages and runs only the Battle browser
  integration files. Browser binaries are installed/verified on demand.
- **map** builds LoomRealm, tile presentation and Map, then runs Map tests.
- **product** builds LoomRealm, all PokeMan packages and UI dependencies, then
  runs Battle integration, DeepSeek config, and presentation sync tests.
- Repeat only the Fast scopes touched by the edit. Use `--help` for the CLI
  without installing any dependencies. Never declare full acceptance based
  solely on Fast results.

## Full — complete PR regression

```sh
bash scripts/ci/run-pokeman.sh full
```

CI runs this on every PR and `main` push. It preserves the original test
groups: product `test/*.test.mjs`, Map, Essentials Map fixtures and Battle
`game-libs/battle/test/*.test.mjs`. Browser tests are included. Running the
script with no arguments is backward-compatible and means Full.

For GitHub-hosted jobs, use the pinned `ubuntu-24.04` image. A shared helper
installs the exact Playwright Chromium binaries determined by the LoomRealm
lockfile, using an Actions cache keyed by that lockfile. It does **not** invoke
`playwright install --with-deps`: repetitively fetching Ubuntu fonts was
responsible for six-to-eight-minute stalls in the November 5 CI logs. The
helper launches Chromium once to fail early if the runner image no longer
supplies the necessary system libraries.

## Release — independently qualify the PWA

```sh
bash scripts/ci/run-pokeman.sh release
```

This mode builds the product packages, provisions browser binaries and executes
`scripts/pwa/test/*.test.mjs`. The **PokeMan PWA Staging** workflow then
builds the installation bundle, verifies the staging commit and executes the
canonical real Chromium E2E. It does *not* run the Full test groups again.

- On `main`, Release starts only after a successful **CI** `workflow_run`
  for a trusted `main` push. Existing deploy enablement, SHA checks and
  publisher restrictions remain unchanged.
- On PRs, **CI (Full)** and **PWA Staging (Release)** validate the same PR
  head SHA independently. For PWA-affecting changes, require **both** checks
  through branch protection; PWA success alone does not replace Full.
- Real DeepSeek tests stay explicitly opt-in: these three default tiers do
  not consume live provider quota or need `DEEPSEEK_API_KEY`.

Do not globally parallelize browser tests without proving isolation of shared
ports, rendering resources, and state. Continue to report skipped, failed or
GitHub-approval-blocked checks accurately.
