'use client';

import * as React from 'react';
import { UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

/** Spreadsheet drop zone: drag and drop, click, or keyboard. */
export function DropZone({ onFile, busy, file, hint, busyText }: { onFile: (f: File) => void; busy: boolean; file: File | null; hint?: string; busyText?: string }) {
    const { t } = useLanguage();
    const input = React.useRef<HTMLInputElement>(null);
    const [over, setOver] = React.useState(false);
    const depth = React.useRef(0);
    return (
        <div
            role="button" tabIndex={0} aria-label={t('supplierCatalog', 'dropAria')}
            onClick={() => !busy && input.current?.click()}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); input.current?.click(); } }}
            onDragEnter={(e) => { e.preventDefault(); depth.current++; setOver(true); }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDragLeave={(e) => { e.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); }}
            onDrop={(e) => { e.preventDefault(); depth.current = 0; setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) onFile(f); }}
            data-testid="import-dropzone"
            className={cn('flex flex-col items-center justify-center text-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                over ? 'border-teal bg-teal-soft' : 'border-line-strong bg-surface-2/50 hover:bg-surface-2')}>
            <input ref={input} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
            <span className="w-11 h-11 rounded-xl bg-surface ring-1 ring-line flex items-center justify-center text-teal">{busy ? <span className="w-5 h-5 border-2 border-teal border-t-transparent rounded-full animate-spin" /> : <UploadCloud size={21} />}</span>
            {busy ? <p className="text-[14px] font-medium text-heading">{busyText ?? t('supplierCatalog', 'readingFile', { file: file?.name ?? '' })}</p> : (<>
                <p className="text-[14px] font-semibold text-heading">{over ? t('supplierCatalog', 'dropToUpload') : t('supplierCatalog', 'dragOrClick')}</p>
                <p className="text-[12.5px] text-ink-3">{hint ?? t('supplierCatalog', 'dropDefaultHint')}</p>
            </>)}
        </div>
    );
}
