/**
 * Builds small, synthetic PDFs for tests (no supplier documents in the repo).
 * Each page is a list of words at x/y positions in points, y from the top.
 */
export interface Word { x: number; y: number; s: string; size?: number }
export interface Page { words?: Word[]; image?: boolean; width?: number; height?: number }

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
/** WinAnsi: € is 0x80 in the standard encoding of Helvetica. */
const enc = (s: string) => Buffer.from(esc(s).replace(/€/g, '\x80'), 'latin1').toString('latin1');

export function makePdf(pages: Page[]): Buffer {
    const objs: string[] = [];
    const add = (o: string) => { objs.push(o); return objs.length; };
    const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const img = add('<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 4 >>\nstream\n\x00\xff\xff\x00\nendstream');
    const pageIds: number[] = [];
    const pagesId = objs.length + 1 + pages.length * 2;
    for (const p of pages) {
        const w = p.width ?? 612, h = p.height ?? 792;
        let content = '';
        if (p.image) content += `q ${w} 0 0 ${h} 0 0 cm /Im1 Do Q\n`;
        for (const wd of p.words || []) content += `BT /F1 ${wd.size ?? 9} Tf 1 0 0 1 ${wd.x} ${h - wd.y} Tm (${enc(wd.s)}) Tj ET\n`;
        const c = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`);
        pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${c} 0 R /Resources << /Font << /F1 ${font} 0 R >> /XObject << /Im1 ${img} 0 R >> >> >>`));
    }
    add(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
    const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}

/** A price list like the real ones: S/N, a name that wraps over two lines, EAN, packaging, "€" apart from the amount. */
export function priceListPdf(): Buffer {
    const head: Word[] = [
        { x: 40, y: 60, s: 'DATE: 4/14/2026' },
        { x: 30, y: 100, s: 'S/N' }, { x: 90, y: 100, s: 'Product' }, { x: 220, y: 100, s: 'EAN Code' },
        { x: 300, y: 96, s: 'Pieces/' }, { x: 300, y: 104, s: 'Carton' }, { x: 360, y: 96, s: 'Cartons/' }, { x: 360, y: 104, s: 'Pallet' },
        { x: 420, y: 100, s: 'Pieces/Pallet' }, { x: 500, y: 100, s: 'Price at €' },
    ];
    const row = (y: number, sn: string, name: string[], ean: string, pc: string, cp: string, pp: string, price: string): Word[] => [
        { x: 32, y, s: sn }, ...name.map((n, i) => ({ x: 60, y: y + (i - (name.length - 1) / 2) * 7, s: n })),
        ...(ean ? [{ x: 210, y, s: ean }] : []), { x: 310, y, s: pc }, { x: 370, y, s: cp }, { x: 435, y, s: pp },
        { x: 495, y, s: '€' }, { x: 520, y, s: price },
    ];
    const p1: Word[] = [
        ...head,
        ...row(140, '1', ['Crunchy Chips Paprika 55G'], '5941143028849', '48', '72', '3,456', '0.65'),
        ...row(180, '2', ['Crunchy Chips Salt', '& Vinegar 55G'], '5941143028832', '48', '72', '3,456', '0.65'),
        ...row(220, '3', ['Crunchy Chips Cheese 55G'], '', '48', '72', '3,456', '0.65'),
        ...row(260, '4', ['Crunchy Chips Paprika 90G'], '5941143028849', '18', '72', '1,296', '0.99'),
        { x: 40, y: 320, s: 'MOQ 15 pallets mix' }, { x: 40, y: 760, s: 'Page 1 of 2' },
    ];
    const p2: Word[] = [
        ...row(80, '5', ['Crunchy Chips Chili 90G'], '5941143 028818', '18', '72', '1,296', '0.99'),
        ...row(120, '6', ['Crunchy Case Pack 90G'], '10810116128836', '18', '70', '1,296', '0.99'),
        { x: 40, y: 760, s: 'Page 2 of 2' },
    ];
    return makePdf([{ words: p1 }, { words: p2 }]);
}

/** A one-product offer sheet: "Label: ▪ value" pairs. */
export function productSheetPdf(): Buffer {
    return makePdf([{ width: 960, height: 540, words: [
        { x: 50, y: 46, s: 'Brandy - Hazel Spread 750g', size: 24 },
        { x: 50, y: 412, s: 'Quantity Pieces:' }, { x: 217, y: 412, s: '25.344' },
        { x: 347, y: 412, s: 'Pieces per Display:' }, { x: 515, y: 412, s: '192' },
        { x: 627, y: 412, s: 'Price per Piece:' }, { x: 768, y: 412, s: '4,77€' },
        { x: 50, y: 444, s: 'Quantity Pallets:' }, { x: 217, y: 444, s: '33' },
        { x: 627, y: 444, s: 'EAN-Piece:' }, { x: 765, y: 444, s: '4008400404127' },
        { x: 347, y: 444, s: 'BBD:' }, { x: 515, y: 444, s: '31.07.2027' },
    ] }]);
}
