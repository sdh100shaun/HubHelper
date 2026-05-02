import React from 'react';

interface FeatureCard {
  icon: string;
  title: string;
  description: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: '📋',
    title: 'Bring Your Own Policy',
    description:
      'Define compliance rules in a JSON file you own. Set approved email domains, enforce full-name requirements, and add contractor exceptions — all without touching HubHelper source code.',
  },
  {
    icon: '🤖',
    title: 'Copilot AI Insights',
    description:
      'GitHub Copilot SDK powers pattern analysis, risk scoring, and contextual recommendations that explain issues rather than just listing them.',
  },
  {
    icon: '🔍',
    title: 'Comprehensive Detection',
    description:
      'Surfaces self-merges, unreviewed security PRs, disabled GitHub Actions, paused workflows, and more across every repository in your org.',
  },
  {
    icon: '📊',
    title: 'Multiple Output Formats',
    description:
      'Coloured terminal output for daily checks, JSON for automation pipelines, and styled HTML reports for sharing with stakeholders.',
  },
  {
    icon: '🔒',
    title: 'Security First',
    description:
      'XSS protection in HTML reports, path traversal prevention, input validation, and Content Security Policy headers — built in from day one.',
  },
  {
    icon: '⚡',
    title: 'Zero-Install Usage',
    description:
      'Run with a single npx command. No global install required. Works with Node.js 18 through 24+. First scan in under 60 seconds.',
  },
];

export default function HomepageFeatures(): React.ReactElement {
  return (
    <section className="section section--surface">
      <div className="section__header">
        <span className="section__eyebrow">Everything You Need</span>
        <h2 className="section__title">Built for Your Best Practice</h2>
        <p className="section__subtitle">
          From custom compliance policies to AI-powered analysis, HubHelper gives
          your team the visibility it needs without adding friction.
        </p>
      </div>
      <div className="features-grid">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature-card">
            <span className="feature-card__icon" aria-hidden="true">{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
