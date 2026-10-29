'use client';

import ImportWizard from '@/components/supplier/import/ImportWizard';

/** Products → Ali FMCG Catalog → Import file: the supplier import wizard, destination Ali FMCG Catalog. */
export default function AtlantisCatalogImportPage() {
    return <ImportWizard target="catalog" />;
}
