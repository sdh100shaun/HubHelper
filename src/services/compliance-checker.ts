/**
 * ComplianceChecker – pure-logic layer that evaluates user profiles against
 * an ApprovedEmailConfig and produces structured violation records.
 *
 * No network calls live here; all I/O is handled by GitHubFetcher and wired
 * together by ComplianceAnalyzer.
 *
 * @module services/compliance-checker
 */

import type {
  ApprovedEmailConfig,
  ComplianceResult,
  ComplianceViolation,
  ComplianceViolationType,
  UserProfile,
} from '../types/index.js';

export class ComplianceChecker {
  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Evaluate every profile in `profiles` against `config` and return the
   * aggregate compliance result for the given organisation.
   */
  checkAll(
    organization: string,
    profiles: UserProfile[],
    config: ApprovedEmailConfig
  ): ComplianceResult {
    const violations: ComplianceViolation[] = [];

    for (const profile of profiles) {
      const violation = this.checkUser(profile, config);
      if (violation) {
        violations.push(violation);
      }
    }

    return {
      organization,
      totalMembers: profiles.length,
      compliantMembers: profiles.length - violations.length,
      nonCompliantMembers: violations,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Evaluate a single profile.  Returns a ComplianceViolation when the user
   * breaks at least one rule, or `null` when fully compliant.
   */
  checkUser(profile: UserProfile, config: ApprovedEmailConfig): ComplianceViolation | null {
    const violations: ComplianceViolationType[] = [];

    if (!this.hasFullName(profile.name)) {
      violations.push('missing_full_name');
    }

    if (!this.isApprovedEmail(profile.email, config)) {
      violations.push('missing_approved_email');
    }

    if (violations.length === 0) return null;

    return {
      user: profile.login,
      violations,
      details: {
        name: profile.name,
        email: profile.email,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Individual rule checks (exported so they can be unit-tested in isolation)
  // -----------------------------------------------------------------------

  /**
   * Return `true` when `name` is a non-empty string after trimming.
   * A profile with only whitespace in the name field is treated as missing.
   */
  hasFullName(name: string | null): boolean {
    return name !== null && name.trim().length > 0;
  }

  /**
   * Return `true` when `email` is non-null and either:
   *   • its domain appears in `config.domains`, or
   *   • the full address appears in `config.exactEmails`.
   *
   * All comparisons are case-insensitive.  A null email always fails.
   */
  isApprovedEmail(email: string | null, config: ApprovedEmailConfig): boolean {
    if (email === null || email.trim().length === 0) return false;

    const normalised = email.toLowerCase().trim();
    const atIndex = normalised.indexOf('@');

    // Malformed address (no @)
    if (atIndex < 1) return false;

    const domain = normalised.slice(atIndex + 1);

    // Domain allow-list check
    if (config.domains.some((d) => d.trim().toLowerCase() === domain)) return true;

    // Exact-address allow-list check
    if (config.exactEmails?.some((e) => e.trim().toLowerCase() === normalised)) return true;

    return false;
  }
}
