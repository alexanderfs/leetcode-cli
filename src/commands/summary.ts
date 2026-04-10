import { Command } from 'commander';
import { getProblemSummary } from '../api';
import { analyzeCode, analyzeCodeWithGemini } from '../ai';
import { pushToNotion } from '../notion';
import { pushToObsidian } from '../obsidian';

const progress = (msg: string) => process.stderr.write(msg + '\n');

export function registerSummaryCommand(program: Command): void {
  program
    .command('summary <url>')
    .description('Get full problem summary (details + submission + AI analysis) as JSON')
    .option('--no-analysis', 'Skip AI analysis')
    .option('--gemini', 'Use Gemini model for AI analysis (defaults output to Obsidian)')
    .option('--notion', 'Push result to Notion database after fetching')
    .option('--obsidian', 'Save result as a Markdown note in Obsidian vault')
    .option('--stdout', 'Print JSON to stdout even when --gemini is used')
    .action(async (url: string, opts: { analysis: boolean; gemini: boolean; notion: boolean; obsidian: boolean; stdout: boolean }) => {
      try {
        const analyzer = opts.analysis
          ? (opts.gemini ? analyzeCodeWithGemini : analyzeCode)
          : undefined;
        const summary = await getProblemSummary(
          url,
          analyzer,
          progress,
        );

        // --gemini defaults to Obsidian output unless --notion or --stdout is given
        const toObsidian = opts.obsidian || (opts.gemini && !opts.notion && !opts.stdout);

        if (opts.notion) {
          progress('⏳ Pushing to Notion...');
          const pageUrl = await pushToNotion(summary);
          progress(`✅ Notion page created: ${pageUrl}`);
        } else if (toObsidian) {
          progress('⏳ Writing to Obsidian vault...');
          const filePath = await pushToObsidian(summary);
          progress(`✅ Obsidian note saved: ${filePath}`);
        } else {
          console.log(JSON.stringify(summary, null, 2));
        }
      } catch (err) {
        process.stderr.write(`❌ Error: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}
