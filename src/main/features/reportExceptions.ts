import log from 'electron-log';
import { openNewGitHubIssue, debugInfo } from '../utils/platform';
import path from 'path';
import {app} from 'electron';

export default async () => {
  const {default: unhandled} = await import('electron-unhandled');
  const packageJson = require(path.join(app.getAppPath(), 'package.json'));

  unhandled({
    logger: log.error,
    reportButton: error => {
      openNewGitHubIssue({
        repoUrl: packageJson.repository,
        body: `\`\`\`\n${error.stack}\n\`\`\`\n\n---\n\n${debugInfo()}`
      });
    }
  });
}
