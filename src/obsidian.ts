import fs from 'fs';
import path from 'path';
import { parse } from 'node-html-parser';
import { marked } from 'marked';
import { getObsidianVaultPath } from './config';
import type { ProblemSummary } from './api';

// ── HTML → Markdown ───────────────────────────────────────────────────────────

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

const LANG_MAP: Record<string, string> = {
  typescript: 'typescript',
  javascript: 'javascript',
  python: 'python',
  python3: 'python',
  java: 'java',
  'c++': 'cpp',
  cpp: 'cpp',
  c: 'c',
  go: 'go',
  rust: 'rust',
  kotlin: 'kotlin',
  swift: 'swift',
  ruby: 'ruby',
  scala: 'scala',
  csharp: 'csharp',
};

function normalizeLanguage(lang: string): string {
  return LANG_MAP[lang.toLowerCase()] ?? lang.toLowerCase();
}

type InlineAnn = {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strikethrough?: boolean;
  href?: string;
};

/** Recursively render a DOM node subtree to a Markdown inline string. */
function renderInline(node: any, ann: InlineAnn = {}): string {
  if (node.nodeType === 3) {
    const text = decodeEntities(node.rawText ?? '');
    if (!text) return '';
    let out = text;
    if (ann.code) out = `\`${out}\``;
    else {
      if (ann.bold) out = `**${out}**`;
      if (ann.italic) out = `_${out}_`;
      if (ann.strikethrough) out = `~~${out}~~`;
    }
    if (ann.href) out = `[${out}](${ann.href})`;
    return out;
  }

  if (node.nodeType !== 1) return '';

  const tag: string = (node.tagName ?? '').toLowerCase();
  const childAnn: InlineAnn = { ...ann };

  switch (tag) {
    case 'strong': case 'b': childAnn.bold = true; break;
    case 'em': case 'i': childAnn.italic = true; break;
    case 'code': childAnn.code = true; break;
    case 's': case 'del': case 'strike': childAnn.strikethrough = true; break;
    case 'br': return '\n';
    case 'a': childAnn.href = node.getAttribute?.('href') ?? ann.href; break;
    case 'img': return '';
  }

  return (node.childNodes ?? []).map((c: any) => renderInline(c, childAnn)).join('');
}

/** Render a table node to a Markdown table string. */
function renderTable(tableNode: any): string {
  const rows: any[] = tableNode.querySelectorAll('tr') ?? [];
  if (rows.length === 0) return '';

  const lines: string[] = [];
  rows.forEach((tr: any, i: number) => {
    const cells: any[] = tr.querySelectorAll('td, th') ?? [];
    const row = '| ' + cells.map((c: any) => renderInline(c).replace(/\|/g, '\\|').trim()).join(' | ') + ' |';
    lines.push(row);
    if (i === 0) {
      const sep = '| ' + cells.map(() => '---').join(' | ') + ' |';
      lines.push(sep);
    }
  });
  return lines.join('\n');
}

/** Convert a single DOM node to a Markdown block string. */
function processNode(node: any, listDepth = 0, listType: 'ul' | 'ol' = 'ul', index = 0): string {
  if (node.nodeType === 3) {
    const text = decodeEntities(node.rawText ?? '').trim();
    return text ? text + '\n\n' : '';
  }

  if (node.nodeType !== 1) return '';

  const tag: string = (node.tagName ?? '').toLowerCase();

  switch (tag) {
    case 'p': {
      const text = renderInline(node).trim();
      return text ? text + '\n\n' : '';
    }

    case 'h1': return `# ${renderInline(node).trim()}\n\n`;
    case 'h2': return `## ${renderInline(node).trim()}\n\n`;
    case 'h3': return `### ${renderInline(node).trim()}\n\n`;
    case 'h4': return `#### ${renderInline(node).trim()}\n\n`;
    case 'h5': return `##### ${renderInline(node).trim()}\n\n`;
    case 'h6': return `###### ${renderInline(node).trim()}\n\n`;

    case 'ul':
    case 'ol': {
      const items: string[] = [];
      let counter = 1;
      for (const child of (node.childNodes ?? [])) {
        if (child.nodeType === 1 && (child.tagName ?? '').toLowerCase() === 'li') {
          const prefix = tag === 'ol' ? `${counter++}. ` : '- ';
          const indent = '  '.repeat(listDepth);
          const liContent = processListItem(child, listDepth + 1);
          items.push(`${indent}${prefix}${liContent}`);
        }
      }
      return items.join('') + '\n';
    }

    case 'pre': {
      const codeEl = node.querySelector('code');
      if (codeEl) {
        const rawText = decodeEntities(codeEl.text ?? '').trimEnd();
        if (!rawText) return '';
        const langClass: string = codeEl.getAttribute('class') ?? '';
        const langMatch = langClass.match(/language-(\w+)/);
        const lang = normalizeLanguage(langMatch?.[1] ?? '');
        return `\`\`\`${lang}\n${rawText}\n\`\`\`\n\n`;
      }
      // LeetCode example/IO block — render as blockquote
      const text = renderInline(node)
        .replace(/<\/?[a-zA-Z][^>]*>/g, '')
        .trim();
      if (!text) return '';
      return text.split('\n').map((l) => `> ${l}`).join('\n') + '\n\n';
    }

    case 'blockquote': {
      const inner = renderInline(node).trim();
      return inner.split('\n').map((l) => `> ${l}`).join('\n') + '\n\n';
    }

    case 'table':
      return renderTable(node) + '\n\n';

    case 'hr':
      return '---\n\n';

    default: {
      // div, section, span, etc. — recurse into children
      return (node.childNodes ?? []).map((c: any) => processNode(c, listDepth, listType, index)).join('');
    }
  }
}

