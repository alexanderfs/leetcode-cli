import axios from 'axios';
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { parse } from 'node-html-parser';
import { marked } from 'marked';
import { getNotionToken, getNotionDatabaseId, getProxy } from './config';
import type { ProblemSummary } from './api';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

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

// ── HTML → Notion blocks ─────────────────────────────────────────────────────

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

type Annotations = {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
};

type RichTextItem = {
  type: 'text';
  text: { content: string; link?: { url: string } };
  annotations?: Annotations;
};

function makeRichTextItems(
  raw: string,
  ann: Annotations,
  href?: string,
): RichTextItem[] {
  const content = decodeEntities(raw);
  return chunkText(content).map((chunk) => {
    const item: RichTextItem = { type: 'text', text: { content: chunk } };
    if (href) item.text.link = { url: href };
    const filteredAnn: Annotations = {};
    if (ann.bold) filteredAnn.bold = true;
    if (ann.italic) filteredAnn.italic = true;
    if (ann.code) filteredAnn.code = true;
    if (ann.strikethrough) filteredAnn.strikethrough = true;
    if (ann.underline) filteredAnn.underline = true;
    if (Object.keys(filteredAnn).length > 0) item.annotations = filteredAnn;
    return item;
  });
}

/** Recursively extract inline rich-text segments from a node subtree. */
function extractRichText(node: any, ann: Annotations = {}, href?: string): RichTextItem[] {
  const results: RichTextItem[] = [];

  if (node.nodeType === 3) {
    // Text node – rawText preserves entity strings so we decode manually
    const raw: string = node.rawText ?? '';
    if (decodeEntities(raw).trim()) {
      results.push(...makeRichTextItems(raw, ann, href));
    }
    return results;
  }

  if (node.nodeType !== 1) return results;

  const tag: string = (node.tagName ?? '').toLowerCase();
  const childAnn: Annotations = { ...ann };
  let childHref = href;

  switch (tag) {
    case 'strong': case 'b': childAnn.bold = true; break;
    case 'em': case 'i': childAnn.italic = true; break;
    case 'code': childAnn.code = true; break;
    case 's': case 'del': case 'strike': childAnn.strikethrough = true; break;
    case 'u': childAnn.underline = true; break;
    case 'br':
      results.push({ type: 'text', text: { content: '\n' } });
      return results;
    case 'a':
      childHref = node.getAttribute?.('href') ?? href;
      break;
    // Block-level tags appearing inside an inline context — just unwrap
    case 'p': case 'div': case 'span': case 'sup': case 'sub': break;
    // Skip media
    case 'img': return results;
  }

  for (const child of (node.childNodes ?? [])) {
    results.push(...extractRichText(child, childAnn, childHref));
  }

  return results;
}

function tableToNotionBlock(tableNode: any): BlockObjectRequest | null {
  const trElements: any[] = tableNode.querySelectorAll('tr') ?? [];
  if (trElements.length === 0) return null;

  let tableWidth = 0;
  for (const tr of trElements) {
    tableWidth = Math.max(tableWidth, (tr.querySelectorAll('td, th') ?? []).length);
  }
  if (tableWidth === 0) return null;

  const hasColumnHeader = (trElements[0]?.querySelectorAll('th') ?? []).length > 0;

  const rowBlocks = trElements.map((tr: any) => {
    const cellNodes: any[] = tr.querySelectorAll('td, th') ?? [];
    const cells: RichTextItem[][] = Array.from({ length: tableWidth }, (_, i) => {
      const cell = cellNodes[i];
      return cell
        ? extractRichText(cell)
        : [{ type: 'text' as const, text: { content: '' } }];
    });
    return { object: 'block' as const, type: 'table_row' as const, table_row: { cells } };
  });

  return {
    object: 'block',
    type: 'table',
    table: {
      table_width: tableWidth,
      has_column_header: hasColumnHeader,
      has_row_header: false,
      children: rowBlocks,
    },
  } as unknown as BlockObjectRequest;
}

