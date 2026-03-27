/**
 * Unit tests for reportExceptions feature.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron-log', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('electron-unhandled', () => ({
  default: vi.fn(),
}));

vi.mock('../utils/platform', () => ({
  openNewGitHubIssue: vi.fn(),
  debugInfo: vi.fn().mockReturnValue('platform: darwin'),
}));

vi.mock('../utils/packageInfo', () => ({
  getPackageInfo: vi.fn().mockReturnValue({
    productName: 'GogChat',
    version: '1.0.0',
    author: 'test',
    repository: 'https://github.com/test/repo',
  }),
}));

import reportExceptions from './reportExceptions';
import log from 'electron-log';
import { openNewGitHubIssue } from '../utils/platform';
import { getPackageInfo } from '../utils/packageInfo';
import unhandled from 'electron-unhandled';

describe('reportExceptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers unhandled error handler', () => {
    reportExceptions();
    expect(unhandled).toHaveBeenCalledWith(
      expect.objectContaining({
        logger: expect.any(Function),
        reportButton: expect.any(Function),
      })
    );
  });

  it('logger function passes args to electron-log error', () => {
    reportExceptions();
    const callArgs = vi.mocked(unhandled).mock.calls[0][0];
    callArgs.logger('error message', 'detail');
    expect(log.error).toHaveBeenCalledWith('error message', 'detail');
  });

  it('reportButton function opens GitHub issue', () => {
    reportExceptions();
    const callArgs = vi.mocked(unhandled).mock.calls[0][0];

    const fakeError = { stack: 'Error: test\n  at line 1' };
    callArgs.reportButton(fakeError);

    expect(openNewGitHubIssue).toHaveBeenCalledWith({
      repoUrl: getPackageInfo().repository,
      body: expect.stringContaining('Error: test'),
    });
  });
});
