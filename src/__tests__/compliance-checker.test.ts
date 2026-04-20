/**
 * Unit tests for ComplianceChecker
 *
 * Covers every public method:
 *   hasFullName      – name-presence rule
 *   isApprovedEmail  – email-allowlist rule (domain + exact)
 *   checkUser        – single-profile evaluation
 *   checkAll         – aggregate scan over a member list
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { ComplianceChecker } from '../services/compliance-checker.js';
import type { ApprovedEmailConfig, UserProfile } from '../types/index.js';

describe('ComplianceChecker', () => {
  let checker: ComplianceChecker;

  /** Default config used by most tests */
  const defaultConfig: ApprovedEmailConfig = {
    domains: ['acme.com', 'partner.io'],
    exactEmails: ['contractor@external.org'],
  };

  beforeEach(() => {
    checker = new ComplianceChecker();
  });

  // ---------------------------------------------------------------
  // hasFullName
  // ---------------------------------------------------------------
  describe('hasFullName', () => {
    it('returns true for a normal name', () => {
      expect(checker.hasFullName('Alice Smith')).toBe(true);
    });

    it('returns true for a single-word name', () => {
      expect(checker.hasFullName('Alice')).toBe(true);
    });

    it('returns false for null', () => {
      expect(checker.hasFullName(null)).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(checker.hasFullName('')).toBe(false);
    });

    it('returns false for whitespace-only string', () => {
      expect(checker.hasFullName('   ')).toBe(false);
    });

    it('returns false for tab-only string', () => {
      expect(checker.hasFullName('\t\n')).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // isApprovedEmail
  // ---------------------------------------------------------------
  describe('isApprovedEmail', () => {
    it('accepts an email whose domain is on the allow-list', () => {
      expect(checker.isApprovedEmail('alice@acme.com', defaultConfig)).toBe(true);
    });

    it('accepts a second allowed domain', () => {
      expect(checker.isApprovedEmail('bob@partner.io', defaultConfig)).toBe(true);
    });

    it('accepts an exact-email match regardless of domain', () => {
      expect(checker.isApprovedEmail('contractor@external.org', defaultConfig)).toBe(true);
    });

    it('rejects an email whose domain is not on any list', () => {
      expect(checker.isApprovedEmail('eve@unknown.net', defaultConfig)).toBe(false);
    });

    it('rejects null email', () => {
      expect(checker.isApprovedEmail(null, defaultConfig)).toBe(false);
    });

    it('rejects empty string email', () => {
      expect(checker.isApprovedEmail('', defaultConfig)).toBe(false);
    });

    it('rejects whitespace-only email', () => {
      expect(checker.isApprovedEmail('   ', defaultConfig)).toBe(false);
    });

    it('rejects malformed email with no @', () => {
      expect(checker.isApprovedEmail('aliceacme.com', defaultConfig)).toBe(false);
    });

    it('rejects malformed email where @ is the first character', () => {
      expect(checker.isApprovedEmail('@acme.com', defaultConfig)).toBe(false);
    });

    it('performs case-insensitive domain comparison', () => {
      expect(checker.isApprovedEmail('Alice@ACME.COM', defaultConfig)).toBe(true);
    });

    it('performs case-insensitive exact-email comparison', () => {
      expect(checker.isApprovedEmail('Contractor@External.Org', defaultConfig)).toBe(true);
    });

    it('works when exactEmails is undefined', () => {
      const configNoExact: ApprovedEmailConfig = { domains: ['acme.com'] };
      expect(checker.isApprovedEmail('alice@acme.com', configNoExact)).toBe(true);
      expect(checker.isApprovedEmail('bob@other.com', configNoExact)).toBe(false);
    });

    it('works with an empty domains list when exact match is present', () => {
      const configEmptyDomains: ApprovedEmailConfig = {
        domains: [],
        exactEmails: ['special@example.com'],
      };
      expect(checker.isApprovedEmail('special@example.com', configEmptyDomains)).toBe(true);
      expect(checker.isApprovedEmail('anyone@example.com', configEmptyDomains)).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // checkUser
  // ---------------------------------------------------------------
  describe('checkUser', () => {
    it('returns null for a fully compliant user', () => {
      const profile: UserProfile = {
        login: 'alice',
        name: 'Alice Smith',
        email: 'alice@acme.com',
      };
      expect(checker.checkUser(profile, defaultConfig)).toBeNull();
    });

    it('flags missing_full_name only', () => {
      const profile: UserProfile = {
        login: 'bob',
        name: null,
        email: 'bob@acme.com',
      };
      const result = checker.checkUser(profile, defaultConfig);
      expect(result).not.toBeNull();
      expect(result!.user).toBe('bob');
      expect(result!.violations).toEqual(['missing_full_name']);
      expect(result!.details.name).toBeNull();
      expect(result!.details.email).toBe('bob@acme.com');
    });

    it('flags missing_approved_email only', () => {
      const profile: UserProfile = {
        login: 'charlie',
        name: 'Charlie Brown',
        email: 'charlie@random.net',
      };
      const result = checker.checkUser(profile, defaultConfig);
      expect(result).not.toBeNull();
      expect(result!.user).toBe('charlie');
      expect(result!.violations).toEqual(['missing_approved_email']);
      expect(result!.details.name).toBe('Charlie Brown');
      expect(result!.details.email).toBe('charlie@random.net');
    });

    it('flags missing_approved_email when email is null', () => {
      const profile: UserProfile = {
        login: 'dave',
        name: 'Dave Jones',
        email: null,
      };
      const result = checker.checkUser(profile, defaultConfig);
      expect(result).not.toBeNull();
      expect(result!.violations).toContain('missing_approved_email');
    });

    it('flags both violations together', () => {
      const profile: UserProfile = {
        login: 'ghost',
        name: null,
        email: null,
      };
      const result = checker.checkUser(profile, defaultConfig);
      expect(result).not.toBeNull();
      expect(result!.violations).toEqual(['missing_full_name', 'missing_approved_email']);
      expect(result!.details).toEqual({ name: null, email: null });
    });

    it('flags both when name is whitespace and email is unapproved', () => {
      const profile: UserProfile = {
        login: 'blank',
        name: '  ',
        email: 'blank@evil.io',
      };
      const result = checker.checkUser(profile, defaultConfig);
      expect(result).not.toBeNull();
      expect(result!.violations).toEqual(['missing_full_name', 'missing_approved_email']);
    });
  });

  // ---------------------------------------------------------------
  // checkAll
  // ---------------------------------------------------------------
  describe('checkAll', () => {
    it('returns zero violations for an empty member list', () => {
      const result = checker.checkAll('test-org', [], defaultConfig);
      expect(result.organization).toBe('test-org');
      expect(result.totalMembers).toBe(0);
      expect(result.compliantMembers).toBe(0);
      expect(result.nonCompliantMembers).toHaveLength(0);
      expect(result.checkedAt).toBeDefined();
    });

    it('marks all members compliant when everyone passes', () => {
      const profiles: UserProfile[] = [
        { login: 'a', name: 'Alice', email: 'a@acme.com' },
        { login: 'b', name: 'Bob', email: 'b@partner.io' },
      ];
      const result = checker.checkAll('org', profiles, defaultConfig);
      expect(result.totalMembers).toBe(2);
      expect(result.compliantMembers).toBe(2);
      expect(result.nonCompliantMembers).toHaveLength(0);
    });

    it('flags every member when nobody passes', () => {
      const profiles: UserProfile[] = [
        { login: 'x', name: null, email: null },
        { login: 'y', name: '', email: 'y@unknown.com' },
      ];
      const result = checker.checkAll('org', profiles, defaultConfig);
      expect(result.totalMembers).toBe(2);
      expect(result.compliantMembers).toBe(0);
      expect(result.nonCompliantMembers).toHaveLength(2);
    });

    it('produces a correct mixed result', () => {
      const profiles: UserProfile[] = [
        { login: 'good', name: 'Good User', email: 'good@acme.com' },
        { login: 'bad1', name: null, email: 'bad1@acme.com' },
        { login: 'bad2', name: 'Bad Two', email: null },
        { login: 'worst', name: null, email: null },
      ];
      const result = checker.checkAll('my-org', profiles, defaultConfig);

      expect(result.totalMembers).toBe(4);
      expect(result.compliantMembers).toBe(1);
      expect(result.nonCompliantMembers).toHaveLength(3);

      const logins = result.nonCompliantMembers.map((v) => v.user);
      expect(logins).toContain('bad1');
      expect(logins).toContain('bad2');
      expect(logins).toContain('worst');
      expect(logins).not.toContain('good');
    });

    it('sets checkedAt to a valid ISO timestamp', () => {
      const result = checker.checkAll('org', [], defaultConfig);
      expect(() => new Date(result.checkedAt)).not.toThrow();
      // Should be very recent (within last second)
      expect(Date.now() - new Date(result.checkedAt).getTime()).toBeLessThan(1000);
    });

    it('uses the exact-email allow-list correctly in bulk', () => {
      const profiles: UserProfile[] = [
        { login: 'contractor', name: 'Con Tractor', email: 'contractor@external.org' },
        { login: 'rogue', name: 'Rogue User', email: 'rogue@external.org' },
      ];
      const result = checker.checkAll('org', profiles, defaultConfig);
      expect(result.compliantMembers).toBe(1);
      expect(result.nonCompliantMembers).toHaveLength(1);
      expect(result.nonCompliantMembers[0].user).toBe('rogue');
    });
  });
});
