"""Convert the audit Markdown sources into consistently styled Word documents.

Usage: md2docx.py SOURCE.md OUT.docx "Document title" "Subtitle"
"""
import re, sys
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor, Cm

NAVY = RGBColor(0x0A, 0x1A, 0x2F)
TEAL = RGBColor(0x0E, 0x7C, 0x74)
GREY = RGBColor(0x55, 0x60, 0x70)
SEV_FILL = {'critical': 'FDE2E2', 'high': 'FFEDD5', 'medium': 'FEF9C3', 'low': 'E0F2FE'}

src, out, title, subtitle = sys.argv[1:5]
md = open(src, encoding='utf-8').read()
for _a, _b in {'MARKETPLACE_GAP_REGISTER.md': 'Marketplace_Gap_Register.docx', 'SYSTEMS_INVENTORY.md': 'Systems_Inventory.docx',
               'ORDER_PAYMENT_REFUND_GAPS.md': 'Order_Payment_Refund_Gaps.docx', 'DESIGN_VS_SYSTEMS_BOUNDARY.md': 'Design_vs_Systems_Boundary.docx',
               'IMPLEMENTATION_ROADMAP.md': 'Implementation_Roadmap.docx'}.items():
    md = md.replace(_a, _b)

doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
for side in ('left_margin', 'right_margin'):
    setattr(sec, side, Cm(2.0))
sec.top_margin, sec.bottom_margin = Cm(2.0), Cm(2.0)

# ── Styles ────────────────────────────────────────────────────────────
st = doc.styles
st['Normal'].font.name = 'Arial'
st['Normal'].font.size = Pt(10.5)
st['Normal']._element.rPr.rFonts.set(qn('w:eastAsia'), 'Arial')
st['Normal'].paragraph_format.space_after = Pt(5)
st['Normal'].paragraph_format.line_spacing = 1.12
for lvl, size, color in ((1, 17, NAVY), (2, 13.5, NAVY), (3, 11.5, TEAL)):
    h = st[f'Heading {lvl}']
    h.font.name = 'Arial'; h.font.size = Pt(size); h.font.bold = True; h.font.color.rgb = color
    h._element.rPr.rFonts.set(qn('w:asciiTheme'), 'minorHAnsi') if False else None
    rfonts = h._element.rPr.find(qn('w:rFonts'))
    if rfonts is not None:
        for a in ('w:asciiTheme', 'w:hAnsiTheme', 'w:eastAsiaTheme', 'w:cstheme'):
            if rfonts.get(qn(a)) is not None:
                del rfonts.attrib[qn(a)]
        rfonts.set(qn('w:ascii'), 'Arial'); rfonts.set(qn('w:hAnsi'), 'Arial')
    h.paragraph_format.space_before = Pt(16 if lvl == 1 else 12 if lvl == 2 else 9)
    h.paragraph_format.space_after = Pt(6 if lvl < 3 else 4)
    h.paragraph_format.keep_with_next = True
for name in ('List Bullet', 'List Bullet 2', 'List Number'):
    st[name].font.size = Pt(10.5)
    st[name].paragraph_format.space_after = Pt(3)

def shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd'); shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto'); shd.set(qn('w:fill'), fill)
    tcPr.append(shd)

def cell_margins(table, top=60, bottom=60, left=90, right=90):
    tblPr = table._tbl.tblPr
    mar = OxmlElement('w:tblCellMar')
    for k, v in (('top', top), ('left', left), ('bottom', bottom), ('right', right)):
        e = OxmlElement(f'w:{k}'); e.set(qn('w:w'), str(v)); e.set(qn('w:type'), 'dxa'); mar.append(e)
    tblPr.append(mar)

def repeat_header(row):
    trPr = row._tr.get_or_add_trPr()
    e = OxmlElement('w:tblHeader'); e.set(qn('w:val'), 'true'); trPr.append(e)

def add_field(paragraph, instr, cached=''):
    """Insert a Word field (PAGE, NUMPAGES, TOC) with an optional cached result."""
    r1 = paragraph.add_run(); f1 = OxmlElement('w:fldChar'); f1.set(qn('w:fldCharType'), 'begin'); r1._r.append(f1)
    r2 = paragraph.add_run(); it = OxmlElement('w:instrText'); it.set(qn('xml:space'), 'preserve'); it.text = instr; r2._r.append(it)
    r3 = paragraph.add_run(); f3 = OxmlElement('w:fldChar'); f3.set(qn('w:fldCharType'), 'separate'); r3._r.append(f3)
    r4 = paragraph.add_run(cached)
    r5 = paragraph.add_run(); f5 = OxmlElement('w:fldChar'); f5.set(qn('w:fldCharType'), 'end'); r5._r.append(f5)
    return r4

