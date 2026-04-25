import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import PolicyShowcase from '@site/src/components/PolicyShowcase';
import AIDemo from '@site/src/components/AIDemo';

/* ─── Hero ──────────────────────────────────────────────────────────────── */
function Hero(): React.ReactElement {
  return (
    <header className="hero-hubhelper">
      <img
        src="/HubHelper/img/logo.svg"
        alt="HubHelper Logo"
        className="hero__logo"
      />
      <h1 className="hero__title">
        Your Rules.<br />Your Intelligence.<br />Your Security.
      </h1>
      <p className="hero__subtitle">
        Define custom compliance policies and harness GitHub Copilot AI to
        secure your entire GitHub organization — from a single command.
      </p>
      <div className="hero-cta-group">
        <Link className="btn-hero-primary" to="/docs/features/bring-your-own-policy">
          Define Your Policy →
        </Link>
        <Link className="btn-hero-secondary" to="/docs/features/ai-integration">
          See AI in Action →
        </Link>
      </div>
      <div className="hero-pill-group">
        <span className="hero-pill">128 Tests</span>
        <span className="hero-pill">6 Detection Types</span>
        <span className="hero-pill">GitHub Copilot SDK</span>
        <span className="hero-pill">Zero Install Required</span>
      </div>
      <div className="terminal-window">
        <div className="terminal-header">
          <span className="terminal-dot" style={{ background: '#ff5f56' }} />
          <span className="terminal-dot" style={{ background: '#ffbd2e' }} />
          <span className="terminal-dot" style={{ background: '#27c93f' }} />
          <span className="terminal-title">Terminal</span>
        </div>
        <div className="terminal-body">
          <span className="t-dim">$ </span>
          <span className="t-green">npx @sdh100shaun/hubhelper analyze \</span>{'\n'}
          {'  '}
          <span className="t-green">--org acme-corp --html report.html</span>{'\n\n'}
          <span className="t-blue">✔ </span>Fetching 45 repositories…{'\n'}
          <span className="t-blue">✔ </span>Analyzing 123 pull requests…{'\n'}
          <span className="t-blue">✔ </span>Running compliance checks…{'\n'}
          <span className="t-purple">✔ </span>Generating AI insights…{'\n\n'}
          <span className="t-yellow">⚠  Found 12 issues: </span>
          <span className="t-red">2 critical  </span>
          <span className="t-yellow">3 high  </span>
          <span>5 medium  2 low{'\n'}</span>
          <span className="t-green">✔ </span>
          <span className="t-dim">Saved report.html</span>
        </div>
      </div>
    </header>
  );
}

/* ─── Bring Your Own Policy spotlight ───────────────────────────────────── */
function PolicySpotlight(): React.ReactElement {
  return (
    <section className="section section--dark">
      <div className="spotlight">
        <PolicyShowcase />
        <div className="spotlight__copy">
          <span className="section__eyebrow">Bring Your Own Policy</span>
          <h2>Your Organization's Rules, Not Ours</h2>
          <p>
            Store a single JSON file in a repository you control. HubHelper
            reads it at runtime — no forks, no source changes, no vendor
            lock-in. Update your policy and the next scan picks it up automatically.
          </p>
          <ul className="spotlight__bullets">
            <li>Approved email domains or exact addresses</li>
            <li>Full-name enforcement for all org members</li>
            <li>Contractor exceptions per individual address</li>
            <li>Zero hardcoded rules in HubHelper itself</li>
          </ul>
          <PolicyFlowDiagram />
          <Link className="btn-hero-primary" to="/docs/features/bring-your-own-policy"
            style={{ marginTop: '1.5rem', display: 'inline-flex' }}>
            Configure Your Policy →
          </Link>
        </div>
      </div>
    </section>
  );
}

