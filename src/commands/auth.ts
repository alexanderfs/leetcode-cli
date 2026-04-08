import { Command } from 'commander';
import { setCookie, setCsrfToken, setGeminiApiKey, getCookie, getCsrfToken, getGeminiApiKey, getConfigPath, clearConfig } from '../config';

export function registerAuthCommand(program: Command): void {
  const auth = program.command('auth').description('Manage LeetCode authentication');

  auth
    .command('set')
    .description('Set your LeetCode cookie, CSRF token, and optional Gemini API key')
    .requiredOption('-c, --cookie <cookie>', 'Full Cookie header value from browser')
    .requiredOption('-t, --csrf <token>', 'CSRF token (csrftoken cookie value)')
    .option('-g, --gemini-key <key>', 'Google Gemini API key (for problem analysis)')
    .action((opts: { cookie: string; csrf: string; geminiKey?: string }) => {
      setCookie(opts.cookie);
      setCsrfToken(opts.csrf);
      if (opts.geminiKey) setGeminiApiKey(opts.geminiKey);
      console.log('✅ Auth credentials saved to', getConfigPath());
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
      const geminiKey = getGeminiApiKey();
      console.log(JSON.stringify({
        configPath: getConfigPath(),
        cookiePreview: cookie.slice(0, 40) + '...',
        csrfToken: getCsrfToken(),
        geminiApiKey: geminiKey ? geminiKey.slice(0, 8) + '...' : '(not set)',
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
