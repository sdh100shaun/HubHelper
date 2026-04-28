/**
 * CopilotAIClient
 *
 * Thin wrapper around @github/copilot-sdk that adds:
 * - Configurable model (default: claude-sonnet-4-6)
 * - Retry with exponential backoff on transient failures
 * - Single-use session lifecycle management
 *
 * @module services/copilot-ai-client
 */

import { CopilotClient, approveAll } from '@github/copilot-sdk';
import type { AssistantMessageEvent } from '@github/copilot-sdk';

export type AIModel =
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-6'
  | 'claude-opus-4-7'
  | 'claude-haiku-4-5';

export interface CopilotAIClientOptions {
  /** Model to use for completions. Defaults to claude-sonnet-4-6. */
  model?: AIModel;
  /** Maximum number of attempts (including the first). Defaults to 3. */
  maxAttempts?: number;
}

const DEFAULT_MODEL: AIModel = 'claude-sonnet-4-6';
const DEFAULT_MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 2000;

export class CopilotAIClient {
  private readonly model: AIModel;
  private readonly maxAttempts: number;
  private client: CopilotClient | null = null;
  private initPromise: Promise<boolean> | null = null;

  constructor(options: CopilotAIClientOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  private async init(): Promise<boolean> {
    try {
      this.client = new CopilotClient();
      await this.client.start();
      return true;
    } catch {
      this.client = null;
      return false;
    }
  }

  private ensureClient(): Promise<boolean> {
    if (!this.initPromise) {
      this.initPromise = this.init();
    }
    return this.initPromise;
  }

  /** Returns true if the Copilot SDK is available and authenticated. */
  async isAvailable(): Promise<boolean> {
    return this.ensureClient();
  }

  /**
   * Send a prompt and return the assistant's response text.
   * Returns null if the SDK is unavailable or all retries fail.
   */
  async complete(prompt: string): Promise<string | null> {
    const available = await this.ensureClient();
    if (!available || !this.client) {
      return null;
    }

    let lastError: unknown;

    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      if (attempt > 0) {
        await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
      }

      const session = await this.client.createSession({
        model: this.model,
        onPermissionRequest: approveAll,
      });

      try {
        const event: AssistantMessageEvent | undefined = await session.sendAndWait({ prompt });
        if (event?.data.content) {
          return event.data.content;
        }
        return null;
      } catch (err) {
        lastError = err;
      } finally {
        await session.destroy().catch(() => {});
      }
    }

    // All attempts failed — log for diagnostics without exposing secrets
    if (lastError instanceof Error) {
      console.error(
        `CopilotAIClient: all ${this.maxAttempts} attempts failed: ${lastError.message}`
      );
    }
    return null;
  }

  /** Release the underlying CopilotClient. Safe to call multiple times. */
  async dispose(): Promise<void> {
    if (this.client) {
      await this.client.stop().catch(() => {});
      this.client = null;
      this.initPromise = null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
