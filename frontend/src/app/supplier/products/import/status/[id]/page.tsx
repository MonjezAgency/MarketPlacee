'use client';

import { useParams } from 'next/navigation';
import UploadStatus from '@/components/supplier/import/UploadStatus';
import { PageHeader } from '@/components/supplier/ui';
import { useLanguage } from '@/contexts/LanguageContext';

/** Upload status: what became of each row of a supplier's sheet. */
export default function UploadStatusPage() {
    const { id } = useParams<{ id: string }>();
    const { t } = useLanguage();
    return (
        <div className="space-y-5">
            <PageHeader title={t('imageUpload', 'title')} description={t('imageUpload', 'description')} />
            <UploadStatus target="supplier" id={id} />
        </div>
    );
}
