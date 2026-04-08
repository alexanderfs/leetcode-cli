import { Command } from 'commander';
import { getProblemDetail, slugFromUrl } from '../api';

export function registerProblemCommand(program: Command): void {
  const problem = program.command('problem').description('Fetch LeetCode problem info');

  problem
    .command('get <url>')
    .description('Get problem details by URL (e.g. "https://leetcode.cn/problems/combinations/description/")')
    .option('--no-content', 'Omit HTML content field')
    .action(async (url: string, opts: { content: boolean }) => {
      try {
        const titleSlug = slugFromUrl(url);
        const data = await getProblemDetail(titleSlug);
        if (!opts.content) {
          data.content = '[omitted]';
        }
        console.log(JSON.stringify(data, null, 2));
      } catch (err) {
        console.error('❌ Error:', (err as Error).message);
        process.exit(1);
      }
    });
}
