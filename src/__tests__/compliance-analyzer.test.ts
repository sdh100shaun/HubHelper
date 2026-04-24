/**
 * Unit tests for ComplianceAnalyzer
 *
 * GitHubFetcher is fully mocked so that no network calls are made.
 * ComplianceChecker is exercised live (it is pure logic) to validate the
 * wiring between fetcher → checker → result.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ComplianceAnalyzer } from '../analyzers/compliance-analyzer.js';
import { ComplianceChecker } from '../services/compliance-checker.js';
import { GitHubFetcher } from '../services/github-fetcher.js';
import type { ApprovedEmailConfig, UserProfile } from '../types/index.js';

// Mock the fetcher so we never hit the network
jest.mock('../services/github-fetcher.js');

describe('ComplianceAnalyzer', () => {
  // biome-ignore lint/suspicious/noExplicitAny: jest mock helpers need any
  let mockFetcher: any;
  let analyzer: ComplianceAnalyzer;

  beforeEach(() => {
    // Reset module registry so each test gets a clean mock
    jest.clearAllMocks();

    // Grab the mock constructor that jest.mock injected
    const MockedFetcher = GitHubFetcher as unknown as jest.MockedClass<typeof GitHubFetcher>;

    // Define what the mock instance exposes
    mockFetcher = {
      getOrgMembers: jest.fn<() => Promise<UserProfile[]>>(),
      getApprovedEmailConfig: jest.fn<() => Promise<ApprovedEmailConfig>>(),
    };
    MockedFetcher.mockImplementation(() => mockFetcher);

    analyzer = new ComplianceAnalyzer('fake-token', 'test-org');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------
  // analyze – happy path
  // ---------------------------------------------------------------
  describe('analyze', () => {
    it('returns a fully compliant result when every member passes', async () => {
      mockFetcher.getApprovedEmailConfig.mockResolvedValue({
        domains: ['acme.com'],
        exactEmails: [],
      });
      mockFetcher.getOrgMembers.mockResolvedValue([
        { login: 'alice', name: 'Alice Smith', email: 'alice@acme.com' },
        { login: 'bob', name: 'Bob Jones', email: 'bob@acme.com' },
      ]);

      const result = await analyzer.analyze('policy-repo');

      expect(result.organization).toBe('test-org');
      expect(result.totalMembers).toBe(2);
      expect(result.compliantMembers).toBe(2);
      expect(result.nonCompliantMembers).toHaveLength(0);
    });

    it('detects members missing a full name', async () => {
      mockFetcher.getApprovedEmailConfig.mockResolvedValue({
        domains: ['acme.com'],
      });
      mockFetcher.getOrgMembers.mockResolvedValue([
        { login: 'nameless', name: null, email: 'nameless@acme.com' },
      ]);

      const result = await analyzer.analyze('policy-repo');

      expect(result.nonCompliantMembers).toHaveLength(1);
      expect(result.nonCompliantMembers[0].user).toBe('nameless');
      expect(result.nonCompliantMembers[0].violations).toContain('missing_full_name');
    });

    it('detects members with an unapproved email', async () => {
      mockFetcher.getApprovedEmailConfig.mockResolvedValue({
        domains: ['acme.com'],
      });
      mockFetcher.getOrgMembers.mockResolvedValue([
        { login: 'outsider', name: 'Out Sider', email: 'outsider@evil.net' },
      ]);

      const result = await analyzer.analyze('policy-repo');

      expect(result.nonCompliantMembers).toHaveLength(1);
      expect(result.nonCompliantMembers[0].violations).toContain('missing_approved_email');
    });

    it('detects members with a null email (no public email set)', async () => {
      mockFetcher.getApprovedEmailConfig.mockResolvedValue({
        domains: ['acme.com'],
      });
      mockFetcher.getOrgMembers.mockResolvedValue([
        { login: 'silent', name: 'Silent One', email: null },
      ]);

      const result = await analyzer.analyze('policy-repo');

      expect(result.nonCompliantMembers[0].violations).toContain('missing_approved_email');
    });

    it('detects both violations on the same user', async () => {
      mockFetcher.getApprovedEmailConfig.mockResolvedValue({
        domains: ['acme.com'],
      });
      mockFetcher.getOrgMembers.mockResolvedValue([{ login: 'ghost', name: null, email: null }]);

      const result = await analyzer.analyze('policy-repo');

      expect(result.nonCompliantMembers[0].violations).toEqual([
        'missing_full_name',
        'missing_approved_email',
      ]);
    });

    it('honours the exactEmails allow-list', async () => {
      mockFetcher.getApprovedEmailConfig.mockResolvedValue({
        domains: [],
        exactEmails: ['vip@external.com'],
      });
      mockFetcher.getOrgMembers.mockResolvedValue([
        { login: 'vip', name: 'Very Important', email: 'vip@external.com' },
        { login: 'fake', name: 'Fake VIP', email: 'fake@external.com' },
      ]);

      const result = await analyzer.analyze('policy-repo');

      expect(result.compliantMembers).toBe(1);
      expect(result.nonCompliantMembers[0].user).toBe('fake');
    });

    it('passes the custom config file path through to the fetcher', async () => {
      mockFetcher.getApprovedEmailConfig.mockResolvedValue({ domains: ['x.com'] });
      mockFetcher.getOrgMembers.mockResolvedValue([]);

      await analyzer.analyze('my-repo', 'config/emails.json');

      expect(mockFetcher.getApprovedEmailConfig).toHaveBeenCalledWith(
        'my-repo',
        'config/emails.json'
      );
    });

    it('uses the default config path when none is supplied', async () => {
      mockFetcher.getApprovedEmailConfig.mockResolvedValue({ domains: ['x.com'] });
      mockFetcher.getOrgMembers.mockResolvedValue([]);

      await analyzer.analyze('my-repo');

      expect(mockFetcher.getApprovedEmailConfig).toHaveBeenCalledWith(
        'my-repo',
        '.hubhelper/approved-emails.json'
      );
    });
  });

  // ---------------------------------------------------------------
  // analyze – error propagation
  // ---------------------------------------------------------------
  describe('analyze – error propagation', () => {
    it('throws when the config file cannot be fetched', async () => {
      mockFetcher.getApprovedEmailConfig.mockRejectedValue(new Error('404 – file not found'));

      await expect(analyzer.analyze('missing-repo')).rejects.toThrow('404');
    });

    it('throws when the member list fetch fails', async () => {
      mockFetcher.getApprovedEmailConfig.mockResolvedValue({ domains: ['x.com'] });
      mockFetcher.getOrgMembers.mockRejectedValue(new Error('API rate limit'));

      await expect(analyzer.analyze('repo')).rejects.toThrow('rate limit');
    });
  });

  // ---------------------------------------------------------------
  // getChecker / getFetcher accessors
  // ---------------------------------------------------------------
  describe('accessor methods', () => {
    it('getChecker returns a ComplianceChecker instance', () => {
      expect(analyzer.getChecker()).toBeInstanceOf(ComplianceChecker);
    });

    it('getFetcher returns the (mocked) GitHubFetcher instance', () => {
      // The instance returned should be the same object the mock created
      expect(analyzer.getFetcher()).toBe(mockFetcher);
    });
  });

  // ---------------------------------------------------------------
  // edge cases
  // ---------------------------------------------------------------
  describe('edge cases', () => {
    it('handles an empty organisation (zero members) gracefully', async () => {
      mockFetcher.getApprovedEmailConfig.mockResolvedValue({ domains: ['x.com'] });
      mockFetcher.getOrgMembers.mockResolvedValue([]);

      const result = await analyzer.analyze('repo');

      expect(result.totalMembers).toBe(0);
      expect(result.compliantMembers).toBe(0);
      expect(result.nonCompliantMembers).toHaveLength(0);
    });

    it('handles a large member list without crashing', async () => {
      mockFetcher.getApprovedEmailConfig.mockResolvedValue({ domains: ['acme.com'] });

      // Simulate 500 members – half compliant, half missing name
      const members = Array.from({ length: 500 }, (_, i) => ({
        login: `user${i}`,
        name: i % 2 === 0 ? `User ${i}` : null,
        email: `user${i}@acme.com`,
      }));
      mockFetcher.getOrgMembers.mockResolvedValue(members);

      const result = await analyzer.analyze('repo');

      expect(result.totalMembers).toBe(500);
      expect(result.compliantMembers).toBe(250);
      expect(result.nonCompliantMembers).toHaveLength(250);
    });
  });
});
