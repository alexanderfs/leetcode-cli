import { Command } from 'commander';
import { getRecentSubmissions, getUserProfile, getLatestProblemSubmission, slugFromUrl } from '../api';

export function registerSubmissionCommand(program: Command): void {
  const sub = program.command('submission').description('Fetch submission records');

  sub
    .command('recent')
    .description('Get recent accepted/attempted submissions')
    .option('-l, --limit <n>', 'Number of submissions to fetch', '20')
    .action(async (opts: { limit: string }) => {
      try {
        const submissions = await getRecentSubmissions(parseInt(opts.limit, 10));
        console.log(JSON.stringify(submissions, null, 2));
      } catch (err) {
        console.error('❌ Error:', (err as Error).message);
        process.exit(1);
      }
    });

  sub
    .command('latest <url>')
    .description('Get latest submission (status + code) for a problem URL')
    .action(async (url: string) => {
      try {
        const titleSlug = slugFromUrl(url);
        const result = await getLatestProblemSubmission(titleSlug, url);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        console.error('❌ Error:', (err as Error).message);
        process.exit(1);
      }
    });
}

export function registerUserCommand(program: Command): void {
  const user = program.command('user').description('Fetch user profile');

  user
    .command('profile <username>')
    .description('Get public profile and solve stats for a user')
    .action(async (username: string) => {
      try {
        const profile = await getUserProfile(username);
        console.log(JSON.stringify(profile, null, 2));
      } catch (err) {
        console.error('❌ Error:', (err as Error).message);
        process.exit(1);
      }
    });
}
