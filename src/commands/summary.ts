import { Command } from 'commander';
import { getProblemSummary } from '../api';
import { analyzeWithGemini } from '../ai';

export function registerSummaryCommand(program: Command): void {
  program
    .command('summary <url>')
    .description('Get full problem summary (details + submission + AI analysis) as JSON')
    .option('--no-analysis', 'Skip Gemini AI analysis')
    .action(async (url: string, opts: { analysis: boolean }) => {
      try {
        const summary = await getProblemSummary(
          url,
          opts.analysis ? analyzeWithGemini : undefined,
        );
        console.log(JSON.stringify(summary, null, 2));
      } catch (err) {
        console.error('❌ Error:', (err as Error).message);
        process.exit(1);
      }
    });
}
