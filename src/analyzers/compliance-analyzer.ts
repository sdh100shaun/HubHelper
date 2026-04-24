/**
 * ComplianceAnalyzer – orchestration layer that wires GitHubFetcher and
 * ComplianceChecker together and produces the final ComplianceResult.
 *
 * Usage:
 *   const analyzer = new ComplianceAnalyzer(token, 'my-org');
 *   const result   = await analyzer.analyze('policy-repo');
 *
 * @module analyzers/compliance-analyzer
 */

import { ComplianceChecker } from '../services/compliance-checker.js';
import { GitHubFetcher } from '../services/github-fetcher.js';
import type { ComplianceResult } from '../types/index.js';

export class ComplianceAnalyzer {
  private readonly fetcher: GitHubFetcher;
  private readonly checker: ComplianceChecker;
  private readonly organization: string;

  constructor(token: string, organization: string) {
    this.fetcher = new GitHubFetcher(token, organization);
    this.checker = new ComplianceChecker();
    this.organization = organization;
  }

  /**
   * Run a full compliance check against the organisation.
   *
   * @param approvedEmailRepo  Name of the repository (inside the org) that
   *                            contains the approved-emails config file.
   * @param configFilePath     Path to the config JSON inside that repo.
   *                            Defaults to `.hubhelper/approved-emails.json`.
   * @returns                  Aggregate compliance result.
   */
  async analyze(
    approvedEmailRepo: string,
    configFilePath = '.hubhelper/approved-emails.json'
  ): Promise<ComplianceResult> {
    // 1. Fetch the approved-email configuration from the repo
    const emailConfig = await this.fetcher.getApprovedEmailConfig(
      approvedEmailRepo,
      configFilePath
    );

    // 2. Fetch every org member's profile
    const members = await this.fetcher.getOrgMembers();

    // 3. Hand off to the pure-logic checker
    return this.checker.checkAll(this.organization, members, emailConfig);
  }

  /**
   * Expose the underlying checker so callers can run ad-hoc checks against
   * an already-fetched member list without hitting the network again.
   */
  getChecker(): ComplianceChecker {
    return this.checker;
  }

  /**
   * Expose the underlying fetcher for advanced / incremental usage.
   */
  getFetcher(): GitHubFetcher {
    return this.fetcher;
  }
}
