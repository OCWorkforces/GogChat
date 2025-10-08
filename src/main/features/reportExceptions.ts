import log from 'electron-log';
import { openNewGitHubIssue, debugInfo } from '../utils/platform';
import { getPackageInfo } from '../utils/packageInfo';

export default async () => {
  const { default: unhandled } = await import('electron-unhandled');
  const packageJson = getPackageInfo();

  unhandled({
    logger: log.error,
    reportButton: (error) => {
      openNewGitHubIssue({
        repoUrl: packageJson.repository,
        body: `\`\`\`\n${error.stack}\n\`\`\`\n\n---\n\n${debugInfo()}`,
      });
    },
  });
};
