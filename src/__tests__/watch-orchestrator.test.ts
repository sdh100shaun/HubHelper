/**
 * Unit tests for WatchOrchestrator
 *
 * Tests watch mode coordination, scan cycles, retry logic,
 * signal handling, and graceful shutdown.
 */

// biome-ignore lint/suspicious/noExplicitAny: Test mocks use any types
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { WatchOrchestrator } from '../services/watch-orchestrator.js';
import type { WatchConfig } from '../types/watch.js';

// Mock the services
jest.mock('../services/state-manager.js');
jest.mock('../services/change-detector.js');
jest.mock('../services/github-fetcher.js');

describe('WatchOrchestrator', () => {
  let orchestrator: WatchOrchestrator;
  let testDir: string;
  let config: WatchConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockStateManager: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockChangeDetector: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockGitHubFetcher: any;

  beforeEach(() => {
    // Create temporary directory for tests
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hubhelper-orchestrator-test-'));

    // Create test config
    config = {
      organization: 'test-org',
      token: 'test-token',
      intervalMinutes: 1,
      minSeverity: 'medium' as const,
      lookbackDays: 7,
      enableAI: false,
      alertChannels: [],
      statePath: testDir,
      once: false,
      resetState: false,
      verbose: false,
    };

    // Mock StateManager
    mockStateManager = {
      acquireLock: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as undefined),
      releaseLock: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as undefined),
      loadState: jest.fn<() => Promise<any>>().mockResolvedValue(null),
      saveState: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as undefined),
      clearState: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as undefined),
      createEmptyState: jest.fn<() => any>().mockReturnValue({
        version: '1.0.0',
        organization: 'test-org',
        lastScanAt: new Date().toISOString(),
        configHash: 'test-hash',
        knownIssues: [],
        statistics: {
          totalScans: 0,
          totalIssuesDetected: 0,
          totalAlertsSent: 0,
        },
      }),
      generateConfigHash: jest.fn<() => string>().mockReturnValue('test-hash'),
      updateKnownIssues: jest
        .fn<(state: any, issues: any) => any>()
        .mockImplementation((state: any, issues: any) => ({
          ...state,
          knownIssues: issues,
        })),
      pruneOldIssues: jest.fn<(state: any) => any>().mockImplementation((state: any) => state),
    };

    // Mock ChangeDetector
    mockChangeDetector = {
      detectNewIssues: jest.fn<() => any[]>().mockReturnValue([]),
      detectResolvedIssues: jest.fn<() => any[]>().mockReturnValue([]),
      filterBySeverity: jest.fn<() => any[]>().mockReturnValue([]),
      groupBySeverity: jest.fn<() => any>().mockReturnValue({
        critical: [],
        high: [],
        medium: [],
        low: [],
      }),
      createFingerprints: jest.fn<() => any[]>().mockReturnValue([]),
    };

    // Mock GitHubFetcher
    mockGitHubFetcher = {
      getRepositories: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
      getRecentPullRequests: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    };

    // Apply mocks
    const { StateManager } = require('../services/state-manager.js');
    const { ChangeDetector } = require('../services/change-detector.js');
    const { GitHubFetcher } = require('../services/github-fetcher.js');

    StateManager.mockImplementation(() => mockStateManager);
    ChangeDetector.mockImplementation(() => mockChangeDetector);
    GitHubFetcher.mockImplementation(() => mockGitHubFetcher);

    // Spy on console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Clean up
    if (orchestrator) {
      await orchestrator.stop();
    }

    // Remove test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // Restore mocks
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct configuration', () => {
      orchestrator = new WatchOrchestrator(config);

      expect(orchestrator).toBeDefined();
      const stats = orchestrator.getStatistics();
      expect(stats.totalScans).toBe(0);
      expect(stats.state).toBe('stopped');
    });

    it('should create StateManager with correct config', () => {
      orchestrator = new WatchOrchestrator(config);

      const { StateManager } = require('../services/state-manager.js');
      expect(StateManager).toHaveBeenCalledWith({
        organization: 'test-org',
        statePath: testDir,
      });
    });

    it('should create GitHubFetcher with token and organization', () => {
      orchestrator = new WatchOrchestrator(config);

      const { GitHubFetcher } = require('../services/github-fetcher.js');
      expect(GitHubFetcher).toHaveBeenCalledWith('test-token', 'test-org');
    });
  });

  describe('Start and Stop', () => {
    it('should acquire lock on start', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      expect(mockStateManager.acquireLock).toHaveBeenCalled();
    });

    it('should release lock on stop', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();
      await orchestrator.stop();

      expect(mockStateManager.releaseLock).toHaveBeenCalled();
    });

    it('should clear state if resetState flag is set', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true, resetState: true });
      await orchestrator.start();

      expect(mockStateManager.clearState).toHaveBeenCalled();
    });

    it('should run initial scan on start', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      expect(mockGitHubFetcher.getRepositories).toHaveBeenCalled();
      expect(mockGitHubFetcher.getRecentPullRequests).toHaveBeenCalledWith(config.lookbackDays);
    });

    it('should exit after one scan in once mode', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      const stats = orchestrator.getStatistics();
      expect(stats.totalScans).toBe(1);
      expect(stats.state).toBe('stopped');
    });

    it('should handle shutdown gracefully', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();
      await orchestrator.stop();

      expect(mockStateManager.releaseLock).toHaveBeenCalled();
      const stats = orchestrator.getStatistics();
      expect(stats.state).toBe('stopped');
    });

    it('should not shutdown twice', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();
      await orchestrator.stop();

      const releaseLockCalls = mockStateManager.releaseLock.mock.calls.length;
      await orchestrator.stop(); // Second stop

      // Should not call releaseLock again
      expect(mockStateManager.releaseLock).toHaveBeenCalledTimes(releaseLockCalls);
    });
  });

  describe('Scan Cycle', () => {
    it('should load previous state before scanning', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      expect(mockStateManager.loadState).toHaveBeenCalled();
    });

    it('should fetch repositories and pull requests', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      expect(mockGitHubFetcher.getRepositories).toHaveBeenCalled();
      expect(mockGitHubFetcher.getRecentPullRequests).toHaveBeenCalledWith(7);
    });

    it('should detect new issues', async () => {
      const mockIssues = [
        {
          type: 'self-merge',
          severity: 'high' as const,
          repository: 'test/repo',
          description: 'Self-merge detected',
        },
      ];

      mockChangeDetector.detectNewIssues.mockReturnValue(mockIssues);
      mockChangeDetector.filterBySeverity.mockReturnValue(mockIssues);

      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      expect(mockChangeDetector.detectNewIssues).toHaveBeenCalled();
      const stats = orchestrator.getStatistics();
      expect(stats.newIssuesDetected).toBe(1);
    });

    it('should detect resolved issues', async () => {
      const mockResolved = [
        {
          hash: 'resolved-hash',
          firstSeen: '2026-01-24T10:00:00Z',
          lastSeen: '2026-01-25T10:00:00Z',
          severity: 'medium' as const,
          type: 'test',
        },
      ];

      mockChangeDetector.detectResolvedIssues.mockReturnValue(mockResolved);

      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      expect(mockChangeDetector.detectResolvedIssues).toHaveBeenCalled();
      const stats = orchestrator.getStatistics();
      expect(stats.resolvedIssues).toBe(1);
    });

    it('should filter issues by severity threshold', async () => {
      const mockIssues = [
        {
          type: 'test',
          severity: 'low' as const,
          repository: 'test/repo',
          description: 'Low severity',
        },
        {
          type: 'test',
          severity: 'high' as const,
          repository: 'test/repo',
          description: 'High severity',
        },
      ];

      mockChangeDetector.detectNewIssues.mockReturnValue(mockIssues);
      mockChangeDetector.filterBySeverity.mockReturnValue([mockIssues[1]]); // Only high

      orchestrator = new WatchOrchestrator({ ...config, once: true, minSeverity: 'medium' });
      await orchestrator.start();

      expect(mockChangeDetector.filterBySeverity).toHaveBeenCalledWith(mockIssues, 'medium');
    });

    it('should save state after scan', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      expect(mockStateManager.saveState).toHaveBeenCalled();
    });

    it('should prune old issues', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      expect(mockStateManager.pruneOldIssues).toHaveBeenCalled();
    });

    it('should update statistics after scan', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      const stats = orchestrator.getStatistics();
      expect(stats.totalScans).toBe(1);
      expect(stats.lastScanAt).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle lock acquisition failure', async () => {
      mockStateManager.acquireLock.mockRejectedValue(new Error('Lock failed'));

      orchestrator = new WatchOrchestrator({ ...config, once: true });

      await expect(orchestrator.start()).rejects.toThrow('Lock failed');
    });

    it('should handle state loading errors gracefully', async () => {
      mockStateManager.loadState.mockRejectedValue(new Error('Load failed'));

      orchestrator = new WatchOrchestrator({ ...config, once: true });

      await expect(orchestrator.start()).rejects.toThrow();
    });

    it('should handle GitHub fetch errors', async () => {
      mockGitHubFetcher.getRepositories.mockRejectedValue(new Error('API error'));

      orchestrator = new WatchOrchestrator({ ...config, once: true });

      await expect(orchestrator.start()).rejects.toThrow();
    });

    it('should set error state on scan failure then cleanup', async () => {
      mockGitHubFetcher.getRepositories.mockRejectedValue(new Error('API error'));

      orchestrator = new WatchOrchestrator({ ...config, once: true });

      try {
        await orchestrator.start();
      } catch {
        // Expected to fail
      }

      // After error and cleanup, state should be 'stopped'
      const stats = orchestrator.getStatistics();
      expect(stats.state).toBe('stopped');
      expect(mockStateManager.releaseLock).toHaveBeenCalled();
    });
  });

  describe('Statistics', () => {
    it('should track total scans', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      const stats = orchestrator.getStatistics();
      expect(stats.totalScans).toBe(1);
    });

    it('should track new issues detected', async () => {
      const mockIssues = [
        { type: 'test', severity: 'high' as const, repository: 'test/repo', description: 'Test' },
      ];
      mockChangeDetector.detectNewIssues.mockReturnValue(mockIssues);
      mockChangeDetector.filterBySeverity.mockReturnValue(mockIssues);

      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      const stats = orchestrator.getStatistics();
      expect(stats.newIssuesDetected).toBe(1);
    });

    it('should track uptime', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = orchestrator.getStatistics();
      expect(stats.uptime).toBeGreaterThan(0);
    });

    it('should update lastScanAt timestamp', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      const stats = orchestrator.getStatistics();
      expect(stats.lastScanAt).toBeDefined();
      expect(new Date(stats.lastScanAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Alerting', () => {
    it('should print alert for new issues', async () => {
      const mockIssues = [
        {
          type: 'self-merge',
          severity: 'critical' as const,
          repository: 'test/repo',
          description: 'Critical issue detected',
        },
      ];

      mockChangeDetector.detectNewIssues.mockReturnValue(mockIssues);
      mockChangeDetector.filterBySeverity.mockReturnValue(mockIssues);
      mockChangeDetector.groupBySeverity.mockReturnValue({
        critical: mockIssues,
        high: [],
        medium: [],
        low: [],
      });

      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      // Verify alert was printed
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('NEW SECURITY ISSUES DETECTED')
      );
    });

    it('should not print alert when no new issues', async () => {
      mockChangeDetector.detectNewIssues.mockReturnValue([]);
      mockChangeDetector.filterBySeverity.mockReturnValue([]);

      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      // Verify success message
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Scan complete - No new issues')
      );
    });

    it('should group issues by severity in alerts', async () => {
      const mockIssues = [
        { type: 'test', severity: 'critical' as const, repository: 'test/repo', description: '1' },
        { type: 'test', severity: 'high' as const, repository: 'test/repo', description: '2' },
        { type: 'test', severity: 'medium' as const, repository: 'test/repo', description: '3' },
      ];

      mockChangeDetector.detectNewIssues.mockReturnValue(mockIssues);
      mockChangeDetector.filterBySeverity.mockReturnValue(mockIssues);
      mockChangeDetector.groupBySeverity.mockReturnValue({
        critical: [mockIssues[0]],
        high: [mockIssues[1]],
        medium: [mockIssues[2]],
        low: [],
      });

      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      expect(mockChangeDetector.groupBySeverity).toHaveBeenCalledWith(mockIssues);
    });
  });

  describe('State Management Integration', () => {
    it('should create empty state when no previous state exists', async () => {
      mockStateManager.loadState.mockResolvedValue(null);

      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      expect(mockStateManager.createEmptyState).toHaveBeenCalled();
    });

    it('should use existing state when available', async () => {
      const existingState = {
        version: '1.0.0',
        organization: 'test-org',
        lastScanAt: '2026-01-24T10:00:00Z',
        configHash: 'test-hash',
        knownIssues: [
          {
            hash: 'existing-hash',
            firstSeen: '2026-01-24T10:00:00Z',
            lastSeen: '2026-01-24T10:00:00Z',
            severity: 'high' as const,
            type: 'test',
          },
        ],
        statistics: {
          totalScans: 5,
          totalIssuesDetected: 10,
          totalAlertsSent: 3,
        },
      };

      mockStateManager.loadState.mockResolvedValue(existingState);

      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      expect(mockChangeDetector.detectNewIssues).toHaveBeenCalledWith(
        expect.anything(),
        existingState.knownIssues
      );
    });

    it('should update known issues in state', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      expect(mockStateManager.updateKnownIssues).toHaveBeenCalled();
    });

    it('should generate config hash', async () => {
      orchestrator = new WatchOrchestrator({ ...config, once: true });
      await orchestrator.start();

      expect(mockStateManager.generateConfigHash).toHaveBeenCalledWith({
        organization: 'test-org',
        minSeverity: 'medium',
        lookbackDays: 7,
      });
    });
  });
});
