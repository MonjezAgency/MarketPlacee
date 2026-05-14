'use client';

/**
 * Bulk-upload schema preview.
 *
 * Before the supplier/admin drops a .xlsx or .csv into the upload zone,
 * we draw them a mini-spreadsheet showing exactly which columns the
 * backend importer recognises and — critically — which ones are
 * REQUIRED vs OPTIONAL. Lifted out into its own component so the same
 * preview drops cleanly onto:
 *   - /admin/products/new        (admin bulk import)
 *   - /supplier/products/new     (supplier bulk import)
 *   - /admin/products (table view bulk-import button)
 *
 * Column meta lines up with `headerAliases` in the backend's
 * ExcelService. The header label here is the canonical alias the
 * supplier should aim for, but the importer accepts dozens of
 * variations (cost / unitPrice / "price per case" all → price).
 */

import * as React from 'react';
import { AlertCircle, Info, ChevronDown, FileSpreadsheet } from 'lucide-react';

type ColumnSpec = {
    /** Canonical header name — the cleanest version of dozens of aliases. */
    header: string;
    /** Required to create a product successfully. */
    required: boolean;
    /** One-sentence explanation shown on hover. */
    blurb: string;
    /** Sample value to render inside the preview body. */
    sample: string;
    /** Optional dependency hint — "needed only if X is set". */
    dependsOn?: string;
};

const COLUMNS: ColumnSpec[] = [
    { header: 'name',            required: true,  blurb: 'Product display name.',                              sample: 'Pepsi 330ml Can' },
    { header: 'price',           required: true,  blurb: 'Per-case price in the platform currency.',           sample: '28.80' },
    { header: 'ean',             required: false, blurb: 'EAN / UPC / barcode. Helps with image lookup.',      sample: '5410188006001' },
    { header: 'category',        required: false, blurb: 'Falls back to AI auto-categorization if missing.',   sample: 'Beverages' },
    { header: 'brand',           required: false, blurb: 'Brand name shown on the PDP.',                       sample: 'Pepsi' },
    { header: 'unitsPerCase',    required: true,  blurb: 'Pieces in one case / carton.',                       sample: '24' },
    { header: 'casesPerPallet',  required: true,  blurb: 'Cases stacked on one pallet.',                       sample: '108' },
    { header: 'palletsPerTruck', required: false, blurb: 'Pallet slots in a full truck.',                      sample: '20' },
    { header: 'stock',           required: true,  blurb: 'Available stock — measured in CASES.',               sample: '120' },
    { header: 'origin',          required: false, blurb: 'Country of origin (e.g. "Germany").',                sample: 'Italy' },
    { header: 'exwLocation',     required: false, blurb: 'EXW — where the goods physically sit today.',        sample: 'Genoa' },
    { header: 'weight',          required: false, blurb: 'Weight per piece (e.g. "330g", "1.5kg").',           sample: '330g' },
    { header: 'shelfLife',       required: false, blurb: 'Expiry / best-before in months or a date string.',   sample: '12 months' },
    { header: 'description',     required: false, blurb: 'Long-form product description for the PDP.',         sample: 'Refreshing carbonated soft drink…' },
    // ── Variant columns ──────────────────────────────────────────────
    {
        header: 'variants',
        required: false,
        blurb: 'JSON or pipe-separated variant groups (e.g. "Flavour=Diet|Regular|Black"). Required if this product has multiple variants.',
        sample: 'Flavour=Diet|Regular|Black',
    },
    {
        header: 'variantPrices',
        required: false,
        blurb: 'Per-variant prices keyed by signature (e.g. "Flavour=Diet:14.50;Flavour=Regular:13.20"). Falls back to "price" when missing.',
        sample: 'Flavour=Diet:14.50;Flavour=Regular:13.20',
        dependsOn: 'variants',
    },
    {
        header: 'variantPacking',
        required: false,
        blurb: 'Per-variant pack overrides — same signature key, comma-separated u/c, c/p, p/t. Falls back to parent values.',
        sample: 'Flavour=Diet:12,108,20;Flavour=Regular:24,108,20',
        dependsOn: 'variants',
    },
];

