---
title: "HubHelper — Bring Your Own Policy, Powered by Copilot AI"
description: "AI-powered tools to visualise GitHub activity and flag security issues across organisations using the GitHub Copilot SDK."
noStyle: true
titleAppend: false
bodyClass: hh-landing
customScripts: '<script src="assets/js/landing.js" defer></script>'
---

<!--
  Landing page. This file is hand-maintained HTML: with `noStyle: true`
  docmd passes it through as-is (no Markdown processing, no docs chrome). Styles live in
  website/assets/css/hubhelper.css; the two interactive widgets are driven by
  website/assets/js/landing.js. Links are relative so they work both under
  /HubHelper/ on GitHub Pages and at / in `docmd dev`.
-->

<nav class="hh-navbar" aria-label="Main">
  <div class="hh-navbar__inner">
    <a class="hh-navbar__brand" href="./">
      <img src="img/logo.svg" alt="HubHelper Logo" width="40" height="40">
      <b>HubHelper</b>
    </a>
    <button class="hh-navbar__toggle" type="button" aria-expanded="false" aria-controls="hh-navbar-links" aria-label="Toggle navigation">
      <span></span><span></span><span></span>
    </button>
    <div class="hh-navbar__links" id="hh-navbar-links">
      <a href="docs/intro/">Docs</a>
      <a href="docs/features/bring-your-own-policy/">Bring Your Own Policy</a>
      <a href="docs/features/ai-integration/">AI Integration</a>
      <a href="docs/api-reference/">API</a>
      <a class="hh-navbar__github" href="https://github.com/sdh100shaun/hubhelper" aria-label="GitHub repository"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg></a>
    </div>
  </div>
</nav>

<header class="hero-hubhelper">
  <img src="img/logo.svg" alt="HubHelper Logo" class="hero__logo">
  <h1 class="hero__title">Your Rules.<br>Your Intelligence.<br>Your Compliance.</h1>
  <p class="hero__subtitle">Define custom compliance policies and harness GitHub Copilot AI to secure your entire GitHub organization — from a single command.</p>
  <div class="hero-cta-group">
    <a class="btn-hero-primary" href="docs/features/bring-your-own-policy/">Define Your Policy →</a>
    <a class="btn-hero-secondary" href="docs/features/ai-integration/">See AI in Action →</a>
  </div>
  <div class="hero-pill-group">
    <span class="hero-pill">128 Tests</span>
    <span class="hero-pill">6 Detection Types</span>
    <span class="hero-pill">GitHub Copilot SDK</span>
    <span class="hero-pill">Zero Install Required</span>
  </div>
  <div class="terminal-window">
    <div class="terminal-header">
      <span class="terminal-dot terminal-dot--red" aria-hidden="true"></span>
      <span class="terminal-dot terminal-dot--yellow" aria-hidden="true"></span>
      <span class="terminal-dot terminal-dot--green" aria-hidden="true"></span>
      <span class="terminal-title">Terminal</span>
    </div>
    <pre class="terminal-body"><span class="t-dim">$ </span><span class="t-green">npx @sdh100shaun/hubhelper analyze \</span>
  <span class="t-green">--org acme-corp --html report.html</span>

<span class="t-blue">✔ </span>Fetching 45 repositories…
<span class="t-blue">✔ </span>Analyzing 123 pull requests…
<span class="t-blue">✔ </span>Running compliance checks…
<span class="t-purple">✔ </span>Generating AI insights…

<span class="t-yellow">⚠  Found 12 issues: </span><span class="t-red">2 critical  </span><span class="t-yellow">3 high  </span><span>5 medium  2 low
</span><span class="t-green">✔ </span><span class="t-dim">Saved report.html</span></pre>
  </div>
</header>

