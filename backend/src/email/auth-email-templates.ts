/**
 * Ali FMCG authentication emails: one restrained layout (navy header, teal
 * accent, system fonts) shared by verification, password reset and
 * change-email. Security emails are transactional — never marketing.
 */
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function layout(title: string, body: string, footerNote: string) {
    return `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#F6F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E6E8EC;border-radius:16px;overflow:hidden;">
<tr><td style="background:#0B1F3A;padding:22px 28px;"><span style="font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.2px;">Ali&nbsp;<span style="color:#2EC4B6;">FMCG</span></span><span style="float:right;font-size:12px;color:#94A3B8;line-height:28px;">Wholesale FMCG</span></td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0B1F3A;">${esc(title)}</h1>
${body}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #E6E8EC;font-size:12px;line-height:1.6;color:#64748B;">${footerNote}<br>Ali FMCG · <a href="mailto:Info@atlantisfmcg.com" style="color:#0E7C74;">Info@atlantisfmcg.com</a></td></tr>
</table></td></tr></table></body></html>`;
}

const p = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">${t}</p>`;
const codeBox = (code: string) => `<div style="margin:18px 0 20px;padding:18px;border-radius:12px;background:#E6F8F6;text-align:center;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:#0B1F3A;">${esc(code)}</div>`;
const button = (href: string, label: string) => `<p style="margin:18px 0 22px;"><a href="${esc(href)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#0B1F3A;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;">${esc(label)}</a></p>`;
const SECURITY = 'You received this because of a security action on your Ali FMCG account. It isn’t a marketing email.';

export function verifySignupEmail(name: string, code: string, link: string, minutes: number) {
    return {
        subject: `${code} is your Ali FMCG verification code`,
        html: layout('Verify your email', p(`Hi ${esc(name) || 'there'}, enter this code to confirm your work email and finish creating your Ali FMCG account.`)
            + codeBox(code) + p(`Or open the verification page directly:`) + button(link, 'Verify email')
            + p(`<span style="font-size:13px;color:#64748B;">The code expires in ${minutes} minutes. If you didn’t create an account, you can ignore this email.</span>`), SECURITY),
    };
}

export function emailVerifiedEmail(name: string, role: 'CUSTOMER' | 'SUPPLIER') {
    return {
        subject: 'Your Ali FMCG email is verified',
        html: layout('Email verified', p(`Hi ${esc(name) || 'there'}, your email address is confirmed.`)
            + p(role === 'SUPPLIER'
                ? 'Our team reviews new supplier accounts before products can be listed. We’ll email you when your account is approved.'
                : 'Our team reviews new business accounts before trading starts. We’ll email you when your account is approved.'), SECURITY),
    };
}

export function passwordResetEmail(name: string, link: string) {
    return {
        subject: 'Reset your Ali FMCG password',
        html: layout('Reset your password', p(`Hi ${esc(name) || 'there'}, we received a request to reset the password for your Ali FMCG account.`)
            + button(link, 'Choose a new password')
            + p(`<span style="font-size:13px;color:#64748B;">This link works once and expires in 60 minutes. If you didn’t ask for this, ignore this email — your password won’t change.</span>`), SECURITY),
    };
}

export function changeEmailCodeEmail(name: string, code: string, minutes: number) {
    return {
        subject: `${code} confirms your new Ali FMCG email`,
        html: layout('Confirm your new email', p(`Hi ${esc(name) || 'there'}, enter this code in Account settings to make this your Ali FMCG sign-in email.`)
            + codeBox(code) + p(`<span style="font-size:13px;color:#64748B;">Expires in ${minutes} minutes. If you didn’t request this, ignore it — nothing changes.</span>`), SECURITY),
    };
}

export function changeEmailNoticeEmail(name: string, newEmail: string, done: boolean) {
    return {
        subject: done ? 'Your Ali FMCG sign-in email was changed' : 'Email change requested on your Ali FMCG account',
        html: layout(done ? 'Sign-in email changed' : 'Email change requested',
            p(`Hi ${esc(name) || 'there'}, ${done ? 'the sign-in email for your Ali FMCG account was changed to' : 'someone signed in to your account asked to change its email to'} <strong>${esc(newEmail)}</strong>.`)
            + p(done ? 'If this wasn’t you, contact Ali FMCG immediately.' : 'Nothing changes unless the code sent to the new address is entered. If this wasn’t you, change your password and contact Ali FMCG.'), SECURITY),
    };
}

export function signupExistingAccountEmail(name: string, loginUrl: string, resetUrl: string) {
    return {
        subject: 'Someone tried to register with your Ali FMCG email',
        html: layout('You already have an account', p(`Hi ${esc(name) || 'there'}, someone just tried to create a new Ali FMCG account with this email address. Your existing account is unchanged.`)
            + button(loginUrl, 'Sign in') + p(`Forgot your password? <a href="${esc(resetUrl)}" style="color:#0E7C74;">Reset it here</a>.`), SECURITY),
    };
}

const FIELD_LABEL: Record<string, string> = { name: 'your name', companyName: 'company name', businessType: 'business type', country: 'country', phone: 'business phone' };

/** Onboarding (account) emails — not marketing; the user can turn them off in Settings. */
export function profileReminderEmail(name: string, step: 1 | 2, missing: string[], link: string, settingsUrl: string) {
    const list = missing.map((m) => FIELD_LABEL[m] || m);
    const left = list.length ? `Still needed: <strong>${esc(list.join(', '))}</strong>.` : '';
    const optOut = `You’re receiving this because your Ali FMCG account was created and its business profile isn’t finished. Turn off onboarding reminders in <a href="${esc(settingsUrl)}" style="color:#0E7C74;">Settings</a>.`;
    if (step === 1) {
        return {
            subject: 'Finish setting up your Ali FMCG business profile',
            html: layout('You’re almost ready', p(`Hi ${esc(name) || 'there'}, you’re almost ready to use Ali FMCG. Complete your business profile so we can give your company the right wholesale marketplace experience.`)
                + p(left) + button(link, 'Complete my profile') + p(`<span style="font-size:13px;color:#64748B;">It takes about a minute. You’ll need to sign in first.</span>`), optOut),
        };
    }
    return {
        subject: 'One step left before you can order on Ali FMCG',
        html: layout('Your profile is the last step', p(`Hi ${esc(name) || 'there'}, ordering by the pallet or truckload needs a few business details, so we know who we’re trading with and where to deliver.`)
            + p(left) + button(link, 'Finish my profile') + p(`<span style="font-size:13px;color:#64748B;">This is the last reminder we’ll send about it. Questions? Just reply to Info@atlantisfmcg.com.</span>`), optOut),
    };
}
