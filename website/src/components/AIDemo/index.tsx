import React, { useState } from 'react';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface DemoScenario {
  label: string;
  riskLevel: RiskLevel;
  insights: string[];
  actions: string[];
}

const SCENARIOS: DemoScenario[] = [
  {
    label: 'Critical Issues',
    riskLevel: 'critical',
    insights: [
      '📊 Issue Detection Rate: 9.8% of PRs flagged',
      '⚠️  Self-Merge Rate: 6.5% (8/123 PRs)',
      '🚨 3 security PRs merged without review',
      '⚙️  Actions disabled: 11.1% of repos (5/45)',
    ],
    actions: [
      '[URGENT] Address 3 unreviewed security PRs immediately',
      '[URGENT] Implement mandatory review for security changes',
      'Enable branch protection rules across all repos',
      'Re-enable GitHub Actions on 5 repositories',
    ],
  },
  {
    label: 'High Risk',
    riskLevel: 'high',
    insights: [
      '📊 Issue Detection Rate: 4.2% of PRs flagged',
      '⚠️  Self-Merge Rate: 3.1% (4/128 PRs)',
      '🔒 Security PRs: 8 detected (all reviewed)',
      '⚙️  Actions disabled: 6.7% of repos (2/30)',
    ],
    actions: [
      'Enable branch protection on remaining repos',
      'Set up automated security scanning with CodeQL',
      'Configure Dependabot for dependency updates',
      'Consider CODEOWNERS for critical paths',
    ],
  },
  {
    label: 'Low Risk',
    riskLevel: 'low',
    insights: [
      '📊 Issue Detection Rate: 0.8% of PRs flagged',
      '✅ No self-merges detected in last 30 days',
      '🔒 Security PRs: 3 detected (all reviewed)',
      '✅ All repositories have Actions enabled',
    ],
    actions: [
      'Continue current review processes',
      'Set up automated security scanning with CodeQL',
      'Configure Dependabot for automated dependency updates',
      'Enable Dependabot security alerts',
    ],
  },
];

const RISK_LABELS: Record<RiskLevel, string> = {
  critical: 'Critical Risk',
  high: 'High Risk',
  medium: 'Medium Risk',
  low: 'Low Risk',
};

/* AAA-accessible risk colours — verified ≥ 7:1 on tinted dark backgrounds */
const RISK_COLOURS: Record<RiskLevel, string> = {
  critical: '#ffa070',
  high: '#f6ad55',
  medium: '#a8b5f5',
  low: '#48c78e',
};

export default function AIDemo(): React.ReactElement {
  const [active, setActive] = useState(0);
  const scenario = SCENARIOS[active];

  return (
    <div className="terminal-window">
      <div className="terminal-header">
        <span className="terminal-dot" style={{ background: '#ff5f56' }} aria-hidden="true" />
        <span className="terminal-dot" style={{ background: '#ffbd2e' }} aria-hidden="true" />
        <span className="terminal-dot" style={{ background: '#27c93f' }} aria-hidden="true" />
        <span className="terminal-title">hubhelper analyze --org acme-corp</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }} role="group" aria-label="Demo scenarios">
          {SCENARIOS.map((s, i) => (
            <button
              key={s.label}
              onClick={() => setActive(i)}
              type="button"
              aria-pressed={i === active}
              aria-label={`Show ${s.label} scenario`}
              style={{
                background: i === active ? 'rgba(102,126,234,0.3)' : 'rgba(255,255,255,0.08)',
                border: '1px solid ' + (i === active ? 'rgba(102,126,234,0.6)' : 'rgba(255,255,255,0.15)'),
                color: i === active ? '#c8d2f9' : '#c0c0ce',
                borderRadius: '4px',
                padding: '0.2rem 0.6rem',
                fontSize: '0.7rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {s.label}
            </button>
          ))}
        </span>
      </div>
      <div className="terminal-body" style={{ whiteSpace: 'pre-wrap' }} aria-live="polite" aria-atomic="true">
        <span className="t-dim">{'════'.repeat(16)}{'\n'}</span>
        <span className="t-bold t-blue">{'  GitHub Organization Security Analysis\n'}</span>
        <span className="t-dim">{'════'.repeat(16)}{'\n\n'}</span>

        <span className="t-purple">{'🤖 AI-Powered Insights:\n'}</span>
        <span className="t-dim">{'=== Security Analysis Insights ===\n\n'}</span>

        {scenario.insights.map((line, i) => (
          <span key={i}>
            {line.startsWith('🚨') || line.startsWith('⚠') ? (
              <span className="t-yellow">{line}{'\n'}</span>
            ) : line.startsWith('✅') ? (
              <span className="t-green">{line}{'\n'}</span>
            ) : (
              <span>{line}{'\n'}</span>
            )}
          </span>
        ))}

        <span>{'\n'}</span>
        <span className="t-purple">{'🔰 Risk Assessment: '}</span>
        <RiskBadge level={scenario.riskLevel} />
        <span>{'\n\n'}</span>

        <span className="t-blue">{'💡 Recommended Actions:\n'}</span>
        {scenario.actions.map((action, i) => (
          <span key={i}>
            {action.startsWith('[URGENT]') ? (
              <span className="t-red">{`  ${i + 1}. ${action}\n`}</span>
            ) : (
              <span className="t-dim">{`  ${i + 1}. `}<span style={{ color: '#e2e8f0' }}>{action.replace('[URGENT] ', '')}{'\n'}</span></span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function RiskBadge({ level }: { level: RiskLevel }): React.ReactElement {
  const colour = RISK_COLOURS[level];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.35rem',
      padding: '0.15rem 0.65rem',
      borderRadius: '999px',
      fontSize: '0.78rem',
      fontWeight: 700,
      background: `${colour}22`,
      border: `1px solid ${colour}55`,
      color: colour,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      verticalAlign: 'middle',
    }}>
      {(level === 'critical' || level === 'high') && (
        <span aria-hidden="true" style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: colour,
          display: 'inline-block',
          animation: 'risk-pulse 1.5s infinite',
        }} />
      )}
      {RISK_LABELS[level]}
    </span>
  );
}
