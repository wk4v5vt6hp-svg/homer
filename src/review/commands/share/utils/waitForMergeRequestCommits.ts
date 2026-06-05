import { fetchMergeRequestCommits } from '@/core/services/gitlab';
import { logger } from '@/core/services/logger';
import type { GitlabCommit } from '@/core/typings/GitlabCommit';

const TIMEOUT_MS = 5000;
const RETRY_DELAY_MS = 1000;

export async function waitForMergeRequestCommits(
  projectId: number,
  mergeRequestIid: number,
  pushedCommitIds: Set<string>,
): Promise<GitlabCommit[]> {
  let timeoutReached = false;
  let lastCommits: GitlabCommit[] = [];

  const timeout = setTimeout(() => {
    logger.warn(
      `Pushed commits not found in MR !${mergeRequestIid} of project ${projectId} after ${TIMEOUT_MS}ms`,
    );
    timeoutReached = true;
  }, TIMEOUT_MS);

  while (!timeoutReached) {
    try {
      const commits = await fetchMergeRequestCommits(
        projectId,
        mergeRequestIid,
      );
      if (Array.isArray(commits)) {
        lastCommits = commits;
        if (lastCommits.some(({ id }) => pushedCommitIds.has(id))) {
          clearTimeout(timeout);
          return lastCommits;
        }
      }
    } catch (error) {
      logger.warn(
        `Failed to fetch commits for MR !${mergeRequestIid} of project ${projectId}: ${error instanceof Error ? error.message : error}`,
      );
    }
    await new Promise((resolve) => {
      setTimeout(resolve, RETRY_DELAY_MS);
    });
  }

  return lastCommits;
}
