import React, { useState } from 'react';
import CodeBlock from '@theme/CodeBlock';

const POLICY_CONFIG = `{
  "domains": [
    "acme.com",
    "partner.io"
  ],
  "exactEmails": [
    "contractor@external.dev"
  ]
}`;

const COMPLIANCE_RESULT = `{
  "organization": "acme-corp",
  "totalMembers": 42,
  "compliantMembers": 39,
  "nonCompliantMembers": [
    {
      "user": "jsmith99",
      "violations": ["missing_approved_email"],
      "details": {
        "name": "John Smith",
        "email": "john@personal.email"
      }
    },
    {
      "user": "devx42",
      "violations": ["missing_full_name"],
      "details": {
        "name": null,
        "email": "dev@acme.com"
      }
    }
  ],
  "checkedAt": "2026-04-24T09:15:00.000Z"
}`;

const VIOLATION_DETAIL = `// Rule: missing_approved_email
// User: jsmith99 (john@personal.email)
//
// ✗ Domain "personal.email" not in approved list
//   Approved domains: acme.com, partner.io
//   Approved exact: contractor@external.dev
//
// Resolution: ask jsmith99 to update their
// GitHub profile to use their acme.com address.

// Rule: missing_full_name
// User: devx42 (dev@acme.com)
//
// ✗ GitHub profile has no full name set
//
// Resolution: ask devx42 to add their full
// name in GitHub Settings → Profile.`;

type Tab = 'config' | 'result' | 'violation';

const TABS: { id: Tab; label: string }[] = [
  { id: 'config', label: 'Policy Config' },
  { id: 'result', label: 'Compliance Result' },
  { id: 'violation', label: 'Violation Detail' },
];

export default function PolicyShowcase(): React.ReactElement {
  const [active, setActive] = useState<Tab>('config');

  const content = active === 'config'
    ? { code: POLICY_CONFIG, lang: 'json' }
    : active === 'result'
    ? { code: COMPLIANCE_RESULT, lang: 'json' }
    : { code: VIOLATION_DETAIL, lang: 'typescript' };

  return (
    <div className="policy-panel">
      <div className="policy-panel__tab-bar" role="tablist" aria-label="Policy example tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`policy-panel__tab${active === t.id ? ' active' : ''}`}
            onClick={() => setActive(t.id)}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            id={`tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        className="policy-panel__content"
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
      >
        <CodeBlock language={content.lang}>{content.code}</CodeBlock>
      </div>
    </div>
  );
}
