import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load env from both .env and Railway convention
dotenv.config();

async function testEmail() {
    console.log('--- Email Diagnostic Tool ---');
    
    const host = process.env.EMAIL_HOST || 'smtp.hostinger.com';
    const port = parseInt(process.env.EMAIL_PORT || '465');
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const from = process.env.EMAIL_FROM || user;

    console.log('Config:');
    console.log('- Host:', host);
    console.log('- Port:', port);
    console.log('- User:', user ? user.substring(0, 3) + '***' : 'MISSING');
    console.log('- From:', from);

    if (!user || !pass) {
        console.error('ERROR: Missing EMAIL_USER or EMAIL_PASS');
        return;
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
    });

    console.log('\nChecking SMTP connection...');
    try {
        await transporter.verify();
        console.log('✅ SMTP Connection Successful!');
        
        console.log('\nSending test message...');
        const info = await transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'Atlantis Test'}" <${from}>`,
            to: user, // Send to self
            subject: 'Atlantis Diagnostic Test',
            text: 'This is a test email from the Atlantis Marketplace diagnostic tool.'
        });
        console.log('✅ Email Sent! MessageId:', info.messageId);
    } catch (error: any) {
        console.error('\n❌ FAILED');
        console.error('Error Code:', error.code);
        console.error('Error Message:', error.message);
        console.error('\nAnalysis:');
        if (error.code === 'EAUTH') {
            console.error('- Authentication failed. Check your password.');
        } else if (error.code === 'ETIMEDOUT') {
            console.error('- Connection timed out. Check if port ' + port + ' is open in Railway.');
        } else if (error.code === 'ESOCKET') {
            console.error('- Socket error. This often means the port is blocked or SSL/TLS mismatch.');
        }
    }
}

testEmail();
