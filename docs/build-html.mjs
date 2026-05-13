/**
 * Tiny markdown → HTML for our 2 docs. No external deps.
 * Handles: headings, paragraphs, ul, ol, code blocks, inline code, tables,
 * **bold**, *italic*, links. Enough for our test plan / user guide.
 *
 * Usage: node docs/build-html.mjs
 * Outputs: docs/POS-Test-Plan.html, docs/POS-User-Guide.html
 *
 * To convert to .docx: open the .html in Word → File → Save As → .docx.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join }                from 'node:path';
import { fileURLToPath }                 from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  // 1) escape HTML, 2) inline code (backticks), 3) bold, 4) italic, 5) links
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, (_, t) => `<code>${t}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

function md2html(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];

    // Fenced code
    if (/^```/.test(ln)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(ln);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    // Horizontal rule
    if (/^---+\s*$/.test(ln)) { out.push('<hr/>'); i++; continue; }

    // Table — header line | --- | --- |
    if (/^\|.*\|$/.test(ln) && /^\|[\s:|-]+\|$/.test(lines[i+1] ?? '')) {
      const head = ln.split('|').slice(1, -1).map(s => s.trim());
      const rows = [];
      i += 2;
      while (i < lines.length && /^\|.*\|$/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map(s => s.trim()));
        i++;
      }
      out.push('<table>');
      out.push(`<thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead>`);
      out.push(`<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`);
      out.push('</table>');
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(ln)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      out.push(`<ul>${items.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(ln)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push(`<ol>${items.map(x => `<li>${inline(x)}</li>`).join('')}</ol>`);
      continue;
    }

    // Blank
    if (/^\s*$/.test(ln)) { i++; continue; }

    // Paragraph (collect until blank)
    const buf = [ln];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !/^\|.*\|$/.test(lines[i]) && !/^```/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

const css = `
<style>
  body { font-family: Calibri, "Segoe UI", Arial, sans-serif; max-width: 1080px; margin: 24px auto; padding: 0 20px; color: #1f2937; }
  h1, h2, h3, h4 { color: #0f172a; }
  h1 { border-bottom: 2px solid #0f7173; padding-bottom: 6px; }
  h2 { border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-top: 28px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 16px; font-size: 13px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; }
  code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-family: Consolas, monospace; font-size: 0.92em; }
  pre { background: #f8fafc; border: 1px solid #e5e7eb; padding: 10px 12px; overflow: auto; }
  pre code { background: transparent; padding: 0; }
  hr { border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0; }
</style>`;

function build(name) {
  const md   = readFileSync(join(here, `${name}.md`), 'utf8');
  const body = md2html(md);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title>${css}</head><body>${body}</body></html>`;
  writeFileSync(join(here, `${name}.html`), html);
  console.log(`wrote ${name}.html (${html.length} bytes)`);
}

build('POS-Test-Plan');
build('POS-User-Guide');
