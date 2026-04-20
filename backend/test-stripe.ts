import 'dotenv/config';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

async function main() {
  try {
    const currency = (process.env.DEFAULT_CURRENCY || 'eur').toLowerCase();
    console.log('[Config] STRIPE_SECRET_KEY mode:', process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' : 'TEST');
    console.log('[Config] Currency:', currency);
    console.log('[Config] Attempting to create PaymentIntent with capture_method: manual, payment_method_types: ["card"]...');

    const intent = await stripe.paymentIntents.create({
      amount: 1550, // 15.50 EUR
      currency,
      capture_method: 'manual',
      payment_method_types: ['card'],
      description: 'Test Intent for diagnostics',
    });

    console.log('\n✅ [SUCCESS] Intent Created!');
    console.log('--- Intent Configuration ---');
    console.log('ID:', intent.id);
    console.log('Amount:', intent.amount);
    console.log('Currency:', intent.currency);
    console.log('Status:', intent.status);
    console.log('Capture Method:', intent.capture_method);
    console.log('Payment Method Types:', intent.payment_method_types);
    console.log('Automatic Methods:', intent.automatic_payment_methods);
    console.log('----------------------------');
  } catch (error: any) {
    console.log('\n❌ [ERROR] Failed to create intent!');
    console.error(error.message);
  }
}

main();
