'use strict';
const config = require('./config');

// Stripe is optional. If a secret key is present we use real Stripe
// PaymentIntents; otherwise the app runs in DEMO mode and simulates an
// approved charge so the whole flow is testable end-to-end without keys.
let stripe = null;
if (config.STRIPE_SECRET_KEY) {
  try { stripe = require('stripe')(config.STRIPE_SECRET_KEY); }
  catch (e) { console.error('Stripe init failed:', e.message); }
}

const isLive = () => !!stripe;

// Create a PaymentIntent (live) or a fake client secret (demo)
async function createIntent({ amount, currency, description, metadata }) {
  if (!stripe) {
    return {
      demo: true,
      clientSecret: 'demo_secret_' + Date.now(),
      id: 'demo_pi_' + Date.now(),
      amount, currency,
    };
  }
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency,
    description,
    metadata: metadata || {},
    automatic_payment_methods: { enabled: true },
  });
  return { demo: false, clientSecret: intent.client_secret, id: intent.id, amount, currency };
}

// In demo mode we can't verify with Stripe, so we trust the client's
// "I paid" and mark it paid. In live mode you would confirm the intent
// client-side and (ideally) verify via webhook before granting access.
async function confirmDemoOrRetrieve(providerRef) {
  if (!stripe || String(providerRef).startsWith('demo_')) {
    return { paid: true, demo: true };
  }
  try {
    const pi = await stripe.paymentIntents.retrieve(providerRef);
    return { paid: pi.status === 'succeeded', status: pi.status };
  } catch (e) {
    return { paid: false, error: e.message };
  }
}

module.exports = { isLive, createIntent, confirmDemoOrRetrieve, publishableKey: config.STRIPE_PUBLISHABLE_KEY };
