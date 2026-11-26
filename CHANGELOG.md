# Changelog

All notable changes to HubHelper are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **GitHub Agentic Workflow** (`gh-aw/`): a weekly `hubhelper-org-audit` workflow that runs a HubHelper scan and
  has a Copilot agent triage the findings into a digest discussion and issues. Install it with
  `gh aw add sdh100shaun/HubHelper/gh-aw`. See the
  [Agentic Workflows guide](https://sdh100shaun.github.io/HubHelper/docs/agentic-workflows/).
- **Bundled policy profiles**: the npm package now includes `policies/catalog.yaml`, `default.yaml` and
  `strict.yaml`, and `--profile default` / `--profile strict` work from any directory.
- **Finding identity in JSON reports**: `schema_version`, and `control_id` plus a stable `fingerprint` on every
  issue, so automation can tell new findings from ones already reported.
- CI job (`gh-aw-validate.yml`) that compiles the agentic workflows in strict mode.

### Changed

- `analyze --profile` now accepts the names `default` and `strict` as well as a path. Custom profile paths must be
  `.yaml`/`.yml` files inside the current directory, as `stream --profile` already required.
- A `policies/default.yaml` or `policies/strict.yaml` in the current directory still takes precedence over the
  bundled copy.
- Package metadata now points at the `sdh100shaun/HubHelper` repository and the documentation site.

### Removed

- `.github/workflows/scheduled-security-scan.yml`, which installed a package that doesn't exist. The agentic
  workflow replaces it.