<main>
  <section class="section section--dark">
    <div class="spotlight">
      <div class="policy-panel" data-hh-tabs>
          <div class="policy-panel__tab-bar" role="tablist" aria-label="Policy example tabs">
            <button class="policy-panel__tab active" type="button" role="tab" aria-selected="true" aria-controls="policy-panel-content" id="tab-config" data-tab="config">Policy Config</button>
            <button class="policy-panel__tab" type="button" role="tab" aria-selected="false" aria-controls="policy-panel-content" id="tab-result" data-tab="result">Compliance Result</button>
            <button class="policy-panel__tab" type="button" role="tab" aria-selected="false" aria-controls="policy-panel-content" id="tab-violation" data-tab="violation">Violation Detail</button>
          </div>
          <div class="policy-panel__content" role="tabpanel" id="policy-panel-content" aria-labelledby="tab-config">
            <pre class="hh-code" data-tab-content="config"><code>{
  <span class="tok-key">"domains"</span>: [
    <span class="tok-string">"acme.com"</span>,
    <span class="tok-string">"partner.io"</span>
  ],
  <span class="tok-key">"exactEmails"</span>: [
    <span class="tok-string">"contractor@external.dev"</span>
  ]
}</code></pre>
            <pre class="hh-code" data-tab-content="result" hidden><code>{
  <span class="tok-key">"organization"</span>: <span class="tok-string">"acme-corp"</span>,
  <span class="tok-key">"totalMembers"</span>: <span class="tok-number">42</span>,
  <span class="tok-key">"compliantMembers"</span>: <span class="tok-number">39</span>,
  <span class="tok-key">"nonCompliantMembers"</span>: [
    {
      <span class="tok-key">"user"</span>: <span class="tok-string">"jsmith99"</span>,
      <span class="tok-key">"violations"</span>: [<span class="tok-string">"missing_approved_email"</span>],
      <span class="tok-key">"details"</span>: {
        <span class="tok-key">"name"</span>: <span class="tok-string">"John Smith"</span>,
        <span class="tok-key">"email"</span>: <span class="tok-string">"john@personal.email"</span>
      }
    },
    {
      <span class="tok-key">"user"</span>: <span class="tok-string">"devx42"</span>,
      <span class="tok-key">"violations"</span>: [<span class="tok-string">"missing_full_name"</span>],
      <span class="tok-key">"details"</span>: {
        <span class="tok-key">"name"</span>: <span class="tok-keyword">null</span>,
        <span class="tok-key">"email"</span>: <span class="tok-string">"dev@acme.com"</span>
      }
    }
  ],
  <span class="tok-key">"checkedAt"</span>: <span class="tok-string">"2026-04-24T09:<span class="tok-number">15</span>:<span class="tok-number">00.000</span>Z"</span>
}</code></pre>
            <pre class="hh-code" data-tab-content="violation" hidden><code><span class="tok-comment">// Rule: missing_approved_email</span>
<span class="tok-comment">// User: jsmith99 (john@personal.email)</span>
<span class="tok-comment">//</span>
<span class="tok-comment">// ✗ Domain "personal.email" not in approved list</span>
<span class="tok-comment">//   Approved domains: acme.com, partner.io</span>
<span class="tok-comment">//   Approved exact: contractor@external.dev</span>
<span class="tok-comment">//</span>
<span class="tok-comment">// Resolution: ask jsmith99 to update their</span>
<span class="tok-comment">// GitHub profile to use their acme.com address.</span>

<span class="tok-comment">// Rule: missing_full_name</span>
<span class="tok-comment">// User: devx42 (dev@acme.com)</span>
<span class="tok-comment">//</span>
<span class="tok-comment">// ✗ GitHub profile has no full name set</span>
<span class="tok-comment">//</span>
<span class="tok-comment">// Resolution: ask devx42 to add their full</span>
<span class="tok-comment">// name in GitHub Settings → Profile.</span></code></pre>
          </div>
        </div>
      <div class="spotlight__copy">
        <span class="section__eyebrow">Bring Your Own Policy</span>
        <h2>Your Organization's Rules, as Well as Others</h2>
        <p>Store a single JSON file in a repository you control. HubHelper reads it at runtime — no forks, no source changes, no vendor lock-in. Update your policy and the next scan picks it up automatically.</p>
        <ul class="spotlight__bullets">
          <li>Approved email domains or exact addresses</li>
          <li>Full-name enforcement for all org members</li>
          <li>Contractor exceptions per individual address</li>
          <li>Zero hardcoded rules in HubHelper itself</li>
        </ul>
        <div class="flow-diagram flow-diagram--inline">
        <div class="flow-node"><span class="flow-node__icon" aria-hidden="true">📁</span><span class="flow-node__pill">.hubhelper/approved-emails.json</span><span class="flow-node__label" style="white-space:pre">Policy
Repo</span></div>
        <span class="flow-arrow" aria-hidden="true">→</span>
        <div class="flow-node"><span class="flow-node__icon" aria-hidden="true">⬇</span><span class="flow-node__pill">GitHubFetcher</span><span class="flow-node__label" style="white-space:pre">Fetch
