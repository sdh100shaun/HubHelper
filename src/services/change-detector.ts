/**
 * ChangeDetector - Identifies new and resolved security issues
 *
 * Handles:
 * - Generating unique fingerprints for security issues
 * - Comparing current scan results against previous state
 * - Detecting new issues (in current, not in previous)
 * - Detecting resolved issues (in previous, not in current)
 * - Filtering by minimum severity threshold
 *
 * @module services/change-detector
 */

import * as crypto from 'node:crypto';
import type { IssueFingerprint, WatchConfig } from '../types/watch.js';

interface SecurityIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  repository: string;
  description: string;
  [key: string]: unknown;
}

export class ChangeDetector {
  /**
   * Generate unique fingerprint for a security issue
   * Uses SHA-256 hash of type + repository + description
   *
   * @param issue - Security issue to fingerprint
   * @returns SHA-256 hash string
   */
  generateFingerprint(issue: SecurityIssue): string {
    // Create a stable string representation of the issue
    const components = [issue.type, issue.repository, this.normalizeDescription(issue.description)];

    const fingerprintInput = components.join('|');
    return crypto.createHash('sha256').update(fingerprintInput).digest('hex');
  }

  /**
   * Normalize description to handle minor variations
   * @param description - Issue description
   * @returns Normalized description
   */
  private normalizeDescription(description: string): string {
    return description.trim().toLowerCase().replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Detect new issues not present in previous state
   *
   * @param currentIssues - Issues from current scan
   * @param previousFingerprints - Fingerprints from previous state
   * @returns New issues that weren't in previous state
   */
  detectNewIssues(
    currentIssues: SecurityIssue[],
    previousFingerprints: IssueFingerprint[]
  ): SecurityIssue[] {
    const previousHashes = new Set(previousFingerprints.map((f) => f.hash));

    return currentIssues.filter((issue) => {
      const hash = this.generateFingerprint(issue);
      return !previousHashes.has(hash);
    });
  }

  /**
   * Detect issues that were resolved (in previous state but not current)
   *
   * @param currentIssues - Issues from current scan
   * @param previousFingerprints - Fingerprints from previous state
   * @returns Fingerprints of resolved issues
   */
  detectResolvedIssues(
    currentIssues: SecurityIssue[],
    previousFingerprints: IssueFingerprint[]
  ): IssueFingerprint[] {
    const currentHashes = new Set(currentIssues.map((issue) => this.generateFingerprint(issue)));

    return previousFingerprints.filter((fingerprint) => !currentHashes.has(fingerprint.hash));
  }

  /**
   * Filter issues by minimum severity threshold
   *
   * @param issues - Issues to filter
   * @param minSeverity - Minimum severity level
   * @returns Filtered issues
   */
  filterBySeverity(
    issues: SecurityIssue[],
    minSeverity: 'low' | 'medium' | 'high' | 'critical'
  ): SecurityIssue[] {
    const severityLevels: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    const minLevel = severityLevels[minSeverity];

    return issues.filter((issue) => {
      const issueLevel = severityLevels[issue.severity] || 0;
      return issueLevel >= minLevel;
    });
  }

  /**
   * Check if an issue should trigger an alert
   *
   * @param issue - Issue to check
   * @param config - Watch configuration
   * @returns true if issue should trigger alert
   */
  shouldAlert(issue: SecurityIssue, config: WatchConfig): boolean {
    // Check severity threshold
    const severityLevels: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    const issueLevel = severityLevels[issue.severity] || 0;
    const minLevel = severityLevels[config.minSeverity];

    return issueLevel >= minLevel;
  }

  /**
   * Convert security issues to issue fingerprints
   *
   * @param issues - Security issues to convert
   * @returns Array of issue fingerprints
   */
  createFingerprints(issues: SecurityIssue[]): IssueFingerprint[] {
    const timestamp = new Date().toISOString();

    return issues.map((issue) => ({
      hash: this.generateFingerprint(issue),
      firstSeen: timestamp,
      lastSeen: timestamp,
      severity: issue.severity,
      type: issue.type,
      repository: issue.repository,
      description: issue.description.substring(0, 200), // Truncate for storage
    }));
  }

  /**
   * Detect severity upgrades (same issue, higher severity)
   *
   * An issue might be flagged with higher severity if new information
   * is discovered. This should be treated as a new alert.
   *
   * @param currentIssues - Issues from current scan
   * @param previousFingerprints - Fingerprints from previous state
   * @returns Issues with severity upgrades
   */
  detectSeverityUpgrades(
    currentIssues: SecurityIssue[],
    previousFingerprints: IssueFingerprint[]
  ): SecurityIssue[] {
    const severityLevels: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    const previousByHash = new Map(previousFingerprints.map((f) => [f.hash, f]));

    return currentIssues.filter((issue) => {
      const hash = this.generateFingerprint(issue);
      const previous = previousByHash.get(hash);

      if (!previous) {
        return false; // Not an upgrade, it's a new issue
      }

      const currentLevel = severityLevels[issue.severity] || 0;
      const previousLevel = severityLevels[previous.severity] || 0;

      return currentLevel > previousLevel;
    });
  }

  /**
   * Group issues by severity for reporting
   *
   * @param issues - Issues to group
   * @returns Issues grouped by severity
   */
  groupBySeverity(issues: SecurityIssue[]): Record<string, SecurityIssue[]> {
    const grouped: Record<string, SecurityIssue[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    for (const issue of issues) {
      const severity = issue.severity || 'low';
      if (grouped[severity]) {
        grouped[severity].push(issue);
      }
    }

    return grouped;
  }

  /**
   * Calculate issue statistics
   *
   * @param newIssues - New issues detected
   * @param resolvedIssues - Resolved issues
   * @returns Statistics object
   */
  calculateStats(
    newIssues: SecurityIssue[],
    resolvedIssues: IssueFingerprint[]
  ): {
    totalNew: number;
    totalResolved: number;
    bySeverity: Record<string, number>;
  } {
    const bySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const issue of newIssues) {
      const severity = issue.severity || 'low';
      bySeverity[severity] = (bySeverity[severity] || 0) + 1;
    }

    return {
      totalNew: newIssues.length,
      totalResolved: resolvedIssues.length,
      bySeverity,
    };
  }

  /**
   * Deduplicate issues that might have slight variations
   * This is useful for issues that might be detected multiple times
   * with slight differences in description or metadata.
   *
   * @param issues - Issues to deduplicate
   * @returns Deduplicated issues
   */
  deduplicate(issues: SecurityIssue[]): SecurityIssue[] {
    const seen = new Set<string>();
    const deduplicated: SecurityIssue[] = [];

    for (const issue of issues) {
      const fingerprint = this.generateFingerprint(issue);

      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        deduplicated.push(issue);
      }
    }

    const duplicateCount = issues.length - deduplicated.length;
    if (duplicateCount > 0) {
      console.log(`🔍 Deduplicated ${duplicateCount} duplicate issues`);
    }

    return deduplicated;
  }
}
