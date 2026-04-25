import crypto from 'node:crypto';
import { PolicyEngine } from '../policy/engine.js';
import type { PolicyEngineResult } from '../policy/engine.js';
import { StreamReporter } from '../reporters/stream-reporter.js';
import type {
  GitHubEvent,
  GitHubPullRequestEventPayload,
  GitHubWorkflowRunEventPayload,
  PullRequest,
  Repository,
  SecurityIssue,
  StreamConfig,
  StreamEventResult,
  WorkflowRun,
} from '../types/index.js';
import { isSecurityRelated } from '../utils/security-utils.js';
import { GitHubEventsFetcher } from './github-events-fetcher.js';
import { GitHubFetcher } from './github-fetcher.js';

const MAX_HISTORY = 500;
const DEDUP_TTL_MS = 5 * 60 * 1000;
const REPO_REFRESH_MS = 15 * 60 * 1000;

const SEVERITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function meetsThreshold(severity: string, min: StreamConfig['minSeverity']): boolean {
  return (SEVERITY_ORDER[severity] ?? 0) >= (SEVERITY_ORDER[min] ?? 0);
}

function fingerprint(issue: SecurityIssue): string {
  const normalized = issue.description.toLowerCase().replace(/\s+/g, ' ').trim();
  return crypto
    .createHash('sha256')
    .update(`${issue.type}|${issue.repository}|${normalized}`)
    .digest('hex');
}

export class RealtimeOrchestrator {
  private readonly config: StreamConfig;
  private readonly fetcher: GitHubEventsFetcher;
  private readonly ghFetcher: GitHubFetcher;
  private readonly engine: PolicyEngine;
  private readonly reporter: StreamReporter;

  private isShuttingDown = false;
  private shutdownHandler: (() => void) | null = null;
  private repoRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  private repoCache: Repository[] = [];
  private prHistory: PullRequest[] = [];
  private workflowRunHistory: WorkflowRun[] = [];
  private readonly recentlyReported = new Map<string, number>();

  private eventsProcessed = 0;
  private violationsFound = 0;
  private readonly startTime = Date.now();

  constructor(config: StreamConfig) {
    this.config = config;
    this.fetcher = new GitHubEventsFetcher(config.token, config.organization);
    this.ghFetcher = new GitHubFetcher(config.token, config.organization);
    this.engine = new PolicyEngine();
    this.reporter = new StreamReporter({
      minSeverity: config.minSeverity,
      showCompliant: config.showCompliant,
    });
  }

  async start(): Promise<void> {
    await this.engine.loadPolicy(this.config.profilePath);

    this.reporter.printBanner(
      this.config.organization,
      this.config.pollIntervalSeconds,
      this.config.profilePath
    );

    this.repoCache = await this.ghFetcher.getRepositories(false);
    this.scheduleRepoRefresh();

    const initial = await this.fetcher.fetchNewEvents();
    this.fetcher.seedSeenIds(initial);

    this.registerSignalHandlers();

    while (!this.isShuttingDown) {
      const tickStart = Date.now();
      await this.tick();
      const elapsed = Date.now() - tickStart;
      const waitMs = Math.max(0, this.fetcher.getMinPollIntervalSeconds() * 1000 - elapsed);
      if (!this.isShuttingDown) {
        await this.sleep(waitMs);
      }
    }

    this.reporter.printShutdown({
      eventsProcessed: this.eventsProcessed,
      violationsFound: this.violationsFound,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    });
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true;
    if (this.shutdownHandler) {
      process.removeListener('SIGINT', this.shutdownHandler);
      process.removeListener('SIGTERM', this.shutdownHandler);
      this.shutdownHandler = null;
    }
    if (this.repoRefreshTimer) {
      clearTimeout(this.repoRefreshTimer);
      this.repoRefreshTimer = null;
    }
  }

