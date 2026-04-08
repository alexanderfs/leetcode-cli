import { Command } from 'commander';
import {
  setCookie, setCsrfToken, setProxy, setNotionToken, setNotionDatabaseId,
  getCookie, getCsrfToken, getProxy, getNotionToken, getNotionDatabaseId,
  getConfigPath, clearConfig,
} from '../config';

export function registerAuthCommand(program: Command): void {
  const auth = program.command('auth').description('Manage LeetCode authentication');

  auth
    .command('set')
    .description('Update one or more config values (only provided options are changed)')
    .option('-c, --cookie <cookie>', 'Full Cookie header value from browser')
    .option('-t, --csrf <token>', 'CSRF token (csrftoken cookie value)')
    .option('-p, --proxy <url>', 'HTTP/HTTPS proxy (e.g. http://127.0.0.1:7890)')
    .option('-n, --notion-token <token>', 'Notion integration token (secret_...)')
    .option('-d, --notion-db <id>', 'Notion database ID to insert pages into')
    .action((opts: { cookie?: string; csrf?: string; proxy?: string; notionToken?: string; notionDb?: string }) => {
      if (!opts.cookie && !opts.csrf && !opts.proxy && !opts.notionToken && !opts.notionDb) {
        console.log('⚠️  No options provided. Usage: leetcode-cli auth set [-c cookie] [-t csrf] [-p proxy] [-n notion-token] [-d notion-db]');
        return;
      }
      if (opts.cookie) setCookie(opts.cookie);
      if (opts.csrf) setCsrfToken(opts.csrf);
      if (opts.proxy) setProxy(opts.proxy);
      if (opts.notionToken) setNotionToken(opts.notionToken);
      if (opts.notionDb) setNotionDatabaseId(opts.notionDb);
      console.log('✅ Config updated:', getConfigPath());
    });

  auth
    .command('show')
    .description('Show current auth config')
    .action(() => {
      const cookie = getCookie();
      if (!cookie) {
        console.log('⚠️  No credentials set. Run: leetcode-cli auth set -c <cookie> -t <csrf>');
        return;
      }
      const notionToken = getNotionToken();
      console.log(JSON.stringify({
        configPath: getConfigPath(),
        cookiePreview: cookie.slice(0, 40) + '...',
        csrfToken: getCsrfToken(),
        proxy: getProxy() || '(not set)',
        aiProvider: 'GitHub Models (gpt-4o-mini) — uses `gh auth token` automatically',
        notionToken: notionToken ? notionToken.slice(0, 12) + '...' : '(not set)',
        notionDatabaseId: getNotionDatabaseId() || '(not set)',
      }, null, 2));
    });

  auth
    .command('clear')
    .description('Clear stored credentials')
    .action(() => {
      clearConfig();
      console.log('✅ Credentials cleared.');
    });
}
