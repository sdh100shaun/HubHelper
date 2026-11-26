# HubHelper agentic workflows

This folder is a [GitHub Agentic Workflows](https://github.github.com/gh-aw/) package. It lives outside
`.github/workflows/`, so the workflows here never run in this public repository.

| Workflow | What it does |
|----------|--------------|
| [`hubhelper-org-audit`](./workflows/hubhelper-org-audit.md) | Weekly HubHelper policy scan of the organisation. A Copilot agent triages the findings into a digest discussion and up to five issues for new critical or high findings |

## Install

In a clone of a **private** security repository in your organisation:

```bash
gh extension install github/gh-aw
gh aw add sdh100shaun/HubHelper/gh-aw --create-pull-request
```

You also need a read-only GitHub App and a few variables and secrets. The full guide, including customisation and
troubleshooting, is at <https://sdh100shaun.github.io/HubHelper/docs/agentic-workflows/>.

## Security review notes

`gh aw compile` reports these as needing review (safe update mode). Both are expected:

- **Secret `HUBHELPER_APP_PRIVATE_KEY`**: the read-only HubHelper GitHub App key. It's used only in the
  `hubhelper_scan` job's `Run HubHelper` step `env` and by gh-aw to mint the agent's read-only GitHub tools token.
  It's never in workflow-level `env:` or visible to the model.
- **Action `github/codeql-action/upload-sarif`**: GitHub's official SARIF upload action, pinned by commit SHA,
  used only in `hubhelper_scan`.

If a change adds another secret or action, list it here with the reason.

## Developing

- Edit `workflows/hubhelper-org-audit.md`. Don't add a `.lock.yml` here; consumers compile on install.
- CI (`.github/workflows/gh-aw-validate.yml`) compiles every workflow in this folder in strict mode with the pinned
  gh-aw CLI. To check locally:

  ```bash
  gh aw compile --dir gh-aw/workflows --strict --no-emit
  ```
