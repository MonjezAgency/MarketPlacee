import { NestFactory } from '@nestjs/core';
import { EmailService } from '../src/email/email.service';
import { AppModule } from '../src/app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const emailService = app.get(EmailService);

  const testEmail = process.argv[2] || 'abdelrhmanhany840@gmail.com';

  console.log(`🚀 Starting SMTP Test for: ${testEmail}`);
  
  try {
    // We'll use sendEmailOtp as a simple test
    await emailService.sendEmailOtp(testEmail, 'Test User', '123456');
    console.log('✅ Success! Test email sent via SMTP.');
  } catch (error) {
    console.error('❌ Failed! SMTP Test encountered an error:');
    console.error(error);
  } finally {
    await app.close();
  }
}

bootstrap();
