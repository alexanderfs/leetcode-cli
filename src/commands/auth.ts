import { Command } from 'commander';
import { setCookie, setCsrfToken, setProxy, getCookie, getCsrfToken, getProxy, getConfigPath, clearConfig } from '../config';

export function registerAuthCommand(program: Command): void {
  const auth = program.command('auth').description('Manage LeetCode authentication');

  auth
    .command('set')
    .description('Update one or more config values (only provided options are changed)')
    .option('-c, --cookie <cookie>', 'Full Cookie header value from browser')
    .option('-t, --csrf <token>', 'CSRF token (csrftoken cookie value)')
    .option('-p, --proxy <url>', 'HTTP/HTTPS proxy (e.g. http://127.0.0.1:7890)')
    .action((opts: { cookie?: string; csrf?: string; proxy?: string }) => {
      if (!opts.cookie && !opts.csrf && !opts.proxy) {
        console.log('⚠️  No options provided. Usage: leetcode-cli auth set [-c cookie] [-t csrf] [-p proxy]');
        return;
      }
      if (opts.cookie) setCookie(opts.cookie);
      if (opts.csrf) setCsrfToken(opts.csrf);
      if (opts.proxy) setProxy(opts.proxy);
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
      console.log(JSON.stringify({
        configPath: getConfigPath(),
        cookiePreview: cookie.slice(0, 40) + '...',
        csrfToken: getCsrfToken(),
        proxy: getProxy() || '(not set)',
        aiProvider: 'GitHub Models (gpt-4o-mini) — uses `gh auth token` automatically',
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
