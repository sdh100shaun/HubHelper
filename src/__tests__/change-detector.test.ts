/**
 * Unit tests for ChangeDetector
 *
 * Tests issue fingerprinting, change detection, severity filtering,
 * deduplication, and issue grouping.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { ChangeDetector } from '../services/change-detector.js';
import type { IssueFingerprint } from '../types/watch.js';

interface SecurityIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  repository: string;
  description: string;
  [key: string]: unknown;
}

describe('ChangeDetector', () => {
  let detector: ChangeDetector;

  beforeEach(() => {
    detector = new ChangeDetector();
  });

  describe('Fingerprint Generation', () => {
    it('should generate consistent fingerprints for same issue', () => {
      const issue: SecurityIssue = {
        type: 'self-merge',
        severity: 'high',
        repository: 'org/repo',
        description: 'PR #123 was self-merged',
      };

      const hash1 = detector.generateFingerprint(issue);
      const hash2 = detector.generateFingerprint(issue);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64-char hex string
    });

    it('should generate different fingerprints for different issues', () => {
      const issue1: SecurityIssue = {
        type: 'self-merge',
        severity: 'high',
        repository: 'org/repo1',
        description: 'PR #123 was self-merged',
      };

      const issue2: SecurityIssue = {
        type: 'self-merge',
        severity: 'high',
        repository: 'org/repo2',
        description: 'PR #123 was self-merged',
      };

      const hash1 = detector.generateFingerprint(issue1);
      const hash2 = detector.generateFingerprint(issue2);

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize whitespace in descriptions', () => {
      const issue1: SecurityIssue = {
        type: 'self-merge',
        severity: 'high',
        repository: 'org/repo',
        description: 'PR  #123   was   self-merged', // Multiple spaces
      };

      const issue2: SecurityIssue = {
        type: 'self-merge',
        severity: 'high',
        repository: 'org/repo',
        description: 'PR #123 was self-merged', // Single spaces
      };

      const hash1 = detector.generateFingerprint(issue1);
      const hash2 = detector.generateFingerprint(issue2);

      expect(hash1).toBe(hash2);
    });

    it('should be case-insensitive for descriptions', () => {
      const issue1: SecurityIssue = {
        type: 'self-merge',
        severity: 'high',
        repository: 'org/repo',
        description: 'PR #123 WAS SELF-MERGED',
      };

      const issue2: SecurityIssue = {
        type: 'self-merge',
        severity: 'high',
        repository: 'org/repo',
        description: 'pr #123 was self-merged',
      };

      const hash1 = detector.generateFingerprint(issue1);
      const hash2 = detector.generateFingerprint(issue2);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different issue types', () => {
      const issue1: SecurityIssue = {
        type: 'self-merge',
        severity: 'high',
        repository: 'org/repo',
        description: 'Security issue',
      };

      const issue2: SecurityIssue = {
        type: 'disabled-actions',
        severity: 'high',
        repository: 'org/repo',
        description: 'Security issue',
      };

      const hash1 = detector.generateFingerprint(issue1);
      const hash2 = detector.generateFingerprint(issue2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('New Issue Detection', () => {
    it('should detect issues not in previous state', () => {
      const currentIssues: SecurityIssue[] = [
        {
          type: 'self-merge',
          severity: 'high',
          repository: 'org/repo1',
          description: 'New self-merge',
        },
        {
          type: 'disabled-actions',
          severity: 'medium',
          repository: 'org/repo2',
          description: 'Actions disabled',
        },
      ];

      const previousFingerprints: IssueFingerprint[] = [
        {
          hash: detector.generateFingerprint({
            type: 'disabled-actions',
            severity: 'medium',
            repository: 'org/repo2',
            description: 'Actions disabled',
          }),
          firstSeen: '2026-01-24T10:00:00Z',
          lastSeen: '2026-01-24T10:00:00Z',
          severity: 'medium',
          type: 'disabled-actions',
        },
      ];

      const newIssues = detector.detectNewIssues(currentIssues, previousFingerprints);

      expect(newIssues).toHaveLength(1);
      expect(newIssues[0].type).toBe('self-merge');
      expect(newIssues[0].repository).toBe('org/repo1');
    });

    it('should return empty array when all issues are known', () => {
      const currentIssues: SecurityIssue[] = [
        {
          type: 'self-merge',
          severity: 'high',
          repository: 'org/repo1',
          description: 'Known issue',
        },
      ];

      const previousFingerprints: IssueFingerprint[] = [
        {
          hash: detector.generateFingerprint(currentIssues[0]),
          firstSeen: '2026-01-24T10:00:00Z',
          lastSeen: '2026-01-24T10:00:00Z',
          severity: 'high',
          type: 'self-merge',
        },
      ];

      const newIssues = detector.detectNewIssues(currentIssues, previousFingerprints);

      expect(newIssues).toHaveLength(0);
    });

    it('should return all issues when previous state is empty', () => {
      const currentIssues: SecurityIssue[] = [
        {
          type: 'self-merge',
          severity: 'high',
          repository: 'org/repo1',
          description: 'Issue 1',
        },
        {
          type: 'disabled-actions',
          severity: 'medium',
          repository: 'org/repo2',
          description: 'Issue 2',
        },
      ];

      const newIssues = detector.detectNewIssues(currentIssues, []);

      expect(newIssues).toHaveLength(2);
    });
  });

  describe('Resolved Issue Detection', () => {
    it('should detect issues that were resolved', () => {
      const currentIssues: SecurityIssue[] = [
        {
          type: 'self-merge',
          severity: 'high',
          repository: 'org/repo1',
          description: 'Still present',
        },
      ];

      const previousFingerprints: IssueFingerprint[] = [
        {
          hash: detector.generateFingerprint(currentIssues[0]),
          firstSeen: '2026-01-24T10:00:00Z',
          lastSeen: '2026-01-24T10:00:00Z',
          severity: 'high',
          type: 'self-merge',
        },
        {
          hash: 'resolved-issue-hash',
          firstSeen: '2026-01-23T10:00:00Z',
          lastSeen: '2026-01-24T10:00:00Z',
          severity: 'medium',
          type: 'disabled-actions',
        },
      ];

      const resolvedIssues = detector.detectResolvedIssues(currentIssues, previousFingerprints);

      expect(resolvedIssues).toHaveLength(1);
      expect(resolvedIssues[0].hash).toBe('resolved-issue-hash');
      expect(resolvedIssues[0].type).toBe('disabled-actions');
    });

    it('should return empty array when no issues resolved', () => {
      const currentIssues: SecurityIssue[] = [
        {
          type: 'self-merge',
          severity: 'high',
          repository: 'org/repo1',
          description: 'Issue 1',
        },
      ];

      const previousFingerprints: IssueFingerprint[] = [
        {
          hash: detector.generateFingerprint(currentIssues[0]),
          firstSeen: '2026-01-24T10:00:00Z',
          lastSeen: '2026-01-24T10:00:00Z',
          severity: 'high',
          type: 'self-merge',
        },
      ];

      const resolvedIssues = detector.detectResolvedIssues(currentIssues, previousFingerprints);

      expect(resolvedIssues).toHaveLength(0);
    });
  });

  describe('Severity Filtering', () => {
    const testIssues: SecurityIssue[] = [
      {
        type: 'issue1',
        severity: 'low',
        repository: 'org/repo',
        description: 'Low severity',
      },
      {
        type: 'issue2',
        severity: 'medium',
        repository: 'org/repo',
        description: 'Medium severity',
      },
      {
        type: 'issue3',
        severity: 'high',
        repository: 'org/repo',
        description: 'High severity',
      },
      {
        type: 'issue4',
        severity: 'critical',
        repository: 'org/repo',
        description: 'Critical severity',
      },
    ];

    it('should filter to medium and above', () => {
      const filtered = detector.filterBySeverity(testIssues, 'medium');

      expect(filtered).toHaveLength(3);
      expect(filtered.map((i) => i.severity)).toEqual(['medium', 'high', 'critical']);
    });

    it('should filter to high and above', () => {
      const filtered = detector.filterBySeverity(testIssues, 'high');

      expect(filtered).toHaveLength(2);
      expect(filtered.map((i) => i.severity)).toEqual(['high', 'critical']);
    });

    it('should filter to critical only', () => {
      const filtered = detector.filterBySeverity(testIssues, 'critical');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].severity).toBe('critical');
    });

    it('should include all issues with low threshold', () => {
      const filtered = detector.filterBySeverity(testIssues, 'low');

      expect(filtered).toHaveLength(4);
    });
  });

  describe('Alert Decisions', () => {
    it('should alert on issue meeting severity threshold', () => {
      const issue: SecurityIssue = {
        type: 'self-merge',
        severity: 'high',
        repository: 'org/repo',
        description: 'Issue',
      };

      const config = {
        organization: 'org',
        token: 'token',
        intervalMinutes: 60,
        minSeverity: 'medium' as const,
        lookbackDays: 7,
        enableAI: true,
        alertChannels: ['console'],
      };

      expect(detector.shouldAlert(issue, config)).toBe(true);
    });

    it('should not alert on issue below severity threshold', () => {
      const issue: SecurityIssue = {
        type: 'self-merge',
        severity: 'low',
        repository: 'org/repo',
        description: 'Issue',
      };

      const config = {
        organization: 'org',
        token: 'token',
        intervalMinutes: 60,
        minSeverity: 'high' as const,
        lookbackDays: 7,
        enableAI: true,
        alertChannels: ['console'],
      };

      expect(detector.shouldAlert(issue, config)).toBe(false);
    });
  });

  describe('Fingerprint Creation', () => {
    it('should create fingerprints from issues', () => {
      const issues: SecurityIssue[] = [
        {
          type: 'self-merge',
          severity: 'high',
          repository: 'org/repo1',
          description: 'PR #123 was self-merged',
        },
        {
          type: 'disabled-actions',
          severity: 'medium',
          repository: 'org/repo2',
          description: 'Actions disabled',
        },
      ];

      const fingerprints = detector.createFingerprints(issues);

      expect(fingerprints).toHaveLength(2);
      expect(fingerprints[0].hash).toBeDefined();
      expect(fingerprints[0].severity).toBe('high');
      expect(fingerprints[0].type).toBe('self-merge');
      expect(fingerprints[0].repository).toBe('org/repo1');
      expect(fingerprints[0].firstSeen).toBeDefined();
      expect(fingerprints[0].lastSeen).toBeDefined();
    });

    it('should truncate long descriptions', () => {
      const longDescription = 'a'.repeat(300);

      const issues: SecurityIssue[] = [
        {
          type: 'test',
          severity: 'low',
          repository: 'org/repo',
          description: longDescription,
        },
      ];

      const fingerprints = detector.createFingerprints(issues);

      expect(fingerprints[0].description?.length).toBeLessThanOrEqual(200);
    });
  });

  describe('Severity Upgrades', () => {
    it('should detect when issue severity increases', () => {
      const currentIssues: SecurityIssue[] = [
        {
          type: 'self-merge',
          severity: 'critical',
          repository: 'org/repo',
          description: 'Security issue',
        },
      ];

      const previousFingerprints: IssueFingerprint[] = [
        {
          hash: detector.generateFingerprint({
            type: 'self-merge',
            severity: 'medium',
            repository: 'org/repo',
            description: 'Security issue',
          }),
          firstSeen: '2026-01-24T10:00:00Z',
          lastSeen: '2026-01-24T10:00:00Z',
          severity: 'medium',
          type: 'self-merge',
        },
      ];

      const upgrades = detector.detectSeverityUpgrades(currentIssues, previousFingerprints);

      expect(upgrades).toHaveLength(1);
      expect(upgrades[0].severity).toBe('critical');
    });

    it('should not detect downgrade as upgrade', () => {
      const currentIssues: SecurityIssue[] = [
        {
          type: 'self-merge',
          severity: 'low',
          repository: 'org/repo',
          description: 'Security issue',
        },
      ];

      const previousFingerprints: IssueFingerprint[] = [
        {
          hash: detector.generateFingerprint({
            type: 'self-merge',
            severity: 'high',
            repository: 'org/repo',
            description: 'Security issue',
          }),
          firstSeen: '2026-01-24T10:00:00Z',
          lastSeen: '2026-01-24T10:00:00Z',
          severity: 'high',
          type: 'self-merge',
        },
      ];

      const upgrades = detector.detectSeverityUpgrades(currentIssues, previousFingerprints);

      expect(upgrades).toHaveLength(0);
    });

    it('should not detect new issues as upgrades', () => {
      const currentIssues: SecurityIssue[] = [
        {
          type: 'self-merge',
          severity: 'critical',
          repository: 'org/repo',
          description: 'New issue',
        },
      ];

      const previousFingerprints: IssueFingerprint[] = [];

      const upgrades = detector.detectSeverityUpgrades(currentIssues, previousFingerprints);

      expect(upgrades).toHaveLength(0);
    });
  });

  describe('Issue Grouping', () => {
    it('should group issues by severity', () => {
      const issues: SecurityIssue[] = [
        {
          type: 'issue1',
          severity: 'critical',
          repository: 'org/repo',
          description: 'Critical',
        },
        {
          type: 'issue2',
          severity: 'high',
          repository: 'org/repo',
          description: 'High',
        },
        {
          type: 'issue3',
          severity: 'high',
          repository: 'org/repo',
          description: 'Another high',
        },
        {
          type: 'issue4',
          severity: 'medium',
          repository: 'org/repo',
          description: 'Medium',
        },
      ];

      const grouped = detector.groupBySeverity(issues);

      expect(grouped.critical).toHaveLength(1);
      expect(grouped.high).toHaveLength(2);
      expect(grouped.medium).toHaveLength(1);
      expect(grouped.low).toHaveLength(0);
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate correct statistics', () => {
      const newIssues: SecurityIssue[] = [
        { type: 't1', severity: 'critical', repository: 'org/r', description: 'd1' },
        { type: 't2', severity: 'high', repository: 'org/r', description: 'd2' },
        { type: 't3', severity: 'high', repository: 'org/r', description: 'd3' },
        { type: 't4', severity: 'medium', repository: 'org/r', description: 'd4' },
      ];

      const resolvedIssues: IssueFingerprint[] = [
        {
          hash: 'h1',
          firstSeen: '2026-01-24T10:00:00Z',
          lastSeen: '2026-01-24T10:00:00Z',
          severity: 'low',
          type: 't5',
        },
        {
          hash: 'h2',
          firstSeen: '2026-01-24T10:00:00Z',
          lastSeen: '2026-01-24T10:00:00Z',
          severity: 'medium',
          type: 't6',
        },
      ];

      const stats = detector.calculateStats(newIssues, resolvedIssues);

      expect(stats.totalNew).toBe(4);
      expect(stats.totalResolved).toBe(2);
      expect(stats.bySeverity.critical).toBe(1);
      expect(stats.bySeverity.high).toBe(2);
      expect(stats.bySeverity.medium).toBe(1);
      expect(stats.bySeverity.low).toBe(0);
    });
  });

  describe('Deduplication', () => {
    it('should remove duplicate issues', () => {
      const issues: SecurityIssue[] = [
        {
          type: 'self-merge',
          severity: 'high',
          repository: 'org/repo',
          description: 'Duplicate issue',
          extra: 'field1',
        },
        {
          type: 'self-merge',
          severity: 'high',
          repository: 'org/repo',
          description: 'Duplicate issue',
          extra: 'field2', // Different metadata
        },
        {
          type: 'self-merge',
          severity: 'high',
          repository: 'org/repo',
          description: 'Unique issue',
        },
      ];

      const deduplicated = detector.deduplicate(issues);

      expect(deduplicated).toHaveLength(2);
      expect(deduplicated[0].description).toBe('Duplicate issue');
      expect(deduplicated[1].description).toBe('Unique issue');
    });

    it('should keep all unique issues', () => {
      const issues: SecurityIssue[] = [
        {
          type: 'self-merge',
          severity: 'high',
          repository: 'org/repo1',
          description: 'Issue 1',
        },
        {
          type: 'self-merge',
          severity: 'high',
          repository: 'org/repo2',
          description: 'Issue 2',
        },
      ];

      const deduplicated = detector.deduplicate(issues);

      expect(deduplicated).toHaveLength(2);
    });

    it('should handle empty array', () => {
      const deduplicated = detector.deduplicate([]);
      expect(deduplicated).toHaveLength(0);
    });
  });
});
