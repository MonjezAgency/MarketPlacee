/**
 * Branded HTML Email Templates for Atlantis Marketplace
 * Colors: Navy #0A1A2F, Aqua #1BC7C9, Cool Gray #F2F4F7, Dark Gray #2E2E2E
 */

export function getInvitationEmailHtml(params: {
    recipientEmail: string;
    role: string;
    inviteLink: string;
    senderName?: string;
}): string {
    const { recipientEmail, role, inviteLink, senderName } = params;
    const roleName = role === 'supplier' ? 'Supplier Partner' : 'Strategic Customer';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to Atlantis</title>
</head>
<body style="margin:0; padding:0; background-color:#F2F4F7; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F2F4F7; padding: 40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px; width:100%;">

          <!-- Logo Header -->
          <tr>
            <td style="padding: 30px 40px; text-align: center;">
              <span style="font-size: 32px; font-weight: 900; color: #0A1A2F; letter-spacing: -1px;">
                Atlan<span style="color: #1BC7C9;">tis</span>
              </span>
            </td>
          </tr>

          <!-- Hero Banner with Gradient -->
          <tr>
            <td style="padding: 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="
                    background: linear-gradient(135deg, #0A1A2F 0%, #162a44 50%, #0A1A2F 100%);
                    border-radius: 24px 24px 0 0;
                    padding: 50px 40px;
                    text-align: center;
                    position: relative;
                  ">
                    <!-- Decorative circles (using border-radius) -->
                    <div style="
                      width: 120px; height: 120px;
                      background: rgba(27,199,201,0.15);
                      border-radius: 50%;
                      position: absolute; top: -30px; right: -20px;
                    "></div>
                    <div style="
                      width: 80px; height: 80px;
                      background: rgba(27,199,201,0.1);
                      border-radius: 50%;
                      position: absolute; bottom: -20px; left: 20px;
                    "></div>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="text-align: center;">
                          <div style="
                            width: 72px; height: 72px;
                            background: linear-gradient(135deg, #1BC7C9, #17B3B5);
                            border-radius: 20px;
                            display: inline-block;
                            line-height: 72px;
                            font-size: 32px;
                            margin-bottom: 24px;
                            box-shadow: 0 8px 32px rgba(27,199,201,0.3);
                          ">✉️</div>
                          <h1 style="
                            color: #FFFFFF;
                            font-size: 28px;
                            font-weight: 900;
                            margin: 0 0 12px 0;
                            letter-spacing: -0.5px;
                          ">You've Been Invited!</h1>
                          <p style="
                            color: #B0B0C8;
                            font-size: 16px;
                            margin: 0;
                            line-height: 1.5;
                          ">Join the Atlantis B2B distribution network</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="
              background-color: #FFFFFF;
              padding: 48px 40px;
            ">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <!-- Greeting -->
                <tr>
                  <td style="padding-bottom: 24px;">
                    <p style="color: #0A1A2F; font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">
                      Welcome aboard! 🎉
                    </p>
                    <p style="color: #64748B; font-size: 15px; line-height: 1.7; margin: 0;">
                      ${senderName ? `<strong>${senderName}</strong> has` : 'An Atlantis administrator has'} invited you to join our exclusive marketplace as a <strong style="color: #1BC7C9;">${roleName}</strong>. We're building the future of B2B distribution, and we'd love to have you on board.
                    </p>
                  </td>
                </tr>

                <!-- Role Badge -->
                <tr>
                  <td style="padding-bottom: 32px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="
                          background: linear-gradient(135deg, ${role === 'supplier' ? '#1BC7C9' : '#1BC7C9'}15, ${role === 'supplier' ? '#1BC7C9' : '#1BC7C9'}08);
                          border: 1px solid ${role === 'supplier' ? '#1BC7C9' : '#1BC7C9'}30;
                          border-radius: 16px;
                          padding: 20px 24px;
                        ">
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="padding-right: 16px; vertical-align: middle;">
                                <div style="
                                  width: 48px; height: 48px;
                                  background: ${role === 'supplier' ? '#1BC7C9' : '#1BC7C9'};
                                  border-radius: 14px;
                                  text-align: center;
                                  line-height: 48px;
                                  font-size: 20px;
                                  color: white;
                                  font-weight: 900;
                                ">${role === 'supplier' ? '🏢' : '📦'}</div>
                              </td>
                              <td style="vertical-align: middle;">
                                <p style="color: #0A1A2F; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 4px 0;">Your Role</p>
                                <p style="color: ${role === 'supplier' ? '#1BC7C9' : '#1BC7C9'}; font-size: 18px; font-weight: 900; margin: 0;">${roleName}</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- CTA Button -->
                <tr>
                  <td style="padding-bottom: 32px; text-align: center;">
                    <a href="${inviteLink}" style="
                      display: inline-block;
                      padding: 18px 48px;
                      background: linear-gradient(135deg, #1BC7C9, #17B3B5);
                      color: #FFFFFF;
                      text-decoration: none;
                      border-radius: 16px;
                      font-size: 14px;
                      font-weight: 900;
                      text-transform: uppercase;
                      letter-spacing: 2px;
                      box-shadow: 0 8px 24px rgba(27,199,201,0.3);
                    ">Complete Onboarding →</a>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding-bottom: 32px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="border-top: 1px solid #F0F0F5;"></td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Features Grid -->
                <tr>
                  <td>
                    <p style="color: #0A1A2F; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 20px 0;">What You'll Get</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="50%" style="padding: 0 8px 16px 0; vertical-align: top;">
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="
                                background: #F8FAFC;
                                border-radius: 12px;
                                padding: 16px;
                                width: 100%;
                              ">
                                <p style="font-size: 20px; margin: 0 0 8px 0;">🔒</p>
                                <p style="color: #0A1A2F; font-size: 13px; font-weight: 800; margin: 0 0 4px 0;">Secure Trading</p>
                                <p style="color: #64748B; font-size: 11px; margin: 0; line-height: 1.5;">End-to-end verified transactions</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td width="50%" style="padding: 0 0 16px 8px; vertical-align: top;">
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="
                                background: #F8FAFC;
                                border-radius: 12px;
                                padding: 16px;
                                width: 100%;
                              ">
                                <p style="font-size: 20px; margin: 0 0 8px 0;">📊</p>
                                <p style="color: #0A1A2F; font-size: 13px; font-weight: 800; margin: 0 0 4px 0;">Smart Analytics</p>
                                <p style="color: #64748B; font-size: 11px; margin: 0; line-height: 1.5;">Real-time market intelligence</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td width="50%" style="padding: 0 8px 0 0; vertical-align: top;">
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="
                                background: #F8FAFC;
                                border-radius: 12px;
                                padding: 16px;
                                width: 100%;
                              ">
                                <p style="font-size: 20px; margin: 0 0 8px 0;">🚀</p>
                                <p style="color: #0A1A2F; font-size: 13px; font-weight: 800; margin: 0 0 4px 0;">Fast Deployment</p>
                                <p style="color: #64748B; font-size: 11px; margin: 0; line-height: 1.5;">Go live in minutes</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td width="50%" style="padding: 0 0 0 8px; vertical-align: top;">
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="
                                background: #F8FAFC;
                                border-radius: 12px;
                                padding: 16px;
                                width: 100%;
                              ">
                                <p style="font-size: 20px; margin: 0 0 8px 0;">💎</p>
                                <p style="color: #0A1A2F; font-size: 13px; font-weight: 800; margin: 0 0 4px 0;">Premium Network</p>
                                <p style="color: #64748B; font-size: 11px; margin: 0; line-height: 1.5;">Exclusive partner access</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer with Brand Colors -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <!-- Navy -->
                  <td style="height: 4px; background: #0A1A2F; width: 50%;"></td>
                  <!-- Aqua -->
                  <td style="height: 4px; background: #1BC7C9; width: 50%;"></td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="
              background-color: #0A1A2F;
              border-radius: 0 0 24px 24px;
              padding: 32px 40px;
              text-align: center;
            ">
              <p style="color: #B0B0C8; font-size: 12px; margin: 0 0 8px 0; line-height: 1.6;">
                This invitation was sent to <strong style="color: #FFFFFF;">${recipientEmail}</strong>
              </p>
              <p style="color: #6B6B8D; font-size: 11px; margin: 0 0 16px 0;">
                This link expires in 24 hours. If you didn't expect this email, please ignore it.
              </p>
              <p style="margin: 0;">
                <span style="font-size: 18px; font-weight: 900; color: #FFFFFF; letter-spacing: -0.5px;">
                  Atlan<span style="color: #1BC7C9;">tis</span>
                </span>
              </p>
              <p style="color: #6B6B8D; font-size: 10px; margin: 8px 0 0 0; text-transform: uppercase; letter-spacing: 2px;">
                Enterprise B2B Distribution
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
