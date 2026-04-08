#!/usr/bin/env node
import { Command } from 'commander';
import { registerAuthCommand } from './commands/auth';
import { registerProblemCommand } from './commands/problem';
import { registerSubmissionCommand, registerUserCommand } from './commands/submission';
import { registerSummaryCommand } from './commands/summary';

const program = new Command();

program
  .name('leetcode-cli')
  .description('LeetCode CLI — fetch problems & submissions as JSON')
  .version('1.0.0');

registerAuthCommand(program);
registerProblemCommand(program);
registerSubmissionCommand(program);
registerUserCommand(program);
registerSummaryCommand(program);

program.parse(process.argv);
