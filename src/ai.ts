import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiApiKey } from './config';

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

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `
You are a code review assistant for LeetCode problems. Analyze the following submission concisely in English.

## Problem
Title: ${problemTitle}
Difficulty: ${difficulty}
Description (HTML stripped):
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

  const result = await model.generateContent(prompt);
  return result.response.text();
}
