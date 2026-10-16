'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLanguage();
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div data-no-translate className="flex h-screen w-full items-center justify-center p-6 bg-red-50 text-red-900 flex-col">
      <h2 className="text-2xl font-bold mb-4">{t('supplierShell', 'errorTitle')}</h2>
      {/* Technical details stay as the runtime reports them. */}
      <pre dir="ltr" className="bg-red-100 p-4 rounded text-sm max-w-2xl overflow-auto border border-red-200 text-start">
        {error.message}
        {"\n"}
        {error.stack}
      </pre>
      <button
        className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        onClick={() => reset()}
      >
        {t('supplierShell', 'tryAgain')}
      </button>
    </div>
  );
}
