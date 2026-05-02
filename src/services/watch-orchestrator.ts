/**
 * WatchOrchestrator - Main coordinator for watch mode operations
 *
 * Handles:
 * - Interval-based scanning
 * - Signal handling (SIGINT/SIGTERM) for graceful shutdown
 * - Coordination between StateManager, ChangeDetector, and GitHub services
 * - Retry logic with exponential backoff
 * - Scan statistics tracking
 * - Error handling and resilience
 *
 * @module services/watch-orchestrator
 */

import { SecurityAnalyzer } from '../analyzers/security-analyzer.js';
import type {
  SecurityIssue as FullSecurityIssue,
  PullRequest,
  Repository,
  WorkflowRun,
} from '../types/index.js';
import type { WatchConfig, WatchScanResult, WatchStatistics } from '../types/watch.js';
import type { StateManagerConfig } from '../types/watch.js';
import { ChangeDetector } from './change-detector.js';
import { GitHubFetcher } from './github-fetcher.js';
import { StateManager } from './state-manager.js';

// Flexible SecurityIssue interface for internal use
interface SecurityIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  repository: string;
  description: string;
  [key: string]: unknown;
}

export class WatchOrchestrator {
  private readonly config: WatchConfig;
  private readonly stateManager: StateManager;
  private readonly changeDetector: ChangeDetector;
  private readonly githubFetcher: GitHubFetcher;
  private readonly securityAnalyzer: SecurityAnalyzer;
  private intervalId: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private currentScanPromise: Promise<void> | null = null;
  private statistics: WatchStatistics;
  private startTime: number;
  private shutdownHandler: (() => Promise<void>) | null = null;

  constructor(config: WatchConfig) {
    this.config = config;
    this.startTime = Date.now();

    // Initialize components
    const stateConfig: StateManagerConfig = {
      organization: config.organization,
      statePath: config.statePath || '',
    };

    this.stateManager = new StateManager(stateConfig);
    this.changeDetector = new ChangeDetector();

    const auth = config.authConfig ?? config.token;
    if (!auth) {
      throw new Error(
        'WatchConfig requires either authConfig or token. ' +
          'Set GITHUB_TOKEN (PAT) or GITHUB_APP_ID + GITHUB_APP_INSTALLATION_ID + ' +
          'GITHUB_APP_PRIVATE_KEY[_PATH] (GitHub App).'
      );
    }
    this.githubFetcher = new GitHubFetcher(auth, config.organization);
    this.securityAnalyzer = new SecurityAnalyzer();

    // Initialize statistics
    this.statistics = {
      totalScans: 0,
      newIssuesDetected: 0,
      resolvedIssues: 0,
      apiCallsMade: 0,
      uptime: 0,
      lastScanAt: '',
      nextScanAt: '',
      state: 'stopped',
    };
  }

