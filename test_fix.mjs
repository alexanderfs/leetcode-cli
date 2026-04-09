import { parse } from './node_modules/node-html-parser/dist/index.js';
import { marked } from './node_modules/marked/src/marked.js';

// Simulate the fixed htmlToNotionBlocks parsing
function parseHtml(html) {
  return parse(html, { blockTextElements: { script: true, noscript: true, style: true } });
}

// Test 1: code block inside list item (marked generates <pre><code> inside <li>)
const md1 = `- After:\n  \`\`\`typescript\n  dfs(i, j, grid[i][j]);\n  \`\`\``;
const html1 = marked(md1, { async: false });
console.log('Test 1 HTML:', html1);
const root1 = parseHtml(html1);
const pre1 = root1.querySelector('pre');
const code1 = pre1 ? pre1.querySelector('code') : null;
console.log('code found:', !!code1, '| lang class:', code1?.getAttribute?.('class'), '| text:', JSON.stringify(code1?.text));

// Test 2: standalone code block
const md2 = `\`\`\`typescript\ndfs(i, j, grid[i][j]);\n\`\`\``;
const html2 = marked(md2, { async: false });
const root2 = parseHtml(html2);
const pre2 = root2.querySelector('pre');
const code2 = pre2 ? pre2.querySelector('code') : null;
console.log('Test 2 - code found:', !!code2, '| lang:', code2?.getAttribute?.('class'), '| text:', JSON.stringify(code2?.text));