/** Render a <li> node to a single inline string (with nested lists handled). */
function processListItem(li: any, depth: number): string {
  const parts: string[] = [];
  const inlineParts: string[] = [];

  for (const child of (li.childNodes ?? [])) {
    const tag = (child.tagName ?? '').toLowerCase();
    if (child.nodeType === 1 && (tag === 'ul' || tag === 'ol')) {
      if (inlineParts.length > 0) {
        parts.push(inlineParts.join('').trim());
        inlineParts.length = 0;
      }
      parts.push('\n' + processNode(child, depth));
    } else if (child.nodeType === 1 && tag === 'pre') {
      if (inlineParts.length > 0) {
        parts.push(inlineParts.join('').trim());
        inlineParts.length = 0;
      }
      parts.push('\n' + processNode(child, depth));
    } else {
      inlineParts.push(renderInline(child));
    }
  }

  if (inlineParts.length > 0) parts.push(inlineParts.join('').trim());
  return parts.join('') + '\n';
}

/** Convert an HTML string to Markdown. */
export function htmlToMarkdown(html: string): string {
  if (!html?.trim()) return '';
  const root = parse(html, { blockTextElements: { script: true, noscript: true, style: true } });
  return root.childNodes
    .map((c: any) => processNode(c))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── YAML frontmatter helpers ──────────────────────────────────────────────────

function yamlStr(value: string): string {
  // Wrap in quotes if value contains special YAML characters
  if (/[:#\[\]{},>|&*!?%@`'"\\]/.test(value) || value.includes('\n')) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

// ── Write to Obsidian vault ───────────────────────────────────────────────────

/** Sanitize a string so it can be used as a file name on most platforms. */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export async function pushToObsidian(summary: ProblemSummary): Promise<string> {
  const vaultPath = getObsidianVaultPath();
  if (!vaultPath) {
    throw new Error('Obsidian vault path not set. Run: leetcode-cli auth set --obsidian-vault <path>');
  }

  const folder = path.join(vaultPath, 'LeetCode');
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  const filename = sanitizeFilename(summary.problem) + '.md';
  const filePath = path.join(folder, filename);

  // Build YAML frontmatter
  const tagList = summary.tags.map((t) => `  - ${yamlStr(t)}`).join('\n');
  const info = summary.submissionInfo;
  const frontmatterLines = [
    '---',
    `problem: ${yamlStr(summary.problem)}`,
    `link: ${summary.link}`,
    `difficulty: ${summary.difficulty}`,
    `tags:\n${tagList || '  []'}`,
    `status: ${summary.status}`,
  ];
  if (info) {
    frontmatterLines.push(`lang: ${info.lang}`);
    frontmatterLines.push(`runtime: ${yamlStr(info.runtime)}`);
    frontmatterLines.push(`memory: ${yamlStr(info.memory)}`);
    frontmatterLines.push(`submitted_at: ${yamlStr(info.timestamp)}`);
  }
  frontmatterLines.push('---');
  const frontmatter = frontmatterLines.join('\n');

  // Description section
  let descriptionMd: string;
  if (summary.contentHtml) {
    descriptionMd = htmlToMarkdown(summary.contentHtml);
  } else {
    descriptionMd = summary.description || '(no description)';
  }

  // Code section
  let codeMd: string;
  if (summary.code) {
    const lang = normalizeLanguage(summary.submissionInfo?.lang ?? '');
    codeMd = `\`\`\`${lang}\n${summary.code}\n\`\`\``;
  } else {
    codeMd = 'No submission found.';
  }

  // Analysis section
  const analysisMd = summary.analysis?.trim() || 'No analysis available.';

  const content = [
    frontmatter,
    '',
    '## Description',
    '',
    descriptionMd,
    '',
    '## Code',
    '',
    codeMd,
    '',
    '## Analysis',
    '',
    analysisMd,
  ].join('\n');

  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}
