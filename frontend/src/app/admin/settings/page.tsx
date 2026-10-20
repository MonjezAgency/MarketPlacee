import { Suspense } from 'react';
import SettingsWorkspace from '@/components/admin/settings/SettingsWorkspace';

/** Admin → Settings. Sections are deep-linkable: /admin/settings?section=profile|password|pricing|display|countries|hubs|freight */
export default function AdminSettingsPage() {
    return (
        <Suspense fallback={null}>
            <SettingsWorkspace />
        </Suspense>
    );
}
