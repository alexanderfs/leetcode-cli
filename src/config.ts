import Conf from 'conf';
import os from 'os';

const conf = new (Conf as any)({
  projectName: 'leetcode-cli',
  configName: '.leetcode-cli',
  cwd: os.homedir(),
  defaults: {
    cookie: '',
    csrfToken: '',
    geminiApiKey: '',
    proxy: '',
    notionToken: '',
    notionDatabaseId: '',
  },
});

export function getCookie(): string { return conf.get('cookie') as string; }
export function getCsrfToken(): string { return conf.get('csrfToken') as string; }
export function getGeminiApiKey(): string { return conf.get('geminiApiKey') as string; }
export function getProxy(): string { return (process.env['HTTPS_PROXY'] ?? process.env['https_proxy'] ?? conf.get('proxy')) as string; }
export function getNotionToken(): string { return conf.get('notionToken') as string; }
export function getNotionDatabaseId(): string { return conf.get('notionDatabaseId') as string; }

export function setCookie(cookie: string): void { conf.set('cookie', cookie); }
export function setCsrfToken(token: string): void { conf.set('csrfToken', token); }
export function setGeminiApiKey(key: string): void { conf.set('geminiApiKey', key); }
export function setProxy(proxy: string): void { conf.set('proxy', proxy); }
export function setNotionToken(token: string): void { conf.set('notionToken', token); }
export function setNotionDatabaseId(id: string): void { conf.set('notionDatabaseId', id); }

export function getConfigPath(): string { return conf.path as string; }
export function clearConfig(): void { conf.clear(); }