  /**
   * Start watch mode
   * Acquires lock, loads state, runs initial scan, then schedules periodic scans
   */
  async start(): Promise<void> {
    try {
      console.log(`🔒 Starting security watch for organization: ${this.config.organization}`);
      console.log(`📊 Scan interval: ${this.config.intervalMinutes} minutes`);
      console.log(`🎯 Minimum severity: ${this.config.minSeverity}`);

      // Acquire exclusive lock
      await this.stateManager.acquireLock();

      // Set up signal handlers for graceful shutdown
      this.setupSignalHandlers();

      // Reset state if requested
      if (this.config.resetState) {
        await this.stateManager.clearState();
      }

      // Run initial scan
      console.log('🔍 Running initial scan...\n');
      await this.runScan();

      // If one-shot mode, exit now
      if (this.config.once) {
        console.log('\n👋 Exiting (--once mode)');
        await this.stop();
        return;
      }

      // Schedule periodic scans
      this.scheduleNextScan();

      console.log('\n⏳ Watching... (press Ctrl+C to stop)');
    } catch (error) {
      console.error(
        `❌ Failed to start watch mode: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop watch mode gracefully
   * Waits for current scan to complete, saves state, releases lock
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return; // Already shutting down
    }

    this.isShuttingDown = true;
    this.statistics.state = 'stopped';

    console.log('\n🛑 Shutting down gracefully...');

    // Clear interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Wait for current scan to finish (with timeout)
    if (this.currentScanPromise) {
      console.log('⏳ Waiting for current scan to finish...');
      try {
        await Promise.race([
          this.currentScanPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Scan timeout')), 30000)),
        ]);
      } catch (error) {
        console.warn('⚠️ Scan did not complete within timeout');
      }
    }

    // Remove signal handlers to prevent memory leaks
    if (this.shutdownHandler) {
      process.removeListener('SIGINT', this.shutdownHandler);
      process.removeListener('SIGTERM', this.shutdownHandler);
      this.shutdownHandler = null;
    }

    // Release lock
    await this.stateManager.releaseLock();

    console.log('✅ Shutdown complete');
  }

  /**
   * Run a single scan cycle
   * Fetches data, detects changes, alerts on new issues, updates state
   */
  private async runScan(): Promise<void> {
    const scanStartTime = Date.now();
    this.statistics.state = 'running';

    try {
      // Load previous state
      const previousState = await this.stateManager.loadState();
      const previousFingerprints = previousState?.knownIssues || [];

      // Fetch data from GitHub
      console.log('📡 Fetching repositories, pull requests, and workflow runs...');
      const repositories = await this.githubFetcher.getRepositories();
      const pullRequests = await this.githubFetcher.getRecentPullRequests(this.config.lookbackDays);
      const workflowRuns = await this.githubFetcher.getRecentWorkflowRuns(this.config.lookbackDays);

      console.log(`   ├─ Repositories: ${repositories.length}`);
      console.log(
        `   ├─ Pull requests (last ${this.config.lookbackDays} days): ${pullRequests.length}`
      );
      console.log(
        `   └─ Workflow runs (last ${this.config.lookbackDays} days): ${workflowRuns.length}`
      );

      // Analyze for security issues using SecurityAnalyzer
      const currentIssues = await this.analyzeSecurityIssues(
        repositories,
        pullRequests,
        workflowRuns
      );

      // Detect changes
      const newIssues = this.changeDetector.detectNewIssues(currentIssues, previousFingerprints);
      const resolvedIssues = this.changeDetector.detectResolvedIssues(
        currentIssues,
        previousFingerprints
      );

      // Filter by severity threshold
      const newAlertsIssues = this.changeDetector.filterBySeverity(
        newIssues,
        this.config.minSeverity
      );

      // Update statistics
      this.statistics.totalScans++;
      this.statistics.newIssuesDetected += newAlertsIssues.length;
      this.statistics.resolvedIssues += resolvedIssues.length;
      this.statistics.lastScanAt = new Date().toISOString();

      // Alert on new issues
      if (newAlertsIssues.length > 0) {
        this.printNewIssuesAlert(newAlertsIssues);
      } else {
        console.log('✅ Scan complete - No new issues');
        console.log(
          `   Total scans: ${this.statistics.totalScans} | Known issues: ${currentIssues.length}`
        );
      }

      // Create/update state
      const configHash = this.stateManager.generateConfigHash({
        organization: this.config.organization,
        minSeverity: this.config.minSeverity,
        lookbackDays: this.config.lookbackDays,
      });

      let newState = previousState || this.stateManager.createEmptyState(configHash);

      // Update known issues
      const newFingerprints = this.changeDetector.createFingerprints(currentIssues);
      newState = this.stateManager.updateKnownIssues(newState, newFingerprints);

      // Update statistics
      newState.statistics.totalScans = this.statistics.totalScans;
      newState.statistics.totalIssuesDetected = this.statistics.newIssuesDetected;

      // Prune old issues
      newState = this.stateManager.pruneOldIssues(newState);

      // Save state
      await this.stateManager.saveState(newState);

      this.statistics.state = 'waiting';
    } catch (error) {
      console.error(`❌ Scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

      this.statistics.state = 'error';

      // Retry logic will be handled by the caller
      throw error;
    } finally {
      const scanDuration = Date.now() - scanStartTime;
      console.log(`\n⏱️  Scan duration: ${(scanDuration / 1000).toFixed(1)}s`);
    }
  }

  /**
   * Schedule next scan based on interval
   */
  private scheduleNextScan(): void {
    const intervalMs = this.config.intervalMinutes * 60 * 1000;

    this.intervalId = setInterval(() => {
      if (!this.isShuttingDown) {
        this.runScanWithRetry();
      }
    }, intervalMs);

    // Calculate next scan time
    const nextScanTime = new Date(Date.now() + intervalMs);
    this.statistics.nextScanAt = nextScanTime.toISOString();

    console.log(`⏰ Next scan at: ${nextScanTime.toLocaleString()}`);
  }

  /**
   * Run scan with retry logic
   * Implements exponential backoff for transient failures
   */
  private async runScanWithRetry(): Promise<void> {
    const maxRetries = 5;
    const baseDelay = 1000; // 1 second

    this.currentScanPromise = (async () => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          console.log(`\n${'='.repeat(60)}`);
          console.log(`🔍 Starting scan #${this.statistics.totalScans + 1}`);
          console.log(`${'='.repeat(60)}\n`);

          await this.runScan();
          return; // Success, exit retry loop
        } catch (error) {
          const isLastAttempt = attempt === maxRetries - 1;

          if (isLastAttempt) {
            console.error(`❌ Scan failed after ${maxRetries} attempts`);
            console.error(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return; // Give up after max retries
          }

          // Exponential backoff: 1s, 2s, 4s, 8s, 16s
          const delay = baseDelay * 2 ** attempt;
          console.warn(
            `⚠️ Scan failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay / 1000}s...`
          );
          console.warn(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    })();

    await this.currentScanPromise;
    this.currentScanPromise = null;
  }

  /**
   * Set up signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    this.shutdownHandler = async () => {
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', this.shutdownHandler);
    process.on('SIGTERM', this.shutdownHandler);
  }

  /**
   * Print alert for new issues
   */
  private printNewIssuesAlert(issues: SecurityIssue[]): void {
    const grouped = this.changeDetector.groupBySeverity(issues);

    console.log(`\n${'━'.repeat(60)}`);
    console.log(`🔔 NEW SECURITY ISSUES DETECTED - ${new Date().toLocaleString()}`);
    console.log('━'.repeat(60));
    console.log(`\nOrganization: ${this.config.organization}`);
    console.log(`New issues: ${issues.length}`);

    // Print by severity
    if (grouped.critical.length > 0) {
      console.log(`\n🚨 CRITICAL SEVERITY (${grouped.critical.length}):`);
      for (const issue of grouped.critical) {
        this.printIssue(issue);
      }
    }

    if (grouped.high.length > 0) {
      console.log(`\n🚨 HIGH SEVERITY (${grouped.high.length}):`);
      for (const issue of grouped.high) {
        this.printIssue(issue);
      }
    }

    if (grouped.medium.length > 0) {
      console.log(`\n⚠️ MEDIUM SEVERITY (${grouped.medium.length}):`);
      for (const issue of grouped.medium) {
        this.printIssue(issue);
      }
    }

    if (grouped.low.length > 0) {
      console.log(`\n ℹ️ LOW SEVERITY (${grouped.low.length}):`);
      for (const issue of grouped.low) {
        this.printIssue(issue);
      }
    }

    console.log(`\n${'━'.repeat(60)}`);
    console.log(
      `Total scans: ${this.statistics.totalScans} | Issues tracked: ${issues.length} | Alerts sent: ${this.statistics.newIssuesDetected}`
    );
    console.log('━'.repeat(60));
  }

  /**
   * Print a single issue
   */
  private printIssue(issue: SecurityIssue): void {
    const icon = this.getIssueIcon(issue.type);
    console.log(`  ${icon} ${issue.description}`);
    console.log(`     Repository: ${issue.repository}`);
    console.log('     First seen: Just now');
    console.log('');
  }

  /**
   * Get icon for issue type
   */
  private getIssueIcon(type: string): string {
    const icons: Record<string, string> = {
      'self-merge': '🔀',
      'disabled-actions': '⚙️',
      'paused-workflow': '⏸️',
      'security-pr': '🔒',
      'unreviewed-security': '👁️',
      action_failure: '❌',
      repeated_action_failure: '🔴',
    };

    return icons[type] || '⚠️';
  }

  /**
   * Analyze repositories, PRs, and workflow runs for security issues
   * Uses SecurityAnalyzer to detect security risks
   */
  private async analyzeSecurityIssues(
    repositories: Repository[],
    pullRequests: PullRequest[],
    workflowRuns: WorkflowRun[]
  ): Promise<SecurityIssue[]> {
    console.log('🔍 Analyzing for security issues...');

    // Use SecurityAnalyzer to generate analysis result
    const analysisResult = this.securityAnalyzer.generateAnalysisResult(
      repositories,
      pullRequests,
      workflowRuns
    );

    // Update API calls counter
    this.statistics.apiCallsMade += analysisResult.statistics.total_repos;
    this.statistics.apiCallsMade += analysisResult.statistics.total_prs;

    // Return the detected issues (cast to flexible interface for internal use)
    return analysisResult.issues as unknown as SecurityIssue[];
  }

  /**
   * Get current statistics
   */
  getStatistics(): WatchStatistics {
    this.statistics.uptime = Date.now() - this.startTime;
    return { ...this.statistics };
  }
}
