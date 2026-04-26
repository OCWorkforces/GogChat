import log from 'electron-log';
import unhandled from 'electron-unhandled';
import { openNewGitHubIssue, debugInfo } from '../utils/platformHelpers.js';
import { getPackageInfo } from '../utils/packageInfo.js';

export default (): void => {
  const packageJson = getPackageInfo();

  unhandled({
    logger: (...args) => log.error(...args),
    reportButton: (error: Error) => {
      openNewGitHubIssue({
        repoUrl: packageJson.repository,
        body: `\`\`\`\n${error.stack}\n\`\`\`\n\n---\n\n${debugInfo()}`,
      });
    },
  });
};
