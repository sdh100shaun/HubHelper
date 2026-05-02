---
sidebar_position: 1
title: Introduction
description: What HubHelper is, why it exists, and what it can do for your organisation.
slug: /intro
---

# HubHelper

**AI-powered tools to visualise GitHub activity and flag security issues across organisations.**

HubHelper gives platform and security teams a single command to scan their entire GitHub organisation and surface what matters — self-merges, unreviewed security changes, disabled Actions, and compliance violations — enriched with Copilot AI pattern analysis.

---

## Why HubHelper?

Most GitHub organisations grow faster than their security practices. Teams end up with:

- Pull requests merged by their own authors, bypassing review
- Security-critical changes landing without a second pair of eyes
- GitHub Actions disabled on repositories that haven't been touched in months
- No systematic way to check whether every member uses an approved email address

HubHelper automates the discovery of all of these in a single run.

---

## Two Core Differentiators

### Bring Your Own Policy

HubHelper doesn't ship with hardcoded compliance rules. Instead, you store a JSON policy file in a repository you control, and HubHelper reads it at runtime. Change the policy file, and the next scan enforces the new rules — no tool update required.

→ [Learn how to define your policy](/docs/features/bring-your-own-policy)

### GitHub Copilot AI Integration

Raw issue lists tell you *what* is wrong. HubHelper's AI layer — powered by the GitHub Copilot SDK — tells you *why it matters*, scores overall organisational risk, and generates prioritised recommendations in plain language.

→ [Explore AI integration](/docs/features/ai-integration)

---

## What HubHelper Detects

| Issue Type | Severity | Description |
|---|---|---|
| Self-merged PR | Medium–High | Author merged their own pull request |
| Security PR | Low–Critical | PR title/body contains security keywords |
| Unreviewed security PR | Critical | Security PR self-merged without external review |
| Disabled Actions | Medium | `actions_enabled` is false on a repository |
| Paused workflow | Medium–Low | Workflow auto-paused after 60 days of inactivity |
| Disabled workflow | Low | Workflow manually disabled |
| Compliance violation | Medium | Member fails email domain or full-name rule |

---

## Quick Start

```bash
# Analyse your organisation
npx @sdh100shaun/hubhelper analyze \
  --org your-org \
  --token $GITHUB_TOKEN \
  --html report.html
```

→ [Full getting started guide](/docs/getting-started)

---

## Key Links

| | |
|---|---|
| [Getting Started](/docs/getting-started) | Installation, token setup, first scan |
| [Bring Your Own Policy](/docs/features/bring-your-own-policy) | Custom compliance rules |
| [AI Integration](/docs/features/ai-integration) | Copilot SDK analysis |
| [API Reference](/docs/api-reference) | All CLI commands and options |
| [GitHub App Setup](/docs/github-app) | Automated CI/CD scanning |
| [Security](/docs/security) | XSS, path traversal, token handling |
| [Contributing](/docs/contributing) | Development setup and guidelines |
