'use client';

import * as React from 'react';
import { SupportHQ } from '@/components/admin/support/SupportHQ';

/** Admin → Support HQ. All logic lives in components/admin/support (dictionary section `adminSupport`). */
export default function SupportPage() {
    return (
        <React.Suspense fallback={null}>
            <SupportHQ />
        </React.Suspense>
    );
}