# ── Inline Markdown → runs ───────────────────────────────────────────
INLINE = re.compile(r'(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*\s][^*]*\*)')

def add_inline(p, text, size=None, bold=False, color=None):
    text = text.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith('**') and part.endswith('**'):
            add_inline(p, part[2:-2], size, True, color); continue
        if part.startswith('`') and part.endswith('`'):
            r = p.add_run(part[1:-1]); r.font.name = 'Consolas'; r._element.rPr.rFonts.set(qn('w:hAnsi'), 'Consolas')
            r.font.size = Pt((size or 10.5) - 1); r.font.color.rgb = RGBColor(0x1F, 0x3A, 0x5F); r.bold = bold
            continue
        m = re.match(r'\[([^\]]+)\]\(([^)]+)\)', part)
        if m:
            label, href = m.group(1), m.group(2)
            if href.startswith('http'):
                add_hyperlink(p, label, href, size); continue
            target = href.split('#')[0]
            r = p.add_run(label); r.bold = bold; r.font.color.rgb = TEAL
            if size: r.font.size = Pt(size)
            if target.endswith('.docx') and label != target:
                r2 = p.add_run(f' ({target})'); r2.font.color.rgb = GREY
                if size: r2.font.size = Pt(size)
            continue
        if part.startswith('*') and part.endswith('*') and len(part) > 2:
            r = p.add_run(part[1:-1]); r.italic = True; r.bold = bold
            if size: r.font.size = Pt(size)
            if color: r.font.color.rgb = color
            continue
        r = p.add_run(part); r.bold = bold
        if size: r.font.size = Pt(size)
        if color: r.font.color.rgb = color

