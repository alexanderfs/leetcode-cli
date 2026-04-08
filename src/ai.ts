import axios, { AxiosError } from 'axios';
import { execSync } from 'child_process';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getProxy } from './config';

const GITHUB_MODELS_URL = 'https://models.inference.ai.azure.com/chat/completions';
const MODEL = 'gpt-4o-mini';

function getGitHubToken(): string {
  // Prefer env var, fall back to gh CLI
  if (process.env['GITHUB_TOKEN']) return process.env['GITHUB_TOKEN'];
  try {
    return execSync('gh auth token', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    throw new Error('No GitHub token found. Run `gh auth login` or set GITHUB_TOKEN env var.');
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeCode(
  problemTitle: string,
  difficulty: string,
  description: string,
  code: string,
  lang: string,
): Promise<string> {
  const token = getGitHubToken();

  const prompt = `You are a code review assistant for LeetCode problems. Analyze the following submission concisely in English.

## Problem
Title: ${problemTitle}
Difficulty: ${difficulty}
Description:
${description}

## Submitted Code (${lang})
\`\`\`${lang}
${code}
\`\`\`

Please provide a structured analysis with these sections:
1. **Approach**: Brief description of the algorithm/approach used
2. **Time Complexity**: Big-O time complexity with explanation
3. **Space Complexity**: Big-O space complexity with explanation
4. **Strengths**: What's done well
5. **Improvements**: Specific suggestions to optimize or improve code quality

Keep the total response under 300 words.`;

  const proxyUrl = getProxy();
  const axiosConfig: Record<string, unknown> = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };
  if (proxyUrl) {
    axiosConfig['httpsAgent'] = new HttpsProxyAgent(proxyUrl);
    axiosConfig['proxy'] = false;
  }

  const body = {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
    temperature: 0.4,
  };

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(GITHUB_MODELS_URL, body, axiosConfig);
      return (response.data?.choices?.[0]?.message?.content as string) ?? '(no response)';
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const waitSec = attempt * 10;
        process.stderr.write(`⚠️  Rate limited, retrying in ${waitSec}s (attempt ${attempt}/${maxRetries})...\n`);
        await sleep(waitSec * 1000);
        continue;
      }
      if (status === 429) return '(rate limit exceeded — try again in a moment)';
      throw err;
    }
  }
  return '(analysis unavailable)';
}
