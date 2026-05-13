'use client';

/**
 * Admin: edit the public Terms & Conditions content.
 *
 * The body is stored as a markdown string in AppConfig under three keys:
 *   TERMS_CONTENT, TERMS_VERSION, TERMS_UPDATED_AT.
 *
 * The public /terms page reads /config/terms (no auth) to render the
 * latest version. Versioning is automatic — each save bumps the version
 * stamp so we can show "Last updated …" to visitors.
 */

import * as React from 'react';
import { ScrollText, Save, Loader2, Eye } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';

export default function AdminTermsPage() {
    const [content, setContent] = React.useState('');
    const [version, setVersion] = React.useState('');
    const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [preview, setPreview] = React.useState(false);

    React.useEffect(() => {
        (async () => {
            try {
                const res = await apiFetch('/admin/config/terms');
                if (res.ok) {
                    const data = await res.json();
                    setContent(data.content || '');
                    setVersion(data.version || 'v1.0');
                    setUpdatedAt(data.updatedAt || null);
                }
            } catch (e) {
                console.error('Failed to load terms', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await apiFetch('/admin/config/terms', {
                method: 'POST',
                body: JSON.stringify({ content }),
            });
            if (res.ok) {
                const data = await res.json();
                setVersion(data.version);
                setUpdatedAt(data.updatedAt);
                toast.success(`Terms saved — ${data.version}`);
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err?.message || 'Failed to save terms');
            }
        } catch (e) {
            toast.error('Network error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="py-20 flex justify-center">
                <Loader2 className="animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                        <ScrollText size={22} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">Terms & Conditions</h1>
                        <p className="text-sm text-muted-foreground">
                            The legal content shown at <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/terms</code>. Supports Markdown.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-end">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Current version</p>
                        <p className="text-sm font-bold">{version}</p>
                        {updatedAt && (
                            <p className="text-[10px] text-muted-foreground">
                                Updated {new Date(updatedAt).toLocaleString()}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={() => setPreview(p => !p)}
                    className="h-10 px-4 rounded-xl border border-border bg-card text-sm font-bold flex items-center gap-2 hover:bg-muted"
                >
                    <Eye size={14} /> {preview ? 'Edit' : 'Preview'}
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving || !content.trim()}
                    className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-black flex items-center gap-2 disabled:opacity-50"
                >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save & bump version
                </button>
            </div>

            {preview ? (
                <article className="bg-card border border-border rounded-2xl p-8 prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
                    {content || <span className="text-muted-foreground italic">Nothing to preview yet.</span>}
                </article>
            ) : (
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={`# Atlantis Marketplace — Terms & Conditions\n\n## 1. Acceptance of Terms\nBy accessing or using …\n\n## 2. Eligibility\n…`}
                    rows={28}
                    className="w-full font-mono text-sm leading-relaxed p-6 rounded-2xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
                />
            )}

            <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 text-xs text-amber-700 leading-relaxed">
                <strong>Tip:</strong> use Markdown for structure (<code className="font-mono">#</code> headings, <code className="font-mono">-</code> lists, <code className="font-mono">**bold**</code>). Every save creates a new version stamp so visitors can tell the document has been updated.
            </div>
        </div>
    );
}