/**
 * Convert a <li> node into one or more Notion blocks.
 * If the item contains a nested <pre><code> block, it is emitted as a
 * separate Notion code block (siblings, not children) so that the code is
 * properly formatted rather than flattened into inline text.
 */
function listItemToBlocks(
  li: any,
  listType: 'bulleted_list_item' | 'numbered_list_item',
): BlockObjectRequest[] {
  const blocks: BlockObjectRequest[] = [];
  const preNodes: any[] = [];
  const inlineNodes: any[] = [];

  for (const child of (li.childNodes ?? [])) {
    const tag = (child.tagName ?? '').toLowerCase();
    if (child.nodeType === 1 && tag === 'pre') {
      preNodes.push(child);
    } else {
      inlineNodes.push(child);
    }
  }

  // Build a virtual node containing only the inline children for rich-text extraction
  const inlineRt: any[] = [];
  for (const n of inlineNodes) {
    inlineRt.push(...extractRichText(n));
  }
  const rt = inlineRt.filter((r) => r.text.content.trim() !== '');

  if (rt.length > 0 || preNodes.length === 0) {
    const richText = rt.length > 0 ? rt : [{ type: 'text' as const, text: { content: '' } }];
    blocks.push({
      object: 'block',
      type: listType,
      [listType]: { rich_text: richText },
    } as BlockObjectRequest);
  }

  // Emit nested code blocks as siblings (Notion doesn't support block children in list items)
  for (const pre of preNodes) {
    blocks.push(...processNode(pre));
  }

  return blocks;
}

/** Convert a single DOM node to Notion block(s). */
function processNode(node: any): BlockObjectRequest[] {
  // Text node at the top level
  if (node.nodeType === 3) {
    const text = decodeEntities(node.rawText ?? '').trim();
    return text ? [paragraph(text)] : [];
  }

  if (node.nodeType !== 1) return [];

  const tag: string = (node.tagName ?? '').toLowerCase();

  switch (tag) {
    case 'p': {
      const rt = extractRichText(node);
      if (rt.length === 0 || rt.every((r) => !r.text.content.trim())) return [];
      return [{ object: 'block', type: 'paragraph', paragraph: { rich_text: rt } } as BlockObjectRequest];
    }

    case 'h1': case 'h2': {
      const rt = extractRichText(node);
      return [{ object: 'block', type: 'heading_2', heading_2: { rich_text: rt } } as BlockObjectRequest];
    }

    case 'h3': case 'h4': case 'h5': case 'h6': {
      const rt = extractRichText(node);
      return [{ object: 'block', type: 'heading_3', heading_3: { rich_text: rt } } as BlockObjectRequest];
    }

    case 'ul': {
      const items: BlockObjectRequest[] = [];
      for (const child of (node.childNodes ?? [])) {
        if (child.nodeType === 1 && (child.tagName ?? '').toLowerCase() === 'li') {
          items.push(...listItemToBlocks(child, 'bulleted_list_item'));
        }
      }
      return items;
    }

    case 'ol': {
      const items: BlockObjectRequest[] = [];
      for (const child of (node.childNodes ?? [])) {
        if (child.nodeType === 1 && (child.tagName ?? '').toLowerCase() === 'li') {
          items.push(...listItemToBlocks(child, 'numbered_list_item'));
        }
      }
      return items;
    }

    case 'pre': {
      const codeEl = node.querySelector('code');
      if (codeEl) {
        // Proper fenced code block with a <code> child
        const rawText: string = decodeEntities(codeEl.text ?? '').trimEnd();
        if (!rawText) return [];
        const langClass: string = codeEl.getAttribute('class') ?? '';
        const langMatch = langClass.match(/language-(\w+)/);
        return codeBlocks(rawText, langMatch?.[1] ?? 'plain text');
      }

      // No <code> child — this is a LeetCode example/IO block.
      // Render as a quote so bold labels like 输入：/输出：/解释： are preserved.
      const rt = extractRichText(node).map((item) => ({
        ...item,
        // Strip any residual HTML-tag-like patterns that leaked in via decoded entities
        text: { ...item.text, content: item.text.content.replace(/<\/?[a-zA-Z][^>]*>/g, '') },
      })).filter((item) => item.text.content !== '');
      if (rt.length === 0) return [];
      return [{ object: 'block', type: 'quote', quote: { rich_text: rt } } as BlockObjectRequest];
    }

    case 'table': {
      const block = tableToNotionBlock(node);
      return block ? [block] : [];
    }

    case 'blockquote': {
      const rt = extractRichText(node);
      return [{ object: 'block', type: 'quote', quote: { rich_text: rt } } as BlockObjectRequest];
    }

    case 'hr':
      return [{ object: 'block', type: 'divider', divider: {} } as BlockObjectRequest];

    default: {
      // div, section, article, span, etc. — recurse into children
      const blocks: BlockObjectRequest[] = [];
      for (const child of (node.childNodes ?? [])) {
        blocks.push(...processNode(child));
      }
      return blocks;
    }
  }
}

