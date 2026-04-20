import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '.env') });

async function testSMTP() {
  const host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_PORT || '465');
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const from = process.env.EMAIL_FROM || user;

  console.log(`[DIAGNOSTIC] Testing SMTP for ${host}:${port}`);
  console.log(`[DIAGNOSTIC] User: ${user}`);
  console.log(`[DIAGNOSTIC] From: ${from}`);
  
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
      from: `"Atlantis Diagnostic" <${from}>`,
      to: 'Info@atlantisfmcg.com', // Sending to the user itself or a test addr
      subject: 'Atlantis SMTP Diagnostic Test',
      text: 'If you see this, your SMTP settings are working correctly.',
      html: '<b>If you see this, your SMTP settings are working correctly.</b>'
    });
    console.log('✅ EMAIL SENT SUCCESSFUL');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
  } catch (error: any) {
    console.error('❌ SMTP DIAGNOSTIC FAILED');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    console.error('Full Error Stack:', error.stack);
  }
}

testSMTP();
