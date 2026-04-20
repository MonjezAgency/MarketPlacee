const nodemailer = require('nodemailer');
require('dotenv').config();

async function testSMTP() {
  const host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_PORT);
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  console.log(`[DIAGNOSTIC] Testing SMTP for ${host}:${port}`);
  console.log(`[DIAGNOSTIC] User: ${user}`);
  
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('[DIAGNOSTIC] Verifying connection...');
    await transporter.verify();
    console.log('✅ SMTP CONNECTION SUCCESSFUL');

    console.log('[DIAGNOSTIC] Attempting to send test email...');
    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Atlantis Test'}" <${process.env.EMAIL_FROM || user}>`,
      to: user, // Send to self
      subject: 'Atlantis SMTP Diagnostic Test',
      text: 'If you see this, your SMTP settings are working correctly.',
      html: '<b>If you see this, your SMTP settings are working correctly.</b>'
    });
    console.log('✅ EMAIL SENT SUCCESSFUL');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
  } catch (error) {
    console.error('❌ SMTP DIAGNOSTIC FAILED');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    console.error('Full Error:', error);
  }
}

testSMTP();