def add_hyperlink(p, text, url, size=None):
    rid = p.part.relate_to(url, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', is_external=True)
    h = OxmlElement('w:hyperlink'); h.set(qn('r:id'), rid)
    r = OxmlElement('w:r'); rPr = OxmlElement('w:rPr')
    c = OxmlElement('w:color'); c.set(qn('w:val'), '0E7C74'); rPr.append(c)
    u = OxmlElement('w:u'); u.set(qn('w:val'), 'single'); rPr.append(u)
    if size:
        s = OxmlElement('w:sz'); s.set(qn('w:val'), str(int(size * 2))); rPr.append(s)
    r.append(rPr); t = OxmlElement('w:t'); t.text = text; t.set(qn('xml:space'), 'preserve'); r.append(t); h.append(r)
    p._p.append(h)

DOCNAMES = {
    'MARKETPLACE_GAP_REGISTER.md': 'Marketplace_Gap_Register.docx',
    'SYSTEMS_INVENTORY.md': 'Systems_Inventory.docx',
    'ORDER_PAYMENT_REFUND_GAPS.md': 'Order_Payment_Refund_Gaps.docx',
    'DESIGN_VS_SYSTEMS_BOUNDARY.md': 'Design_vs_Systems_Boundary.docx',
    'IMPLEMENTATION_ROADMAP.md': 'Implementation_Roadmap.docx',
}

# ── Header / footer ──────────────────────────────────────────────────
sec.different_first_page_header_footer = True
hp = sec.header.paragraphs[0]
hp.text = ''
r = hp.add_run(f'Atlantis FMCG Marketplace  ·  {title}'); r.font.size = Pt(8.5); r.font.color.rgb = GREY
hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
fp = sec.footer.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
for txt, fld in (('Page ', 'PAGE'), (' of ', 'NUMPAGES')):
    rr = fp.add_run(txt); rr.font.size = Pt(8.5); rr.font.color.rgb = GREY
    add_field(fp, fld, '1').font.size = Pt(8.5)
rr = fp.add_run('   ·   Internal — contains security findings'); rr.font.size = Pt(8.5); rr.font.color.rgb = GREY

# ── Title page ───────────────────────────────────────────────────────
for _ in range(6):
    doc.add_paragraph()
p = doc.add_paragraph(); r = p.add_run('ATLANTIS FMCG MARKETPLACE'); r.bold = True; r.font.size = Pt(11); r.font.color.rgb = TEAL
p = doc.add_paragraph(); r = p.add_run(title); r.bold = True; r.font.size = Pt(30); r.font.color.rgb = NAVY
p = doc.add_paragraph(); r = p.add_run(subtitle); r.font.size = Pt(13); r.font.color.rgb = GREY
p = doc.add_paragraph(); p.paragraph_format.space_before = Pt(30)
meta = [('Audit date', '16 October 2026'), ('Repository branch', 'claude/atlantis-marketplace-redesign-f7878d'),
        ('Audit basis', 'Code, schema and API read at commit fae4c12; local browser and API checks'),
        ('Status', 'Findings only — transactional changes require owner approval'),
        ('Classification', 'Internal — contains security findings; do not share outside Atlantis')]
t = doc.add_table(rows=0, cols=2); t.alignment = WD_TABLE_ALIGNMENT.LEFT
for k, v in meta:
    row = t.add_row().cells
    row[0].width = Cm(4.2); row[1].width = Cm(12.5)
    a = row[0].paragraphs[0].add_run(k); a.bold = True; a.font.size = Pt(9.5); a.font.color.rgb = GREY
    b = row[1].paragraphs[0].add_run(v); b.font.size = Pt(9.5)
doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

# ── Pre-parse headings for the cached table of contents ──────────────
lines = md.split('\n')
REG = 'GAP_REGISTER' in src

def heading_text(i, ln):
    lvl = len(ln) - len(ln.lstrip('#'))
    txt = ln[lvl:].strip()
    # Register entries: "### TX-01" followed by "**Title**"
    if REG and lvl == 3 and re.match(r'^[A-Z0-9]+-\d+$', txt) and i + 1 < len(lines) and lines[i + 1].startswith('**'):
        txt = f'{txt} — {lines[i + 1].strip().strip("*")}'
    return lvl, re.sub(r'[`*]', '', re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', txt))

toc = [heading_text(i, ln) for i, ln in enumerate(lines) if re.match(r'^#{2,3} ', ln)]
toc_levels = 1 if REG else 2  # the register has 190 entries — list sections only

p = doc.add_paragraph(style='Heading 1'); p.add_run('Contents')
tp = doc.add_paragraph()
cached = '\n'.join(('    ' if lvl == 3 else '') + txt for lvl, txt in toc if lvl - 1 <= toc_levels)
add_field(tp, f'TOC \\o "1-{toc_levels}" \\h \\z \\u', '')
# Visible list for viewers that don't update fields (e.g. Google Docs): one paragraph per entry.
tp.runs[3].text = ''
first = True
for lvl, txt in toc:
    if lvl - 1 > toc_levels:
        continue
    if first:
        tp.runs[3].text = txt; first = False
    else:
        br = tp.runs[3]; br.add_break(); br.add_text(('      ' if lvl == 3 else '') + txt)
note = doc.add_paragraph(); r = note.add_run('In Microsoft Word, right-click the contents and choose “Update field” to add page numbers.')
r.italic = True; r.font.size = Pt(8.5); r.font.color.rgb = GREY
doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

# ── Body ─────────────────────────────────────────────────────────────
KV = re.compile(r'^- (?:\*\*)?([A-Z][A-Za-z &/()\-]{1,40}?)(?:\*\*)?\s*:\s*(.*)$')

def render_table(rows):
    rows = [r for r in rows if not re.match(r'^\|\s*:?-{2,}', r)]
    cells = [[c.strip() for c in r.strip().strip('|').split('|')] for r in rows]
    ncol = max(len(c) for c in cells)
    t = doc.add_table(rows=len(cells), cols=ncol); t.style = 'Table Grid'; t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell_margins(t)
    size = 9 if ncol <= 4 else 8 if ncol <= 6 else 7.5
    for i, row in enumerate(cells):
        for j in range(ncol):
            val = row[j] if j < len(row) else ''
            c = t.rows[i].cells[j]; c.paragraphs[0].paragraph_format.space_after = Pt(0)
            if i == 0:
                shade(c, '0A1A2F'); add_inline(c.paragraphs[0], val, size, True, RGBColor(0xFF, 0xFF, 0xFF))
            else:
                add_inline(c.paragraphs[0], val, size)
                if i % 2 == 0: shade(c, 'F4F6F8')
                low = re.sub(r'[*`]', '', val).strip().lower()
                if low in SEV_FILL: shade(c, SEV_FILL[low])
    repeat_header(t.rows[0])
    doc.add_paragraph().paragraph_format.space_after = Pt(2)

def render_kv(items):
    t = doc.add_table(rows=len(items), cols=2); t.style = 'Table Grid'; cell_margins(t)
    for i, (k, v, sub) in enumerate(items):
        a, b = t.rows[i].cells
        a.width = Cm(4.0); b.width = Cm(13.0)
        shade(a, 'EEF2F6'); a.paragraphs[0].paragraph_format.space_after = Pt(0)
        add_inline(a.paragraphs[0], k, 9, True, NAVY)
        bp = b.paragraphs[0]; bp.paragraph_format.space_after = Pt(0)
        add_inline(bp, v, 9)
        low = re.sub(r'[*`]', '', v).strip().lower()
        if k.lower().startswith('severity'):
            for s, fill in SEV_FILL.items():
                if low.startswith(s): shade(b, fill)
        for s in sub:
            q = b.add_paragraph(); q.paragraph_format.space_after = Pt(0); q.paragraph_format.left_indent = Cm(0.3)
            add_inline(q, '• ' + s, 9)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)

i = 0
skipped_title = False
para_buf = []

def flush_para():
    global para_buf
    if para_buf:
        p = doc.add_paragraph(); add_inline(p, ' '.join(s.strip() for s in para_buf)); para_buf = []

while i < len(lines):
    ln = lines[i]
    if not ln.strip():
        flush_para(); i += 1; continue
    if ln.startswith('# ') and not skipped_title:
        flush_para(); skipped_title = True; i += 1; continue  # the title page carries the title
    m = re.match(r'^(#{1,4}) ', ln)
    if m:
        flush_para()
        lvl, txt = heading_text(i, ln)
        if REG and lvl == 3 and ' — ' in txt and i + 1 < len(lines) and lines[i + 1].startswith('**'):
            i += 1  # title merged into the heading
        level = max(1, min(3, lvl - 1)) if lvl > 1 else 1
        hp_ = doc.add_paragraph(style=f'Heading {level}'); add_inline(hp_, txt)
        i += 1; continue
    if re.match(r'^-{3,}\s*$', ln):
        flush_para(); i += 1; continue
    if ln.startswith('|'):
        flush_para(); rows = []
        while i < len(lines) and lines[i].startswith('|'):
            rows.append(lines[i]); i += 1
        render_table(rows); continue
    if re.match(r'^\s*[-*] ', ln) or re.match(r'^\s*\d+\. ', ln):
        flush_para()
        block = []
        while i < len(lines) and (re.match(r'^\s*([-*]|\d+\.) ', lines[i]) or (lines[i].startswith('  ') and lines[i].strip() and block)):
            block.append(lines[i]); i += 1
        top = [b for b in block if re.match(r'^[-*] ', b)]
        if top and len(top) >= 2 and all(KV.match(b) for b in top):
            items = []
            for b in block:
                mm = KV.match(b) if re.match(r'^[-*] ', b) else None
                if mm: items.append([mm.group(1), mm.group(2), []])
                elif items: items[-1][2].append(re.sub(r'^\s*([-*]|\d+\.)\s+', '', b).strip())
                else:
                    # Indented items that continue the previous field (after a blank line): keep them as bullets.
                    q = doc.add_paragraph(style='List Bullet 2'); add_inline(q, re.sub(r'^\s*([-*]|\d+\.)\s+', '', b).strip())
            render_kv(items); continue
        for b in block:
            indent = len(b) - len(b.lstrip())
            numbered = re.match(r'^\s*\d+\. ', b)
            text = re.sub(r'^\s*([-*]|\d+\.)\s+', '', b).strip()
            if not re.match(r'^\s*([-*]|\d+\.) ', b):
                # continuation line of the previous item
                doc.paragraphs[-1].add_run(' '); add_inline(doc.paragraphs[-1], text); continue
            style = 'List Number' if numbered and indent == 0 else ('List Bullet 2' if indent >= 2 else 'List Bullet')
            p = doc.add_paragraph(style=style); add_inline(p, text)
        continue
    para_buf.append(ln); i += 1
flush_para()

# Ask Word to refresh fields (TOC page numbers) when the file is opened.
settings = doc.settings.element
uf = OxmlElement('w:updateFields'); uf.set(qn('w:val'), 'true'); settings.append(uf)
doc.core_properties.title = title
doc.core_properties.subject = subtitle
doc.core_properties.author = 'Atlantis marketplace audit'
doc.save(out)
print('saved', out)
