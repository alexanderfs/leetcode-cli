import axios, { AxiosError } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getGeminiApiKey, getProxy } from './config';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeWithGemini(
  problemTitle: string,
  difficulty: string,
  description: string,
  code: string,
  lang: string,
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return '(skipped — run `leetcode-cli auth set -g <key>` to enable AI analysis)';
  }

  const prompt = `
You are a code review assistant for LeetCode problems. Analyze the following submission concisely in English.

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

Keep the total response under 300 words.
`.trim();

  const proxyUrl = getProxy();
  const axiosConfig: Record<string, unknown> = {
    headers: { 'Content-Type': 'application/json' },
  };
  if (proxyUrl) {
    axiosConfig['httpsAgent'] = new HttpsProxyAgent(proxyUrl);
    axiosConfig['proxy'] = false;
  }

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
  };

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(
        `${GEMINI_API_URL}?key=${apiKey}`,
        body,
        axiosConfig,
      );
      const candidates = response.data?.candidates as Array<{
        content: { parts: Array<{ text: string }> };
      }>;
      return candidates?.[0]?.content?.parts?.[0]?.text ?? '(no response from Gemini)';
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const waitSec = attempt * 15;
        process.stderr.write(`⚠️  Gemini rate limited, retrying in ${waitSec}s (attempt ${attempt}/${maxRetries})...\n`);
        await sleep(waitSec * 1000);
        continue;
      }
      if (status === 429) {
        return '(Gemini rate limit exceeded — try again in a minute, or use --no-analysis)';
      }
      throw err;
    }
  }

  return '(analysis unavailable)';
}