/** Convert a markdown string to Notion blocks via HTML. */
function markdownToNotionBlocks(md: string): BlockObjectRequest[] {
  if (!md?.trim()) return [paragraph('(no content)')];
  const html = marked(md, { async: false }) as string;
  return htmlToNotionBlocks(html);
}

/** Convert an HTML string to an array of Notion block objects. */
function htmlToNotionBlocks(html: string): BlockObjectRequest[] {
  if (!html?.trim()) return [paragraph('(no content)')];
  // Enable parsing of child elements inside <pre> so that
  // <pre><code class="language-*"> is recognised as a code block.
  const root = parse(html, { blockTextElements: { script: true, noscript: true, style: true } });
  const blocks: BlockObjectRequest[] = [];
  for (const child of root.childNodes) {
    blocks.push(...processNode(child));
  }
  return blocks.length > 0 ? blocks : [paragraph('(no content)')];
}

// ── Push to Notion ────────────────────────────────────────────────────────────

export async function pushToNotion(summary: ProblemSummary): Promise<string> {
  const token = getNotionToken();
  const databaseId = getNotionDatabaseId();

  if (!token) throw new Error('Notion token not set. Run: leetcode-cli auth set -n <token>');
  if (!databaseId) throw new Error('Notion database ID not set. Run: leetcode-cli auth set -d <id>');

  const proxyUrl = getProxy();
  const axiosConfig: Record<string, unknown> = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
  };
  if (proxyUrl) {
    axiosConfig['httpsAgent'] = new HttpsProxyAgent(proxyUrl);
    axiosConfig['proxy'] = false;
  }

  const blocks: BlockObjectRequest[] = [];

  // Description section — use structured HTML blocks when available
  blocks.push(heading1('Description'));
  if (summary.contentHtml) {
    blocks.push(...htmlToNotionBlocks(summary.contentHtml));
  } else {
    blocks.push(paragraph(summary.description || '(no description)'));
  }

  // Use Cases section
  // blocks.push(heading1('Use Cases'));
  // if (summary.useCases.length > 0) {
  //   for (const uc of summary.useCases) {
  //     blocks.push(paragraph(uc));
  //   }
  // } else {
  //   blocks.push(paragraph('(no examples found)'));
  // }

  // Code section
  blocks.push(heading1('Code'));
  if (summary.code) {
    blocks.push(...codeBlocks(summary.code, summary.submissionInfo?.lang ?? 'plain text'));
  } else {
    blocks.push(paragraph('No submission found.'));
  }

  // Analysis section
  blocks.push(heading1('Analysis'));
  if (summary.analysis) {
    blocks.push(...markdownToNotionBlocks(summary.analysis));
  } else {
    blocks.push(paragraph('No analysis available.'));
  }

  const payload = {
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
  };

  const response = await axios.post(`${NOTION_API}/pages`, payload, axiosConfig);
  return response.data?.url ?? response.data?.id ?? '(unknown)';
}
