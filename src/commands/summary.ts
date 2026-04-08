import { Command } from 'commander';
import { getProblemSummary } from '../api';
import { analyzeCode } from '../ai';
import { pushToNotion } from '../notion';

const progress = (msg: string) => process.stderr.write(msg + '\n');

export function registerSummaryCommand(program: Command): void {
  program
    .command('summary <url>')
    .description('Get full problem summary (details + submission + AI analysis) as JSON')
    .option('--no-analysis', 'Skip AI analysis')
    .option('--notion', 'Push result to Notion database after fetching')
    .action(async (url: string, opts: { analysis: boolean; notion: boolean }) => {
      try {
        const summary = await getProblemSummary(
          url,
          opts.analysis ? analyzeCode : undefined,
          progress,
        );

        if (opts.notion) {
          progress('⏳ Pushing to Notion...');
          const pageUrl = await pushToNotion(summary);
          progress(`✅ Notion page created: ${pageUrl}`);
        } else {
          console.log(JSON.stringify(summary, null, 2));
        }
      } catch (err) {
        process.stderr.write(`❌ Error: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}
