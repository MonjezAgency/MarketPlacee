/**
 * Atlantis B2B Email Engine
 * Handles generation of role-based notification templates.
 */

export type EmailTemplate = 'SIGNUP_PENDING' | 'SIGNUP_APPROVED' | 'SIGNUP_REJECTED' | 'ADMIN_INVITE' | 'NEW_ORDER' | 'ORDER_SHIPPED';

interface EmailPayload {
    to: string;
    subject: string;
    body: string;
}

export const generateEmailTemplate = (type: EmailTemplate, data: any): EmailPayload => {
    const primaryColor = '#FF6B00';
    const bgColor = '#131921';

    const header = `
        <div style="background-color: ${bgColor}; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; font-family: sans-serif; margin: 0; letter-spacing: -1px;">Atlan<span style="color: ${primaryColor};">tis</span></h1>
        </div>
    `;

    const footer = `
        <div style="padding: 30px; text-align: center; color: #888; font-family: sans-serif; font-size: 12px;">
            <p>&copy; 2026 Atlantis Egypt. All rights reserved.</p>
            <p>123 Business Avenue, Cairo, Egypt</p>
        </div>
    `;

    const btnStyle = `
        display: inline-block;
        padding: 14px 30px;
        background-color: ${primaryColor};
        color: #131921;
        text-decoration: none;
        font-weight: bold;
        border-radius: 8px;
        margin-top: 20px;
        font-family: sans-serif;
    `;

    switch (type) {
        case 'SIGNUP_PENDING':
            return {
                to: data.email,
                subject: 'Registration Received - Atlantis',
                body: `
                    ${header}
                    <div style="padding: 40px; font-family: sans-serif; line-height: 1.6; color: #333; background: white;">
                        <h2 style="margin-top: 0;">Hello ${data.name},</h2>
                        <p>Thank you for registering at Atlantis. Your application for the <strong>${data.role.toUpperCase()}</strong> role has been received.</p>
                        <p>Our administration team is currently reviewing your details. This process typically takes 24-48 business hours.</p>
                        <p>We'll notify you as soon as your account is activated.</p>
                    </div>
                    ${footer}
                `
            };

        case 'SIGNUP_APPROVED':
            return {
                to: data.email,
                subject: 'Account Activated! Welcome to Atlantis',
                body: `
                    ${header}
                    <div style="padding: 40px; font-family: sans-serif; line-height: 1.6; color: #333; background: white;">
                        <h2 style="margin-top: 0; color: #108910;">Congratulations!</h2>
                        <p>Your Atlantis account has been <strong>Approved</strong>.</p>
                        <p>You now have full access to your personalized dashboard and can start ${data.role === 'supplier' ? 'listing products' : 'placing orders'}.</p>
                        <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://marketpl7ce.vercel.app'}/auth/login" style="${btnStyle}">Login to Dashboard</a>
                    </div>
                    ${footer}
                `
            };

        case 'ADMIN_INVITE':
            return {
                to: data.email,
                subject: 'You are Invited to Join Atlantis',
                body: `
                    ${header}
                    <div style="padding: 40px; font-family: sans-serif; line-height: 1.6; color: #333; background: white;">
                        <h2 style="margin-top: 0;">Exclusive Invitation</h2>
                        <p>You have been invited by an Atlantis Administrator to join our network as a <strong>${data.role.toUpperCase()}</strong>.</p>
                        <p>Click the secure link below to complete your onboarding:</p>
                        <a href="${data.inviteLink}" style="${btnStyle}">Complete Onboarding</a>
                        <p style="color: #888; font-size: 11px; margin-top: 20px;">* This link expires in 24 hours.</p>
                    </div>
                    ${footer}
                `
            };

        default:
            return {
                to: data.email,
                subject: 'Atlantis Notification',
                body: `${header}<div style="padding: 40px;">System heartbeat message.</div>${footer}`
            };
    }
};

/**
 * Placeholder for actual SMTP/AWS SES/SendGrid integration
 */
export const sendEmail = async (template: EmailTemplate, data: any) => {
    const payload = generateEmailTemplate(template, data);
    console.log(`[EMAIL_ENGINE] Sending ${template} to ${payload.to}`);
    // console.log(`[BODY]`, payload.body);

    // In a real environment, integration would happen here
    return true;
};
