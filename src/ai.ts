import axios, { AxiosError } from 'axios';
import { execSync } from 'child_process';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getProxy, getGeminiApiKey } from './config';

const GITHUB_MODELS_URL = 'https://models.inference.ai.azure.com/chat/completions';
const MODEL = 'gpt-4o';

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

  const systemMessage = `You are an expert competitive programmer and code reviewer specializing in LeetCode problems. \
Your goal is to give highly specific, actionable feedback that genuinely helps the developer write better, faster code. \
Always reason carefully about the algorithm before commenting.`;

  const userMessage = `## Problem
Title: ${problemTitle}
Difficulty: ${difficulty}
Description:
${description}

## Submitted Code (${lang})
\`\`\`${lang}
${code}
\`\`\`

Provide a structured analysis with these sections:

1. **Approach**: Name the algorithm/pattern used (e.g. "two-pointer", "BFS", "dynamic programming"). One or two sentences.

2. **Complexity**
   - Time: Big-O with a brief justification
   - Space: Big-O with a brief justification

3. **Is this optimal?**
   - If yes, confirm it and explain why no better complexity is achievable.
   - If no, describe the optimal approach and its complexity. Show a concise code sketch in \`\`\`${lang}\`\`\` of the key difference only (not a full rewrite).

4. **Concrete Improvements** (skip if already optimal): List at most 3 specific, ranked suggestions. For each one:
   - State *what* to change and *why* it matters (performance, readability, or correctness).
   - Show a short before/after code snippet in \`\`\`${lang}\`\`\` when the change is non-trivial.

5. **Edge Cases**: List any edge cases the current code might miss or handle incorrectly.

Be direct and technical. Avoid generic advice like "use meaningful variable names." Focus on algorithmic and structural improvements.`;

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
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 1500,
    temperature: 0.3,
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

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = (model: string, apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

export async function analyzeCodeWithGemini(
  problemTitle: string,
  difficulty: string,
  description: string,
  code: string,
  lang: string,
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('No Gemini API key found. Run `leetcode-cli auth set --gemini-key <key>` to configure it.');
  }

//   const prompt = `You are an expert competitive programmer and code reviewer specializing in LeetCode problems. \
// Your goal is to give highly specific, actionable feedback that genuinely helps the developer write better, faster code. \
// Always reason carefully about the algorithm before commenting.

// ## Problem
// Title: ${problemTitle}
// Difficulty: ${difficulty}
// Description:
// ${description}

// ## Submitted Code (${lang})
// \`\`\`${lang}
// ${code}
// \`\`\`

// Provide a structured analysis with these sections:

// 1. **Is this optimal?**
//    - If yes, confirm it and explain why no better complexity is achievable.
//    - If no, describe the optimal approach and its complexity. Show a concise code sketch in \`\`\`${lang}\`\`\` of the key difference only (not a full rewrite).

// 2. **Concrete Improvements** (skip if already optimal): List at most 3 specific, ranked suggestions. For each one:
//    - State *what* to change and *why* it matters (performance, readability, or correctness).
//    - Show a short before/after code snippet in \`\`\`${lang}\`\`\` when the change is non-trivial.

// Be direct and technical. Avoid generic advice like "use meaningful variable names." Focus on algorithmic and structural improvements.`;

const prompt = `You are a ruthless, elite competitive programmer. ZERO filler. ZERO introductory or concluding pleasantries. Be brutal, direct, and highly technical.

## Problem
Title: ${problemTitle}
Difficulty: ${difficulty}
Description:
${description}

## Submitted Code (${lang})
\`\`\`${lang}
${code}
\`\`\`

Provide your review EXACTLY in the following strict format:

### 1. Diagnosis
- **Time Complexity:** O(...) 
- **Space Complexity:** O(...)
- **Critique:** [1-2 sentences identifying the core algorithmic bottleneck, redundant logic, or simply state "Optimal" if it cannot be mathematically improved.]

### 2. Optimal Implementation
Provide the complete, most optimal code in ${lang}. NO step-by-step tutorial. NO broad advice. Just the raw code with some proper comments.
\`\`\`${lang}
// Optimal code here
\`\`\`

### 3. The "Why" (Key Differences)
List 1-3 bullet points explaining exactly what was changed from the original code and why it improves performance or correctness. Maximum one sentence per bullet.`;
  const proxyUrl = getProxy();
  const axiosConfig: Record<string, unknown> = {
    headers: { 'Content-Type': 'application/json' },
  };
  if (proxyUrl) {
    axiosConfig['httpsAgent'] = new HttpsProxyAgent(proxyUrl);
    axiosConfig['proxy'] = false;
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 16384, temperature: 0.3, thinkingConfig: { thinkingBudget: 4096 } },
  };

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(GEMINI_URL(GEMINI_MODEL, apiKey), body, axiosConfig);
      return (response.data?.candidates?.[0]?.content?.parts?.[0]?.text as string) ?? '(no response)';
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const waitSec = attempt * 10;
        process.stderr.write(`⚠️  Gemini rate limited, retrying in ${waitSec}s (attempt ${attempt}/${maxRetries})...\n`);
        await sleep(waitSec * 1000);
        continue;
      }
      if (status === 429) return '(rate limit exceeded — try again in a moment)';
      throw err;
    }
  }
  return '(analysis unavailable)';
}
