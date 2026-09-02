/**
 * StateManager - Persists and retrieves watch mode state between runs
 *
 * Handles:
 * - Loading/saving state to ~/.hubhelper/watch-state/<org>.json
 * - Atomic writes to prevent corruption
 * - Schema versioning and migrations
 * - Corruption recovery
 * - Lock file management to prevent concurrent instances
 *
 * @module services/state-manager
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IssueFingerprint, StateManagerConfig, WatchState } from '../types/watch.js';

const STATE_VERSION = '1.0.0';

export class StateManager {
  private readonly statePath: string;
  private readonly stateFile: string;
  private readonly lockFile: string;
  private readonly organization: string;

  constructor(config: StateManagerConfig) {
    this.organization = config.organization;
    this.statePath = config.statePath || path.join(os.homedir(), '.hubhelper', 'watch-state');
    this.stateFile = path.join(this.statePath, `${this.organization}.json`);
    this.lockFile = path.join(this.statePath, `${this.organization}.lock`);

    // Ensure state directory exists
    this.ensureStateDirectory();
  }

  /**
   * Ensure the state directory exists
   */
  private ensureStateDirectory(): void {
    if (!fs.existsSync(this.statePath)) {
      fs.mkdirSync(this.statePath, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Acquire exclusive lock to prevent concurrent instances
   * @throws {Error} If lock cannot be acquired
   */
  async acquireLock(): Promise<void> {
    try {
      // Check if lock file exists and is stale
      if (fs.existsSync(this.lockFile)) {
        const lockContent = fs.readFileSync(this.lockFile, 'utf-8');
        const lockData = JSON.parse(lockContent);

        // Check if process is still running
        try {
          process.kill(lockData.pid, 0); // Signal 0 checks if process exists
          throw new Error(
            `Another instance is already watching organization '${this.organization}' (PID: ${lockData.pid})`
          );
        } catch (error: unknown) {
          // Process doesn't exist, lock is stale
          // Node.js throws SystemError with code 'ESRCH' when process not found
          const nodeError = error as NodeJS.ErrnoException;
          if (nodeError.code === 'ESRCH') {
            console.warn(`Cleaning up stale lock file (PID ${lockData.pid} no longer exists)`);
            fs.unlinkSync(this.lockFile);
          } else {
            throw error;
          }
        }
      }

      // Create lock file
      const lockData = {
        pid: process.pid,
        organization: this.organization,
        timestamp: new Date().toISOString(),
      };

      fs.writeFileSync(this.lockFile, JSON.stringify(lockData, null, 2), { mode: 0o600 });

      console.log(`🔒 Acquired lock for organization: ${this.organization}`);
    } catch (error) {
      throw new Error(
        `Failed to acquire lock: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Release the lock
   */
  async releaseLock(): Promise<void> {
    if (fs.existsSync(this.lockFile)) {
      try {
        fs.unlinkSync(this.lockFile);
        console.log(`🔓 Released lock for organization: ${this.organization}`);
      } catch (error) {
        console.warn(
          `Warning: Failed to release lock: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  /**
   * Load state from disk
   * @returns WatchState or null if no previous state exists
   */
  async loadState(): Promise<WatchState | null> {
    if (!fs.existsSync(this.stateFile)) {
      console.log(`📂 No previous state found for organization: ${this.organization}`);
      return null;
    }

    try {
      const content = fs.readFileSync(this.stateFile, 'utf-8');
      const state = JSON.parse(content) as WatchState;

      // Validate state schema
      this.validateState(state);

      // Check if migration is needed
      if (state.version !== STATE_VERSION) {
        console.log(`🔄 Migrating state from version ${state.version} to ${STATE_VERSION}`);
        const migratedState = await this.migrateState(state);
        await this.saveState(migratedState); // Save migrated state
        return migratedState;
      }

      console.log(
        `📂 Loaded previous state (${state.knownIssues.length} known issues, last scan: ${state.lastScanAt})`
      );
      return state;
    } catch (error) {
      console.error(
        `⚠️ State file corruption detected: ${error instanceof Error ? error.message : 'Unknown error'}`
      );

      // Backup corrupted file
      const backupFile = `${this.stateFile}.corrupted.${Date.now()}`;
      fs.copyFileSync(this.stateFile, backupFile);
      console.warn(`📦 Corrupted state backed up to: ${backupFile}`);
      console.warn('🔄 Starting with fresh state');

      return null;
    }
  }

  /**
   * Save state to disk (atomic write)
   * @param state - State to save
   */
  async saveState(state: WatchState): Promise<void> {
    // Ensure state has correct version
    state.version = STATE_VERSION;

    try {
      // Write to temporary file first (atomic write pattern)
      const tempFile = `${this.stateFile}.tmp.${Date.now()}`;
      fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), { mode: 0o600 });

      // Rename temp file to actual state file (atomic operation)
      fs.renameSync(tempFile, this.stateFile);

      console.log(`💾 State saved (${state.knownIssues.length} issues tracked)`);
    } catch (error) {
      throw new Error(
        `Failed to save state: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Clear all state (useful for debugging or reset)
   */
  async clearState(): Promise<void> {
    if (fs.existsSync(this.stateFile)) {
      fs.unlinkSync(this.stateFile);
      console.log(`🗑️ State cleared for organization: ${this.organization}`);
    }
  }

  /**
   * Get last scan timestamp
   * @returns Date or null if no previous scan
   */
  async getLastScanTime(): Promise<Date | null> {
    const state = await this.loadState();
    return state ? new Date(state.lastScanAt) : null;
  }

  /**
   * Create initial empty state
   * @param configHash - MD5 hash of configuration
   * @returns Empty WatchState
   */
  createEmptyState(configHash: string): WatchState {
    return {
      version: STATE_VERSION,
      organization: this.organization,
      lastScanAt: new Date().toISOString(),
      configHash,
      knownIssues: [],
      statistics: {
        totalScans: 0,
        totalIssuesDetected: 0,
        totalAlertsSent: 0,
      },
    };
  }

  /**
   * Generate configuration hash
   * @param config - Watch configuration
   * @returns MD5 hash of configuration
   */
  generateConfigHash(config: Record<string, unknown>): string {
    const configString = JSON.stringify(config);
    return crypto.createHash('md5').update(configString).digest('hex');
  }

  /**
   * Validate state schema
   * @param state - State to validate
   * @throws {Error} If state is invalid
   */
  private validateState(state: unknown): asserts state is WatchState {
    if (!state || typeof state !== 'object') {
      throw new Error('State is not an object');
    }

    const s = state as Record<string, unknown>;

    if (typeof s.version !== 'string') {
      throw new Error('State missing version');
    }

    if (typeof s.organization !== 'string') {
      throw new Error('State missing organization');
    }

    if (typeof s.lastScanAt !== 'string') {
      throw new Error('State missing lastScanAt');
    }

    if (!Array.isArray(s.knownIssues)) {
      throw new Error('State missing knownIssues array');
    }

    if (!s.statistics || typeof s.statistics !== 'object') {
      throw new Error('State missing statistics');
    }
  }

  /**
   * Migrate state from old version to current version
   * @param oldState - State to migrate
   * @returns Migrated state
   */
  private async migrateState(oldState: WatchState): Promise<WatchState> {
    // Currently only one version exists, but this provides
    // a template for future migrations

    if (oldState.version === '1.0.0') {
      // Already current version
      return oldState;
    }

    // Example future migration:
    // if (oldState.version === '0.9.0') {
    //   return this.migrateFrom09To10(oldState);
    // }

    throw new Error(`Unsupported state version: ${oldState.version}`);
  }

  /**
   * Prune old issue fingerprints to keep state file size manageable
   * @param state - State to prune
   * @param retentionDays - Number of days to retain (default: 90)
   * @returns Pruned state
   */
  pruneOldIssues(state: WatchState, retentionDays = 90): WatchState {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const prunedIssues = state.knownIssues.filter(
      (issue) => new Date(issue.lastSeen) >= cutoffDate
    );

    const prunedCount = state.knownIssues.length - prunedIssues.length;
    if (prunedCount > 0) {
      console.log(`🧹 Pruned ${prunedCount} old issues (older than ${retentionDays} days)`);
    }

    return {
      ...state,
      knownIssues: prunedIssues,
    };
  }

  /**
   * Update known issues in state
   * @param state - Current state
   * @param newIssues - New issue fingerprints to add
   * @returns Updated state
   */
  updateKnownIssues(state: WatchState, newIssues: IssueFingerprint[]): WatchState {
    const existingHashes = new Set(state.knownIssues.map((i) => i.hash));
    const timestamp = new Date().toISOString();

    // Update lastSeen for existing issues
    const updatedIssues = state.knownIssues.map((issue) => ({
      ...issue,
      lastSeen: timestamp,
    }));

    // Add new issues
    const trulyNewIssues = newIssues.filter((issue) => !existingHashes.has(issue.hash));

    return {
      ...state,
      knownIssues: [...updatedIssues, ...trulyNewIssues],
      lastScanAt: timestamp,
    };
  }
}