Config</span></div>
        <span class="flow-arrow" aria-hidden="true">→</span>
        <div class="flow-node"><span class="flow-node__icon" aria-hidden="true">👥</span><span class="flow-node__pill">ComplianceChecker</span><span class="flow-node__label" style="white-space:pre">Check
Members</span></div>
        <span class="flow-arrow" aria-hidden="true">→</span>
        <div class="flow-node"><span class="flow-node__icon" aria-hidden="true">📋</span><span class="flow-node__pill">ComplianceResult</span><span class="flow-node__label" style="white-space:pre">Report
Violations</span></div>
        </div>
        <a class="btn-hero-primary btn-hero-primary--spaced" href="docs/features/bring-your-own-policy/">Configure Your Policy →</a>
      </div>
    </div>
  </section>

  <section class="section section--gradient">
    <div class="spotlight spotlight--reversed">
      <div class="spotlight__copy">
        <span class="section__eyebrow">GitHub Copilot AI</span>
        <h2>Intelligence That Understands Context</h2>
        <p>GitHub Copilot SDK powers insights that don't just find problems — they explain them. Get pattern analysis, risk scoring, and prioritised recommendations in plain language.</p>
        <ul class="spotlight__bullets">
          <li>Pattern detection across all repositories</li>
          <li>Risk level scoring: critical → low</li>
          <li>Self-merge trend analysis</li>
          <li>Actionable, prioritised recommendations</li>
        </ul>
        <a class="btn-hero-primary btn-hero-primary--spaced" href="docs/features/ai-integration/">Explore AI Features →</a>
      </div>
      <div class="terminal-window" data-hh-scenarios>
          <div class="terminal-header">
            <span class="terminal-dot terminal-dot--red" aria-hidden="true"></span>
            <span class="terminal-dot terminal-dot--yellow" aria-hidden="true"></span>
            <span class="terminal-dot terminal-dot--green" aria-hidden="true"></span>
            <span class="terminal-title">hubhelper analyze --org acme-corp</span>
            <span class="scenario-group" role="group" aria-label="Demo scenarios">
              <button class="scenario-btn" type="button" aria-pressed="true" aria-label="Show Critical Issues scenario" data-scenario="0">Critical Issues</button>
              <button class="scenario-btn" type="button" aria-pressed="false" aria-label="Show High Risk scenario" data-scenario="1">High Risk</button>
              <button class="scenario-btn" type="button" aria-pressed="false" aria-label="Show Low Risk scenario" data-scenario="2">Low Risk</button>
            </span>
          </div>
          <div aria-live="polite" aria-atomic="true">
            <pre class="terminal-body terminal-body--wrap" data-scenario-panel="0"><span class="t-dim">════════════════════════════════════════════════════════════════
</span><span class="t-bold t-blue">  GitHub Organization Security Analysis
</span><span class="t-dim">════════════════════════════════════════════════════════════════

</span><span class="t-purple">🤖 AI-Powered Insights:
</span><span class="t-dim">=== Security Analysis Insights ===

</span><span>📊 Issue Detection Rate: 9.8% of PRs flagged
</span><span class="t-yellow">⚠️  Self-Merge Rate: 6.5% (8/123 PRs)
</span><span class="t-yellow">🚨 3 security PRs merged without review
</span><span>⚙️  Actions disabled: 11.1% of repos (5/45)
</span>
<span class="t-purple">🔰 Risk Assessment: </span><span class="risk-badge risk-badge--critical"><span class="risk-pulse" aria-hidden="true"></span>Critical Risk</span>

<span class="t-blue">💡 Recommended Actions:
</span><span class="t-red">  1. [URGENT] Address 3 unreviewed security PRs immediately
</span><span class="t-red">  2. [URGENT] Implement mandatory review for security changes
</span><span class="t-dim">  3. <span class="t-light">Enable branch protection rules across all repos
</span></span><span class="t-dim">  4. <span class="t-light">Re-enable GitHub Actions on 5 repositories
</span></span></pre>
            <pre class="terminal-body terminal-body--wrap" data-scenario-panel="1" hidden><span class="t-dim">════════════════════════════════════════════════════════════════
</span><span class="t-bold t-blue">  GitHub Organization Security Analysis
</span><span class="t-dim">════════════════════════════════════════════════════════════════

</span><span class="t-purple">🤖 AI-Powered Insights:
</span><span class="t-dim">=== Security Analysis Insights ===