export default function BulkUploadSchemaPreview({
    defaultOpen = false,
    title = 'Spreadsheet format — what each column means',
}: {
    defaultOpen?: boolean;
    title?: string;
}) {
    const [open, setOpen] = React.useState(defaultOpen);
    const [hovered, setHovered] = React.useState<string | null>(null);
    const requiredCount = COLUMNS.filter(c => c.required).length;
    const optionalCount = COLUMNS.length - requiredCount;

    return (
        <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
            {/* Toggle header */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-start"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                        <FileSpreadsheet size={18} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[14px] font-black text-slate-900">{title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            <span className="text-rose-600 font-bold">{requiredCount} required</span>
                            {' · '}
                            <span className="text-blue-600 font-bold">{optionalCount} optional</span>
                            {' · click to '}
                            {open ? 'hide preview' : 'preview columns before uploading'}
                        </p>
                    </div>
                </div>
                <ChevronDown
                    size={18}
                    className={`text-slate-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && (
                <div className="border-t border-slate-100 bg-slate-50/40 p-5 space-y-4">
                    {/* Legend */}
                    <div className="flex items-center gap-4 text-[11px]">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300" />
                            <span className="font-bold text-rose-700">Required</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded bg-blue-50 border border-blue-200" />
                            <span className="font-bold text-blue-700">Optional</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-slate-500">
                            <Info size={12} /> Hover any column to see what it expects
                        </span>
                    </div>

                    {/* Mini spreadsheet */}
                    <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
                        <table className="text-[11px] w-full border-collapse">
                            <thead>
                                <tr>
                                    <th className="bg-slate-100 text-slate-500 font-mono p-2 border-b border-slate-200 text-center w-10">
                                        #
                                    </th>
                                    {COLUMNS.map(col => {
                                        const isHover = hovered === col.header;
                                        return (
                                            <th
                                                key={col.header}
                                                onMouseEnter={() => setHovered(col.header)}
                                                onMouseLeave={() => setHovered(null)}
                                                className={`p-2 border-b border-slate-200 text-center font-mono font-black uppercase tracking-wider cursor-help whitespace-nowrap ${
                                                    col.required
                                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                                } ${isHover ? 'ring-2 ring-amber-300' : ''}`}
                                                title={col.blurb}
                                            >
                                                <span className="inline-flex items-center gap-1">
                                                    {col.required && <AlertCircle size={10} className="text-rose-500" />}
                                                    {col.header}
                                                </span>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {/* Sample row */}
                                <tr>
                                    <td className="bg-slate-100 text-slate-500 font-mono p-2 border-b border-slate-200 text-center">1</td>
                                    {COLUMNS.map(col => (
                                        <td
                                            key={col.header}
                                            className="p-2 border-b border-slate-100 text-center font-mono text-slate-700 whitespace-nowrap"
                                        >
                                            {col.sample}
                                        </td>
                                    ))}
                                </tr>
                                {/* Placeholder rows so the table feels like a real sheet */}
                                {[2, 3].map(r => (
                                    <tr key={r}>
                                        <td className="bg-slate-100 text-slate-400 font-mono p-2 border-b border-slate-200 text-center">{r}</td>
                                        {COLUMNS.map(col => (
                                            <td key={col.header} className="p-2 border-b border-slate-100 text-center text-slate-300 font-mono">
                                                ⋯
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Detail card for the hovered column */}
                    {hovered && (() => {
                        const col = COLUMNS.find(c => c.header === hovered);
                        if (!col) return null;
                        return (
                            <div className={`rounded-xl p-4 border ${
                                col.required
                                    ? 'bg-rose-50/60 border-rose-200'
                                    : 'bg-blue-50/60 border-blue-200'
                            }`}>
                                <p className={`text-[10px] font-black uppercase tracking-widest ${
                                    col.required ? 'text-rose-700' : 'text-blue-700'
                                }`}>
                                    {col.required ? 'Required column' : 'Optional column'}
                                </p>
                                <p className="text-[13px] font-bold text-slate-900 font-mono mt-1">{col.header}</p>
                                <p className="text-[12px] text-slate-600 leading-relaxed mt-1">{col.blurb}</p>
                                {col.dependsOn && (
                                    <p className="text-[11px] text-amber-700 font-bold mt-2">
                                        ⚡ Only meaningful if <code className="font-mono">{col.dependsOn}</code> is also set.
                                    </p>
                                )}
                            </div>
                        );
                    })()}

                    {/* Footnote */}
                    <p className="text-[11px] text-slate-500 leading-relaxed bg-white rounded-lg p-3 border border-slate-200">
                        💡 <strong>Header names are flexible.</strong> The importer recognises common
                        synonyms automatically — <code className="font-mono">cost</code>,{' '}
                        <code className="font-mono">unitPrice</code>,{' '}
                        <code className="font-mono">Price per Case</code> all map to{' '}
                        <code className="font-mono">price</code>; Arabic names work too
                        (<code className="font-mono">السعر</code>, <code className="font-mono">اسمالمنتج</code>).
                        Stick to the canonical names above for the cleanest match rate.
                    </p>
                </div>
            )}
        </div>
    );
}
