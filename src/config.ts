import Conf from 'conf';
import path from 'path';
import os from 'os';

interface LeetCodeConfig {
  cookie: string;
  csrfToken: string;
}

const conf = new (Conf as any)({
  projectName: 'leetcode-cli',
  configName: '.leetcode-cli',
  cwd: os.homedir(),
  defaults: {
    cookie: '',
    csrfToken: '',
  },
});

export function getCookie(): string {
  return conf.get('cookie') as string;
}

export function getCsrfToken(): string {
  return conf.get('csrfToken') as string;
}

export function setCookie(cookie: string): void {
  conf.set('cookie', cookie);
}

export function setCsrfToken(token: string): void {
  conf.set('csrfToken', token);
}

export function getConfigPath(): string {
  return conf.path as string;
}

export function clearConfig(): void {
  conf.clear();
}