</span><span>📊 Issue Detection Rate: 4.2% of PRs flagged
</span><span class="t-yellow">⚠️  Self-Merge Rate: 3.1% (4/128 PRs)
</span><span>🔒 Security PRs: 8 detected (all reviewed)
</span><span>⚙️  Actions disabled: 6.7% of repos (2/30)
</span>
<span class="t-purple">🔰 Risk Assessment: </span><span class="risk-badge risk-badge--high"><span class="risk-pulse" aria-hidden="true"></span>High Risk</span>

<span class="t-blue">💡 Recommended Actions:
</span><span class="t-dim">  1. <span class="t-light">Enable branch protection on remaining repos
</span></span><span class="t-dim">  2. <span class="t-light">Set up automated security scanning with CodeQL
</span></span><span class="t-dim">  3. <span class="t-light">Configure Dependabot for dependency updates
</span></span><span class="t-dim">  4. <span class="t-light">Consider CODEOWNERS for critical paths
</span></span></pre>
            <pre class="terminal-body terminal-body--wrap" data-scenario-panel="2" hidden><span class="t-dim">════════════════════════════════════════════════════════════════
</span><span class="t-bold t-blue">  GitHub Organization Security Analysis
</span><span class="t-dim">════════════════════════════════════════════════════════════════

</span><span class="t-purple">🤖 AI-Powered Insights:
</span><span class="t-dim">=== Security Analysis Insights ===

</span><span>📊 Issue Detection Rate: 0.8% of PRs flagged
</span><span class="t-green">✅ No self-merges detected in last 30 days
</span><span>🔒 Security PRs: 3 detected (all reviewed)
</span><span class="t-green">✅ All repositories have Actions enabled
</span>
<span class="t-purple">🔰 Risk Assessment: </span><span class="risk-badge risk-badge--low">Low Risk</span>

<span class="t-blue">💡 Recommended Actions:
</span><span class="t-dim">  1. <span class="t-light">Continue current review processes
</span></span><span class="t-dim">  2. <span class="t-light">Set up automated security scanning with CodeQL
</span></span><span class="t-dim">  3. <span class="t-light">Configure Dependabot for automated dependency updates
</span></span><span class="t-dim">  4. <span class="t-light">Enable Dependabot security alerts
</span></span></pre>
          </div>
        </div>
    </div>
  </section>

  <section class="section section--dark">
    <div class="section__header">
      <span class="section__eyebrow">How It Works</span>
      <h2 class="section__title">Data Flow in 5 Steps</h2>
    </div>
    <div class="flow-diagram">
        <div class="flow-node"><span class="flow-node__icon" aria-hidden="true">🐙</span><span class="flow-node__pill">GitHub API</span><span class="flow-node__label">Source</span></div>
        <span class="flow-arrow" aria-hidden="true">→</span>
        <div class="flow-node"><span class="flow-node__icon" aria-hidden="true">⬇</span><span class="flow-node__pill">GitHubFetcher</span><span class="flow-node__label">Fetch</span></div>
        <span class="flow-arrow" aria-hidden="true">→</span>
        <div class="flow-node"><span class="flow-node__icon" aria-hidden="true">🔍</span><span class="flow-node__pill">SecurityAnalyzer</span><span class="flow-node__label">Detect</span></div>
        <span class="flow-arrow" aria-hidden="true">→</span>
        <div class="flow-node"><span class="flow-node__icon" aria-hidden="true">🤖</span><span class="flow-node__pill">AIAnalyzer</span><span class="flow-node__label">Analyse</span></div>
        <span class="flow-arrow" aria-hidden="true">→</span>
        <div class="flow-node"><span class="flow-node__icon" aria-hidden="true">📄</span><span class="flow-node__pill">Reporters</span><span class="flow-node__label">Output</span></div>
    </div>
    <div class="flow-caption">Policy Repo feeds into GitHubFetcher · Copilot SDK powers AIAnalyzer</div>
  </section>

  <section class="section section--surface">
    <div class="section__header">
      <span class="section__eyebrow">Everything You Need</span>
      <h2 class="section__title">Built for Your Best Practice</h2>
      <p class="section__subtitle">From custom compliance policies to AI-powered analysis, HubHelper gives your team the visibility it needs without adding friction.</p>
    </div>
    <div class="features-grid">
      <div class="feature-card"><span class="feature-card__icon" aria-hidden="true">📋</span><h3>Bring Your Own Policy</h3><p>Define compliance rules in a JSON file you own. Set approved email domains, enforce full-name requirements, and add contractor exceptions — all without touching HubHelper source code.</p></div>
      <div class="feature-card"><span class="feature-card__icon" aria-hidden="true">🤖</span><h3>Copilot AI Insights</h3><p>GitHub Copilot SDK powers pattern analysis, risk scoring, and contextual recommendations that explain issues rather than just listing them.</p></div>
      <div class="feature-card"><span class="feature-card__icon" aria-hidden="true">🔍</span><h3>Comprehensive Detection</h3><p>Surfaces self-merges, unreviewed security PRs, disabled GitHub Actions, paused workflows, and more across every repository in your org.</p></div>
      <div class="feature-card"><span class="feature-card__icon" aria-hidden="true">📊</span><h3>Multiple Output Formats</h3><p>Coloured terminal output for daily checks, JSON for automation pipelines, and styled HTML reports for sharing with stakeholders.</p></div>
      <div class="feature-card"><span class="feature-card__icon" aria-hidden="true">🔒</span><h3>Security First</h3><p>XSS protection in HTML reports, path traversal prevention, input validation, and Content Security Policy headers — built in from day one.</p></div>
      <div class="feature-card"><span class="feature-card__icon" aria-hidden="true">⚡</span><h3>Zero-Install Usage</h3><p>Run with a single npx command. No global install required. Works with Node.js 24 and later. First scan in under 60 seconds.</p></div>
    </div>
  </section>

  <section class="section section--surface">
    <div class="section__header">
      <span class="section__eyebrow">Get Started</span>
      <h2 class="section__title">Up and Running in 60 Seconds</h2>
    </div>
    <div class="quickstart-grid">
      <div class="quickstart-step"><span class="quickstart-step__number">1</span><h3>Create a GitHub Token</h3><p>Generate a fine-grained personal access token with read access to your organization's repos, pull requests, and Actions.</p></div>
      <div class="quickstart-step"><span class="quickstart-step__number">2</span><h3>Define Your Policy</h3><p>Create .hubhelper/approved-emails.json in a repository you control. List approved domains and any individual exceptions.</p></div>
      <div class="quickstart-step"><span class="quickstart-step__number">3</span><h3>Run Your First Scan</h3><p class="pre-line">npx @sdh100shaun/hubhelper analyze --org your-org --html report.html

