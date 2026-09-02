/**
 * Unit tests for StateManager
 *
 * Tests state persistence, loading, atomic writes, lock management,
 * corruption recovery, and state migrations.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { StateManager } from '../services/state-manager.js';

describe('StateManager', () => {
  let stateManager: StateManager;
  let testDir: string;

  beforeEach(() => {
    // Create temporary directory for tests
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hubhelper-test-'));

    stateManager = new StateManager({
      organization: 'test-org',
      statePath: testDir,
    });
  });

  afterEach(async () => {
    // Clean up lock and state files
    await stateManager.releaseLock();

    // Remove test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('State Directory Creation', () => {
    it('should create state directory if it does not exist', () => {
      const newDir = path.join(os.tmpdir(), 'hubhelper-new-test');

      // Ensure directory doesn't exist
      if (fs.existsSync(newDir)) {
        fs.rmSync(newDir, { recursive: true });
      }

      new StateManager({
        organization: 'test-org',
        statePath: newDir,
      });

      expect(fs.existsSync(newDir)).toBe(true);

      // Cleanup
      fs.rmSync(newDir, { recursive: true });
    });

    it('should set correct permissions on state directory', () => {
      const stats = fs.statSync(testDir);
      // Check that only owner can read/write/execute (700)
      expect(stats.mode & 0o777).toBe(0o700);
    });
  });

  describe('Lock Management', () => {
    it('should acquire lock successfully', async () => {
      await stateManager.acquireLock();

      const lockFile = path.join(testDir, 'test-org.lock');
      expect(fs.existsSync(lockFile)).toBe(true);

      const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
      expect(lockData.pid).toBe(process.pid);
      expect(lockData.organization).toBe('test-org');
      expect(lockData.timestamp).toBeDefined();
    });

    it('should prevent concurrent locks on same organization', async () => {
      await stateManager.acquireLock();

      const secondManager = new StateManager({
        organization: 'test-org',
        statePath: testDir,
      });

      await expect(secondManager.acquireLock()).rejects.toThrow(
        'Another instance is already watching'
      );
    });

    it('should clean up stale lock files', async () => {
      const lockFile = path.join(testDir, 'test-org.lock');

      // Create stale lock with non-existent PID
      const staleLock = {
        pid: 999999, // PID that doesn't exist
        organization: 'test-org',
        timestamp: new Date().toISOString(),
      };

      fs.writeFileSync(lockFile, JSON.stringify(staleLock));

      // Should successfully acquire lock despite existing lock file
      await expect(stateManager.acquireLock()).resolves.not.toThrow();

      // Verify new lock has current PID
      const newLock = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
      expect(newLock.pid).toBe(process.pid);
    });

    it('should release lock successfully', async () => {
      await stateManager.acquireLock();

      const lockFile = path.join(testDir, 'test-org.lock');
      expect(fs.existsSync(lockFile)).toBe(true);

      await stateManager.releaseLock();
      expect(fs.existsSync(lockFile)).toBe(false);
    });

    it('should handle releasing non-existent lock gracefully', async () => {
      await expect(stateManager.releaseLock()).resolves.not.toThrow();
    });
  });

  describe('State Persistence', () => {
    it('should save state with atomic write', async () => {
      const state = stateManager.createEmptyState('test-hash');

      await stateManager.saveState(state);

      const stateFile = path.join(testDir, 'test-org.json');
      expect(fs.existsSync(stateFile)).toBe(true);

      // Verify no temp files left behind
      const files = fs.readdirSync(testDir);
      expect(files.filter((f) => f.includes('.tmp'))).toHaveLength(0);
    });

    it('should set correct permissions on state file', async () => {
      const state = stateManager.createEmptyState('test-hash');
      await stateManager.saveState(state);

      const stateFile = path.join(testDir, 'test-org.json');
      const stats = fs.statSync(stateFile);

      // Should be readable/writable only by owner (600)
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it('should save state with correct structure', async () => {
      const state = stateManager.createEmptyState('test-hash');
      state.knownIssues = [
        {
          hash: 'abc123',
          firstSeen: '2026-01-25T10:00:00Z',
          lastSeen: '2026-01-25T10:00:00Z',
          severity: 'high',
          type: 'self-merge',
          repository: 'test/repo',
          description: 'Test issue',
        },
      ];

      await stateManager.saveState(state);

      const stateFile = path.join(testDir, 'test-org.json');
      const savedState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));

      expect(savedState.version).toBe('1.0.0');
      expect(savedState.organization).toBe('test-org');
      expect(savedState.configHash).toBe('test-hash');
      expect(savedState.knownIssues).toHaveLength(1);
      expect(savedState.knownIssues[0].hash).toBe('abc123');
    });
  });

  describe('State Loading', () => {
    it('should return null when no state exists', async () => {
      const state = await stateManager.loadState();
      expect(state).toBeNull();
    });

    it('should load previously saved state', async () => {
      const originalState = stateManager.createEmptyState('test-hash');
      originalState.knownIssues = [
        {
          hash: 'def456',
          firstSeen: '2026-01-25T10:00:00Z',
          lastSeen: '2026-01-25T10:00:00Z',
          severity: 'medium',
          type: 'disabled-actions',
          repository: 'test/repo',
          description: 'Test issue',
        },
      ];

      await stateManager.saveState(originalState);

      const loadedState = await stateManager.loadState();

      expect(loadedState).not.toBeNull();
      expect(loadedState?.organization).toBe('test-org');
      expect(loadedState?.knownIssues).toHaveLength(1);
      expect(loadedState?.knownIssues[0].hash).toBe('def456');
    });

    it('should handle corrupted state file', async () => {
      const stateFile = path.join(testDir, 'test-org.json');

      // Write invalid JSON
      fs.writeFileSync(stateFile, '{ invalid json }');

      const state = await stateManager.loadState();

      // Should return null and backup corrupted file
      expect(state).toBeNull();

      // Verify backup was created
      const files = fs.readdirSync(testDir);
      const backupFiles = files.filter((f) => f.includes('.corrupted'));
      expect(backupFiles.length).toBeGreaterThan(0);
    });

    it('should validate state schema', async () => {
      const stateFile = path.join(testDir, 'test-org.json');

      // Write state missing required fields
      const invalidState = {
        version: '1.0.0',
        // Missing organization, lastScanAt, etc.
      };

      fs.writeFileSync(stateFile, JSON.stringify(invalidState));

      const state = await stateManager.loadState();

      // Should return null due to validation failure
      expect(state).toBeNull();
    });
  });

  describe('State Creation', () => {
    it('should create empty state with correct defaults', () => {
      const state = stateManager.createEmptyState('config-hash-123');

      expect(state.version).toBe('1.0.0');
      expect(state.organization).toBe('test-org');
      expect(state.configHash).toBe('config-hash-123');
      expect(state.knownIssues).toEqual([]);
      expect(state.statistics.totalScans).toBe(0);
      expect(state.statistics.totalIssuesDetected).toBe(0);
      expect(state.lastScanAt).toBeDefined();
    });
  });

  describe('Configuration Hashing', () => {
    it('should generate consistent hash for same config', () => {
      const config = { org: 'test', interval: 60, severity: 'high' };

      const hash1 = stateManager.generateConfigHash(config);
      const hash2 = stateManager.generateConfigHash(config);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different config', () => {
      const config1 = { org: 'test', interval: 60 };
      const config2 = { org: 'test', interval: 30 };

      const hash1 = stateManager.generateConfigHash(config1);
      const hash2 = stateManager.generateConfigHash(config2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('State Clearing', () => {
    it('should clear existing state', async () => {
      const state = stateManager.createEmptyState('test-hash');
      await stateManager.saveState(state);

      const stateFile = path.join(testDir, 'test-org.json');
      expect(fs.existsSync(stateFile)).toBe(true);

      await stateManager.clearState();
      expect(fs.existsSync(stateFile)).toBe(false);
    });

    it('should handle clearing non-existent state', async () => {
      await expect(stateManager.clearState()).resolves.not.toThrow();
    });
  });

  describe('Last Scan Time', () => {
    it('should return null when no state exists', async () => {
      const lastScan = await stateManager.getLastScanTime();
      expect(lastScan).toBeNull();
    });

    it('should return last scan timestamp from state', async () => {
      const state = stateManager.createEmptyState('test-hash');
      const expectedTime = new Date('2026-01-25T10:30:00Z');
      state.lastScanAt = expectedTime.toISOString();

      await stateManager.saveState(state);

      const lastScan = await stateManager.getLastScanTime();
      expect(lastScan).toEqual(expectedTime);
    });
  });

  describe('Issue Pruning', () => {
    it('should prune issues older than retention period', () => {
      const state = stateManager.createEmptyState('test-hash');

      const now = new Date();
      const oldDate = new Date(now);
      oldDate.setDate(oldDate.getDate() - 100); // 100 days ago

      state.knownIssues = [
        {
          hash: 'old-issue',
          firstSeen: oldDate.toISOString(),
          lastSeen: oldDate.toISOString(),
          severity: 'low',
          type: 'test',
        },
        {
          hash: 'recent-issue',
          firstSeen: now.toISOString(),
          lastSeen: now.toISOString(),
          severity: 'high',
          type: 'test',
        },
      ];

      const prunedState = stateManager.pruneOldIssues(state, 90);

      expect(prunedState.knownIssues).toHaveLength(1);
      expect(prunedState.knownIssues[0].hash).toBe('recent-issue');
    });

    it('should keep all issues within retention period', () => {
      const state = stateManager.createEmptyState('test-hash');

      const now = new Date();
      state.knownIssues = [
        {
          hash: 'issue1',
          firstSeen: now.toISOString(),
          lastSeen: now.toISOString(),
          severity: 'low',
          type: 'test',
        },
        {
          hash: 'issue2',
          firstSeen: now.toISOString(),
          lastSeen: now.toISOString(),
          severity: 'high',
          type: 'test',
        },
      ];

      const prunedState = stateManager.pruneOldIssues(state, 90);

      expect(prunedState.knownIssues).toHaveLength(2);
    });
  });

  describe('Update Known Issues', () => {
    it('should add new issues to state', () => {
      const state = stateManager.createEmptyState('test-hash');

      const newIssues = [
        {
          hash: 'new-issue-1',
          firstSeen: '2026-01-25T10:00:00Z',
          lastSeen: '2026-01-25T10:00:00Z',
          severity: 'high' as const,
          type: 'self-merge',
        },
      ];

      const updatedState = stateManager.updateKnownIssues(state, newIssues);

      expect(updatedState.knownIssues).toHaveLength(1);
      expect(updatedState.knownIssues[0].hash).toBe('new-issue-1');
    });

    it('should update lastSeen for existing issues', () => {
      const state = stateManager.createEmptyState('test-hash');
      const oldTime = '2026-01-24T10:00:00Z';

      state.knownIssues = [
        {
          hash: 'existing-issue',
          firstSeen: oldTime,
          lastSeen: oldTime,
          severity: 'medium',
          type: 'test',
        },
      ];

      const updatedState = stateManager.updateKnownIssues(state, []);

      expect(updatedState.knownIssues[0].hash).toBe('existing-issue');
      expect(updatedState.knownIssues[0].lastSeen).not.toBe(oldTime);
    });

    it('should not duplicate existing issues', () => {
      const state = stateManager.createEmptyState('test-hash');

      state.knownIssues = [
        {
          hash: 'issue-1',
          firstSeen: '2026-01-25T10:00:00Z',
          lastSeen: '2026-01-25T10:00:00Z',
          severity: 'high',
          type: 'test',
        },
      ];

      const newIssues = [
        {
          hash: 'issue-1', // Same hash as existing
          firstSeen: '2026-01-25T11:00:00Z',
          lastSeen: '2026-01-25T11:00:00Z',
          severity: 'high' as const,
          type: 'test',
        },
      ];

      const updatedState = stateManager.updateKnownIssues(state, newIssues);

      expect(updatedState.knownIssues).toHaveLength(1);
    });

    it('should update lastScanAt timestamp', () => {
      const state = stateManager.createEmptyState('test-hash');
      const oldScanTime = '2026-01-24T10:00:00Z';
      state.lastScanAt = oldScanTime;

      const updatedState = stateManager.updateKnownIssues(state, []);

      expect(updatedState.lastScanAt).not.toBe(oldScanTime);
    });
  });
});
