'use client';

import ImportWizard from '@/components/supplier/import/ImportWizard';

/** Products → Atlantis Catalog → Import file: the supplier import wizard, destination Atlantis Catalog. */
export default function AtlantisCatalogImportPage() {
    return <ImportWizard target="catalog" />;
}
