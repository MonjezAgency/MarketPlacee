/**
 * The Ali FMCG team invitation email. Transactional: it carries the one-time
 * link (the only place the raw token ever appears) and says what the role can do.
 */
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const ROLE_LABEL: Record<string, string> = {
    ADMIN: 'Admin', MODERATOR: 'Moderator', SUPPORT: 'Support', EDITOR: 'Editor', DEVELOPER: 'Developer', LOGISTICS: 'Logistics',
};

/** One line per role, in plain words. Kept in step with frontend/src/lib/admin-access.ts. */
export const ROLE_SUMMARY: Record<string, string> = {
    ADMIN: 'Runs the marketplace: orders, catalog, offers, users, finance, campaigns, settings and the team (except admins and the owner).',
    MODERATOR: 'Reviews supplier products and wholesale offers, moderates reviews and verification documents, and edits homepage content.',
    SUPPORT: 'Answers buyers and suppliers in Support HQ and can read orders, users and target prices to help them. No approvals, prices or finance.',
    EDITOR: 'Edits homepage content: banners, categories and placements on the storefront.',
    DEVELOPER: 'Technical support: Support HQ conversations and order chats.',
    LOGISTICS: 'Reads orders, updates shipping and inspections, manages hubs and freight rates, and joins order conversations.',
};

export function teamInvitationEmail(p: { name: string; role: string; inviterName: string; link: string; expiresAt: Date }) {
    const role = ROLE_LABEL[p.role] || p.role;
    const expires = p.expiresAt.toUTCString().replace(/:\d\d GMT$/, ' UTC');
    const para = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">${t}</p>`;
    const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#F6F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E6E8EC;border-radius:16px;overflow:hidden;">
<tr><td style="background:#0B1F3A;padding:22px 28px;"><span style="font-size:20px;font-weight:700;color:#FFFFFF;">Ali&nbsp;<span style="color:#2EC4B6;">FMCG</span></span><span style="float:right;font-size:12px;color:#94A3B8;line-height:28px;">Team invitation</span></td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0B1F3A;">Join the Ali FMCG team</h1>
${para(`Hi ${esc(p.name) || 'there'}, ${esc(p.inviterName)} invited you to the Ali FMCG team as <strong>${esc(role)}</strong>.`)}
${para(`<span style="color:#64748B;">${esc(ROLE_SUMMARY[p.role] || '')}</span>`)}
${para('Open the link to choose your password and activate your account. The link works once.')}
<p style="margin:18px 0 22px;"><a href="${esc(p.link)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#0B1F3A;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;">Accept invitation</a></p>
${para(`<span style="font-size:13px;color:#64748B;">This invitation expires on ${esc(expires)}. If you weren’t expecting it, ignore this email: no account is created until the link is used.</span>`)}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #E6E8EC;font-size:12px;line-height:1.6;color:#64748B;">Sent because an Ali FMCG owner or admin invited this address. It isn’t a marketing email.<br>Ali FMCG · <a href="mailto:Info@atlantisfmcg.com" style="color:#0E7C74;">Info@atlantisfmcg.com</a></td></tr>
</table></td></tr></table></body></html>`;
    return { subject: `You're invited to the Ali FMCG team (${role})`, html };
}
