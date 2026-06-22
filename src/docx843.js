// ═══════════════════════════════════════════════════════════════
// docx843.js — one-click Word (.docx) export for the Form 843 package
// ═══════════════════════════════════════════════════════════════
// PREREQUISITE:  npm i docx
// Runs entirely in the browser (no server)
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, Footer, PageNumber, TableLayoutType,
} from 'docx';

const FONT = 'Times New Roman';
const BODY = 24; // half-points → 12 pt (legal-filing convention)
const TBL  = 20; // 10 pt inside tables so the wide computation tables fit

// ── inline **bold** / *italic* tokenizer (our dialect: no nesting) ──
function runs(text, base = {}) {
  if (!text) return [];
  const mk = (t, extra) => new TextRun({ font: FONT, ...base, text: t, ...extra });
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(mk(text.slice(last, m.index), {}));
    const t = m[0];
    if (t.startsWith('**')) out.push(mk(t.slice(2, -2), { bold: true }));
    else out.push(mk(t.slice(1, -1), { italics: true }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(mk(text.slice(last), {}));
  return out;
}

const LINE = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE };
const isSepRow = (cells) => cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
const splitRow = (l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

function tableFromBlock(block) {
  let rows = block.map(splitRow);
  let header = null;
  if (rows.length > 1 && isSepRow(rows[1])) { header = rows[0]; rows = rows.slice(2); }
  else rows = rows.filter((r) => !isSepRow(r));
  const all = header ? [header, ...rows] : rows;
  const cols = Math.max(1, ...all.map((r) => r.length));
  const pad = (r) => { const x = [...r]; while (x.length < cols) x.push(''); return x; };
  const cell = (txt, head) => new TableCell({
    shading: head ? { fill: 'EFEFEF' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ spacing: { after: 0 }, children: runs(txt, head ? { size: TBL, bold: true } : { size: TBL }) })],
  });
  const mkRow = (r, head) => new TableRow({ tableHeader: head, children: pad(r).map((c) => cell(c, head)) });
  const trs = [];
  if (header && !header.every((c) => c === '')) trs.push(mkRow(header, true)); // skip the empty "| | |" header of the title block
  for (const r of rows) trs.push(mkRow(r, false));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.AUTOFIT, borders: BORDERS, rows: trs });
}

// Sections that should start on a fresh page in the printed packet.
const PAGE_BREAK_H1 = /^(Form 843 — Line-by-Line Entries|Practitioner Materials)/;

export function buildDocxChildren(markdown) {
  const lines = String(markdown).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\s*\|/.test(ln)) {
      const block = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { block.push(lines[i]); i++; }
      i--;
      out.push(tableFromBlock(block));
      out.push(new Paragraph({ spacing: { after: 120 }, children: [] })); // breathing room after tables
      continue;
    }
    if (/^# /.test(ln)) {
      const t = ln.slice(2);
      out.push(new Paragraph({
        pageBreakBefore: PAGE_BREAK_H1.test(t) || undefined,
        keepNext: true, spacing: { before: 240, after: 120 },
        children: runs(t, { bold: true, size: 26 }),
      }));
      continue;
    }
    if (/^## /.test(ln)) {
      out.push(new Paragraph({ keepNext: true, spacing: { before: 200, after: 100 }, children: runs(ln.slice(3), { bold: true, size: BODY }) }));
      continue;
    }
    if (/^- /.test(ln)) {
      out.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: runs(ln.slice(2), { size: BODY }) }));
      continue;
    }
    if (ln.trim() === '') continue; // paragraph spacing comes from spacing.after
    out.push(new Paragraph({ spacing: { after: 120 }, children: runs(ln, { size: BODY }) }));
  }
  return out;
}

export function buildDocx(markdown, meta = {}) {
  return new Document({
    creator: meta.creator || 'Kwong §7508A(d) computation tool',
    title: meta.title || 'Form 843 — Line 8 Statement',
    description: 'Generated attachment — verify every figure per Circular 230 § 10.22 before filing.',
    styles: { default: { document: { run: { font: FONT, size: BODY } } } },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, // 1" margins
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ size: 18, font: FONT, children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] })],
          })],
        }),
      },
      children: buildDocxChildren(markdown),
    }],
  });
}

export async function downloadForm843Docx(markdown, filename, meta = {}) {
  const blob = await Packer.toBlob(buildDocx(markdown, meta));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
