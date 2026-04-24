// Automatic mock stub — the real implementations are overridden per-test
// via jest.mock('@github/copilot-sdk', () => ({ ... })) in each test file.
import { jest } from '@jest/globals';

export const CopilotClient = jest.fn();
export const CopilotSession = jest.fn();
export const defineTool = jest.fn();