function PolicyFlowDiagram(): React.ReactElement {
  const nodes = [
    { icon: '📁', label: 'Policy\nRepo', pill: '.hubhelper/approved-emails.json' },
    { arrow: true },
    { icon: '⬇', label: 'Fetch\nConfig', pill: 'GitHubFetcher' },
    { arrow: true },
    { icon: '👥', label: 'Check\nMembers', pill: 'ComplianceChecker' },
    { arrow: true },
    { icon: '📋', label: 'Report\nViolations', pill: 'ComplianceResult' },
  ];

  return (
    <div className="flow-diagram" style={{ padding: '1.5rem 0', maxWidth: '100%' }}>
      {nodes.map((n, i) => {
        if ('arrow' in n) {
          return <span key={i} className="flow-arrow">→</span>;
        }
        return (
          <div key={i} className="flow-node">
            <span className="flow-node__icon">{n.icon}</span>
            <span className="flow-node__pill">{n.pill}</span>
            <span className="flow-node__label" style={{ whiteSpace: 'pre' }}>{n.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── AI Integration spotlight ───────────────────────────────────────────── */
function AISpotlight(): React.ReactElement {
  return (
    <section className="section section--gradient">
      <div className="spotlight spotlight--reversed">
        <div className="spotlight__copy">
          <span className="section__eyebrow">GitHub Copilot AI</span>
          <h2>Intelligence That Understands Context</h2>
          <p>
            GitHub Copilot SDK powers insights that don't just find problems —
            they explain them. Get pattern analysis, risk scoring, and
            prioritised recommendations in plain language.
          </p>
          <ul className="spotlight__bullets">
            <li>Pattern detection across all repositories</li>
            <li>Risk level scoring: critical → low</li>
            <li>Self-merge trend analysis</li>
            <li>Actionable, prioritised recommendations</li>
          </ul>
          <Link className="btn-hero-primary" to="/docs/features/ai-integration"
            style={{ marginTop: '1.5rem', display: 'inline-flex' }}>
            Explore AI Features →
          </Link>
        </div>
        <AIDemo />
      </div>
    </section>
  );
}

/* ─── Architecture strip ─────────────────────────────────────────────────── */
function ArchitectureStrip(): React.ReactElement {
  return (
    <section className="section section--dark">
      <div className="section__header">
        <span className="section__eyebrow">How It Works</span>
        <h2 className="section__title">Data Flow in 5 Steps</h2>
      </div>
      <div className="flow-diagram">
        {[
          { icon: '🐙', pill: 'GitHub API', label: 'Source' },
          null,
          { icon: '⬇', pill: 'GitHubFetcher', label: 'Fetch' },
          null,
          { icon: '🔍', pill: 'SecurityAnalyzer', label: 'Detect' },
          null,
          { icon: '🤖', pill: 'AIAnalyzer', label: 'Analyse' },
          null,
          { icon: '📄', pill: 'Reporters', label: 'Output' },
        ].map((n, i) => {
          if (n === null) return <span key={i} className="flow-arrow">→</span>;
          return (
            <div key={i} className="flow-node">
              <span className="flow-node__icon">{n.icon}</span>
              <span className="flow-node__pill">{n.pill}</span>
              <span className="flow-node__label">{n.label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--hubhelper-text-dim)', fontSize: '0.82rem' }}>
        Policy Repo feeds into GitHubFetcher · Copilot SDK powers AIAnalyzer
      </div>
    </section>
  );
}

/* ─── Quick start ────────────────────────────────────────────────────────── */
function QuickStart(): React.ReactElement {
  const steps = [
    {
      n: '1',
      title: 'Create a GitHub Token',
      body: 'Generate a fine-grained personal access token with read access to your organization\'s repos, pull requests, and Actions.',
    },
    {
      n: '2',
      title: 'Define Your Policy',
      body: 'Create .hubhelper/approved-emails.json in a repository you control. List approved domains and any individual exceptions.',
    },
    {
      n: '3',
      title: 'Run Your First Scan',
      body: 'npx @sdh100shaun/hubhelper analyze --org your-org --html report.html\n\nReview the AI-powered HTML report in your browser.',
    },
  ];

  return (
    <section className="section section--surface">
      <div className="section__header">
        <span className="section__eyebrow">Get Started</span>
        <h2 className="section__title">Up and Running in 60 Seconds</h2>
      </div>
      <div className="quickstart-grid">
        {steps.map((s) => (
          <div key={s.n} className="quickstart-step">
            <span className="quickstart-step__number">{s.n}</span>
            <h3>{s.title}</h3>
            <p style={{ whiteSpace: 'pre-line' }}>{s.body}</p>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
        <Link className="btn-hero-primary" to="/docs/getting-started"
          style={{
            background: 'var(--hubhelper-gradient)',
            color: '#fff',
            display: 'inline-flex',
          }}>
          Read the Full Guide →
        </Link>
      </div>
    </section>
  );
}

/* ─── CTA banner ─────────────────────────────────────────────────────────── */
function CTABanner(): React.ReactElement {
  return (
    <section className="cta-banner">
      <h2>Start Securing Your Organization Today</h2>
      <p>
        Bring your own compliance policy, let Copilot AI surface the risks, and
        ship with confidence.
      </p>
      <div className="hero-cta-group">
        <Link className="btn-hero-primary" to="/docs/getting-started">
          Get Started
        </Link>
        <Link className="btn-hero-secondary" to="/docs/intro">
          View Documentation
        </Link>
      </div>
    </section>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function Home(): React.ReactElement {
  return (
    <Layout
      title="HubHelper — Bring Your Own Policy, Powered by Copilot AI"
      description="AI-powered tools to visualize GitHub activity and flag security issues across organizations using the GitHub Copilot SDK."
    >
      <Hero />
      <main>
        <PolicySpotlight />
        <AISpotlight />
        <ArchitectureStrip />
        <HomepageFeatures />
        <QuickStart />
        <CTABanner />
      </main>
    </Layout>
  );
}
