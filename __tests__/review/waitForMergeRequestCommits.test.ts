import { fetchMergeRequestCommits } from '@/core/services/gitlab';
import { logger } from '@/core/services/logger';
import { waitForMergeRequestCommits } from '@/review/commands/share/utils/waitForMergeRequestCommits';

jest.mock('@/core/services/gitlab');

const mockFetch = fetchMergeRequestCommits as jest.Mock;

describe('review > waitForMergeRequestCommits', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns immediately when a pushed commit is found on the first fetch', async () => {
    const commits = [{ id: 'abc' }, { id: 'def' }];
    mockFetch.mockResolvedValue(commits);

    const result = await waitForMergeRequestCommits(1, 42, new Set(['abc']));

    expect(result).toBe(commits);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries until a pushed commit appears in the MR', async () => {
    const matchingCommits = [{ id: 'abc' }];
    mockFetch
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue(matchingCommits);

    const promise = waitForMergeRequestCommits(1, 42, new Set(['abc']));
    await jest.advanceTimersByTimeAsync(2000);

    expect(await promise).toBe(matchingCommits);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retries when GitLab returns a non-2xx response', async () => {
    const matchingCommits = [{ id: 'abc' }];
    mockFetch
      .mockResolvedValueOnce({ message: '503 Service Unavailable' })
      .mockResolvedValue(matchingCommits);

    const promise = waitForMergeRequestCommits(1, 42, new Set(['abc']));
    await jest.advanceTimersByTimeAsync(1000);

    expect(await promise).toBe(matchingCommits);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries after a network error', async () => {
    const matchingCommits = [{ id: 'abc' }];
    mockFetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(matchingCommits);

    const promise = waitForMergeRequestCommits(1, 42, new Set(['abc']));
    await jest.advanceTimersByTimeAsync(1000);

    expect(await promise).toBe(matchingCommits);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch commits for MR !42'),
    );
  });

  it('returns last known commits after timeout and logs a warning', async () => {
    mockFetch.mockResolvedValue([]);

    const promise = waitForMergeRequestCommits(1, 42, new Set(['abc']));
    await jest.advanceTimersByTimeAsync(6000);

    expect(await promise).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      'Pushed commits not found in MR !42 of project 1 after 5000ms',
    );
  });
});
