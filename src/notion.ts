import { Client } from '@notionhq/client';
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';
import { getNotionToken, getNotionDatabaseId } from './config';
import type { ProblemSummary } from './api';

// Notion rich_text has a 2000-character limit per element
function chunkText(text: string, size = 2000): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [''];
}

function richText(text: string) {
  return chunkText(text).map((chunk) => ({
    type: 'text' as const,
    text: { content: chunk },
  }));
}

function heading1(text: string): BlockObjectRequest {
  return {
    object: 'block',
    type: 'heading_1',
    heading_1: { rich_text: [{ type: 'text', text: { content: text } }] },
  } as BlockObjectRequest;
}

function paragraph(text: string): BlockObjectRequest {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: richText(text) },
  } as BlockObjectRequest;
}

const LANG_MAP: Record<string, string> = {
  typescript: 'typescript',
  javascript: 'javascript',
  python: 'python',
  python3: 'python',
  java: 'java',
  'c++': 'c++',
  cpp: 'c++',
  c: 'c',
  go: 'go',
  rust: 'rust',
  kotlin: 'kotlin',
  swift: 'swift',
  ruby: 'ruby',
  scala: 'scala',
  csharp: 'c#',
};

function normalizeLanguage(lang: string): string {
  return LANG_MAP[lang.toLowerCase()] ?? 'plain text';
}

// Notion code blocks also have 2000-char limit; split into multiple if needed
function codeBlocks(code: string, lang: string): BlockObjectRequest[] {
  return chunkText(code, 2000).map((chunk) => ({
    object: 'block',
    type: 'code',
    code: {
      rich_text: [{ type: 'text', text: { content: chunk } }],
      language: normalizeLanguage(lang),
    },
  } as BlockObjectRequest));
}

export async function pushToNotion(summary: ProblemSummary): Promise<string> {
  const token = getNotionToken();
  const databaseId = getNotionDatabaseId();

  if (!token) throw new Error('Notion token not set. Run: leetcode-cli auth set -n <token>');
  if (!databaseId) throw new Error('Notion database ID not set. Run: leetcode-cli auth set -d <id>');

  const notion = new Client({ auth: token });

  const blocks: BlockObjectRequest[] = [];

  // Description section
  blocks.push(heading1('Description'));
  blocks.push(paragraph(summary.description || '(no description)'));

  // Use Cases section
  blocks.push(heading1('Use Cases'));
  if (summary.useCases.length > 0) {
    for (const uc of summary.useCases) {
      blocks.push(paragraph(uc));
    }
  } else {
    blocks.push(paragraph('(no examples found)'));
  }

  // Code section
  blocks.push(heading1('Code'));
  if (summary.code) {
    blocks.push(...codeBlocks(summary.code, summary.submissionInfo?.lang ?? 'plain text'));
  } else {
    blocks.push(paragraph('No submission found.'));
  }

  // Analysis section
  blocks.push(heading1('Analysis'));
  blocks.push(paragraph(summary.analysis || 'No analysis available.'));

  const response = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Problem: {
        title: [{ text: { content: summary.problem } }],
      },
      Link: {
        url: summary.link,
      },
      Difficulty: {
        select: { name: summary.difficulty },
      },
      Tags: {
        multi_select: summary.tags.map((tag) => ({ name: tag })),
      },
      Status: {
        select: { name: summary.status },
      },
    },
    children: blocks,
  });

  return (response as { url?: string; id: string }).url ?? response.id;
}
