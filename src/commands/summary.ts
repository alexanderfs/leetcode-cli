import { Command } from 'commander';
import { getProblemSummary } from '../api';
import { analyzeCode } from '../ai';

export function registerSummaryCommand(program: Command): void {
  program
    .command('summary <url>')
    .description('Get full problem summary (details + submission + AI analysis) as JSON')
    .option('--no-analysis', 'Skip AI analysis')
    .action(async (url: string, opts: { analysis: boolean }) => {
      try {
        const summary = await getProblemSummary(
          url,
          opts.analysis ? analyzeCode : undefined,
        );
        console.log(JSON.stringify(summary, null, 2));
      } catch (err) {
        console.error('❌ Error:', (err as Error).message);
        process.exit(1);
      }
    });
}