Review the AI-powered HTML report in your browser.</p></div>
    </div>
    <div class="quickstart-cta">
      <a class="btn-hero-primary btn-hero-primary--gradient" href="docs/getting-started/">Read the Full Guide →</a>
    </div>
  </section>

  <section class="cta-banner">
    <h2>Start Securing Your Organization Today</h2>
    <p>Bring your own compliance policy, let Copilot AI surface the risks, and ship with confidence.</p>
    <div class="hero-cta-group">
      <a class="btn-hero-primary" href="docs/getting-started/">Get Started</a>
      <a class="btn-hero-secondary" href="docs/intro/">View Documentation</a>
    </div>
  </section>
</main>

<footer class="hh-footer">
  <div class="hh-footer__columns">
    <div>
      <h2 class="hh-footer__title">Documentation</h2>
      <ul>
        <li><a href="docs/getting-started/">Getting Started</a></li>
        <li><a href="docs/authentication/">Authentication</a></li>
        <li><a href="docs/api-reference/">API Reference</a></li>
        <li><a href="docs/github-app/">GitHub App Setup</a></li>
        <li><a href="docs/security/">Security</a></li>
      </ul>
    </div>
    <div>
      <h2 class="hh-footer__title">Features</h2>
      <ul>
        <li><a href="docs/features/bring-your-own-policy/">Bring Your Own Policy</a></li>
        <li><a href="docs/features/ai-integration/">AI Integration</a></li>
        <li><a href="docs/features/policy-standards/">Policy Standards</a></li>
      </ul>
    </div>
    <div>
      <h2 class="hh-footer__title">Community</h2>
      <ul>
        <li><a href="https://github.com/sdh100shaun/hubhelper" target="_blank" rel="noopener noreferrer">GitHub ↗</a></li>
        <li><a href="https://github.com/sdh100shaun/hubhelper/issues" target="_blank" rel="noopener noreferrer">Issues ↗</a></li>
        <li><a href="docs/contributing/">Contributing</a></li>
      </ul>
    </div>
  </div>
  <p class="hh-footer__copyright">Copyright © <span data-hh-year>2026</span> HubHelper. Built with open source.</p>
</footer>
