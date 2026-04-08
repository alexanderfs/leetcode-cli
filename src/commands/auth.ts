import { Command } from 'commander';
import { setCookie, setCsrfToken, getCookie, getCsrfToken, getConfigPath, clearConfig } from '../config';

export function registerAuthCommand(program: Command): void {
  const auth = program.command('auth').description('Manage LeetCode authentication');

  auth
    .command('set')
    .description('Set your LeetCode cookie and CSRF token')
    .requiredOption('-c, --cookie <cookie>', 'Full Cookie header value from browser')
    .requiredOption('-t, --csrf <token>', 'CSRF token (csrftoken cookie value)')
    .action((opts: { cookie: string; csrf: string }) => {
      setCookie(opts.cookie);
      setCsrfToken(opts.csrf);
      console.log('✅ Auth credentials saved to', getConfigPath());
    });

  auth
    .command('show')
    .description('Show current auth config')
    .action(() => {
      const cookie = getCookie();
      const csrf = getCsrfToken();
      if (!cookie) {
        console.log('⚠️  No credentials set. Run: leetcode-cli auth set -c <cookie> -t <csrf>');
        return;
      }
      console.log(JSON.stringify({
        configPath: getConfigPath(),
        cookiePreview: cookie.slice(0, 40) + '...',
        csrfToken: csrf,
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
