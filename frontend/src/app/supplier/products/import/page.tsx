'use client';

import ImportWizard from '@/components/supplier/import/ImportWizard';

/** Supplier bulk import into the supplier's own catalog (the wizard is shared with the Atlantis Catalog import). */
export default function ImportProductsPage() {
    return <ImportWizard target="supplier" />;
}
