import { app } from 'electron';

const REDUCED_MAC_PLATFORM_TOKEN = 'Macintosh; Intel Mac OS X 10_15_7';
const CHROME_ENGINE = 'AppleWebKit/537.36 (KHTML, like Gecko)';

export function buildUserAgentString(chromeVersion: string | undefined): string {
  const normalizedVersion = chromeVersion?.trim() || '0.0.0.0';
  return `Mozilla/5.0 (${REDUCED_MAC_PLATFORM_TOKEN}) ${CHROME_ENGINE} Chrome/${normalizedVersion} Safari/537.36`;
}

export const userAgentString = buildUserAgentString(process.versions.chrome);

export default () => {
  app.userAgentFallback = userAgentString;
};
