import log from 'electron-log';
import {openNewGitHubIssue} from 'electron-util';
import path from 'path';
import {app} from 'electron';
import { debugInfo } from 'electron-util/main';

export default async () => {
  const {default: unhandled} = await import('electron-unhandled');
  const packageJson = require(path.join(app.getAppPath(), 'packageon'));

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