  private async tick(): Promise<void> {
    let events: GitHubEvent[];
    try {
      events = await this.fetcher.fetchNewEvents();
    } catch (error) {
      this.reporter.printInlineError(
        `Failed to fetch events: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }

    for (const event of events) {
      await this.processEvent(event);
    }
  }

  private async processEvent(event: GitHubEvent): Promise<void> {
    this.eventsProcessed++;

    const artifact = this.mapEvent(event);
    if (!artifact) {
      if (this.config.showCompliant) {
        const result: StreamEventResult = {
          event,
          violations: [],
          timestamp: new Date().toISOString(),
        };
        this.reporter.printEvent(result);
      }
      return;
    }

    if ('merged_at' in artifact) {
      this.prHistory = appendCapped(this.prHistory, artifact as PullRequest, MAX_HISTORY);
    } else {
      this.workflowRunHistory = appendCapped(
        this.workflowRunHistory,
        artifact as WorkflowRun,
        MAX_HISTORY
      );
    }

    let engineResult: PolicyEngineResult;
    try {
      engineResult = await this.engine.evaluate(
        this.repoCache,
        this.prHistory,
        this.workflowRunHistory
      );
    } catch (error) {
      this.reporter.printInlineError(
        `Policy evaluation failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }

    const scoped = this.scopeToEvent(event, artifact, engineResult.issues);
    const now = Date.now();
    this.pruneDedup(now);

    const newViolations = scoped.filter((issue) => {
      const fp = fingerprint(issue);
      if (this.recentlyReported.has(fp)) return false;
      if (!meetsThreshold(issue.severity, this.config.minSeverity)) return false;
      this.recentlyReported.set(fp, now);
      return true;
    });

    this.violationsFound += newViolations.length;

    const result: StreamEventResult = {
      event,
      violations: newViolations,
      timestamp: new Date().toISOString(),
    };

    if (newViolations.length > 0 || this.config.showCompliant) {
      this.reporter.printEvent(result);
    }
  }

  private mapEvent(event: GitHubEvent): PullRequest | WorkflowRun | null {
    if (event.type === 'PullRequestEvent') {
      const payload = event.payload as GitHubPullRequestEventPayload;
      if (payload.action !== 'closed') return null;
      const pr = payload.pull_request;
      if (!pr.merged && !pr.merged_at) return null;

      return {
        number: pr.number,
        title: pr.title,
        body: pr.body ?? undefined,
        url: pr.html_url,
        author: pr.user.login,
        merged_by: pr.merged_by?.login ?? null,
        merged_at: pr.merged_at,
        created_at: pr.created_at,
        repository: event.repo.name,
        labels: pr.labels.map((l) => l.name),
        is_security_related: isSecurityRelated(
          pr.title,
          pr.body ?? '',
          pr.labels.map((l) => l.name),
          []
        ),
        files_changed: [],
      };
    }

    if (event.type === 'WorkflowRunEvent') {
      const payload = event.payload as GitHubWorkflowRunEventPayload;
      if (payload.action !== 'completed') return null;
      const run = payload.workflow_run;

      return {
        id: run.id,
        name: run.name,
        head_branch: run.head_branch,
        head_sha: run.head_sha,
        status: 'completed',
        conclusion: (run.conclusion as WorkflowRun['conclusion']) ?? null,
        created_at: run.created_at,
        updated_at: run.updated_at,
        repository: event.repo.name,
        workflow_id: run.workflow_id,
        workflow_name: run.name ?? 'Unknown Workflow',
        run_number: run.run_number,
        event: run.event,
        run_attempt: run.run_attempt,
      };
    }

    return null;
  }

  private scopeToEvent(
    event: GitHubEvent,
    artifact: PullRequest | WorkflowRun,
    issues: SecurityIssue[]
  ): SecurityIssue[] {
    const repoName = event.repo.name;

    return issues.filter((issue) => {
      if (issue.repository !== repoName) return false;

      if ('merged_at' in artifact) {
        const pr = artifact as PullRequest;
        const prNum = issue.details?.pr_number;
        if (prNum !== undefined && prNum !== pr.number) return false;
      }

      return true;
    });
  }

  private pruneDedup(now: number): void {
    for (const [fp, ts] of this.recentlyReported) {
      if (now - ts > DEDUP_TTL_MS) {
        this.recentlyReported.delete(fp);
      }
    }
  }

  private scheduleRepoRefresh(): void {
    this.repoRefreshTimer = setTimeout(() => {
      if (this.isShuttingDown) return;
      this.ghFetcher
        .getRepositories(false)
        .then((repos) => {
          this.repoCache = repos;
        })
        .catch((err: unknown) => {
          this.reporter.printInlineError(
            `Repo cache refresh failed: ${err instanceof Error ? err.message : String(err)}`
          );
        })
        .finally(() => {
          if (!this.isShuttingDown) {
            this.scheduleRepoRefresh();
          }
        });
    }, REPO_REFRESH_MS).unref();
  }

  private registerSignalHandlers(): void {
    this.shutdownHandler = () => {
      void this.stop();
    };
    process.on('SIGINT', this.shutdownHandler);
    process.on('SIGTERM', this.shutdownHandler);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms).unref());
  }
}

function appendCapped<T>(arr: T[], item: T, max: number): T[] {
  const next = [...arr, item];
  return next.length > max ? next.slice(next.length - max) : next;
}
