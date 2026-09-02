// Stub for @octokit/rest — real impl overridden per-test via jest.mock()
import { jest } from '@jest/globals';

export const Octokit = jest.fn().mockImplementation(() => ({}));
