'use strict';
const config = require('./config');

// Bridge to the credit-repair processing system (DisputeFox / Credit Cloud).
// Per the Scope of Work, the CRM's job is to hand over a clean, paid, verified
// customer. This posts the customer payload to a configured webhook/API URL.
// If no URL is set it just logs (demo mode) so nothing breaks before the
// engine + method (direct API vs Zapier) are finalized.
async function syncCustomer(application) {
  const payload = {
    engine: config.CREDIT_ENGINE,
    external_id: application.id,
    first_name: application.first_name,
    last_name: application.last_name,
    email: application.email,
    phone: application.phone,
    address: application.address,
    city: application.city,
    state: application.state,
    zip: application.zip,
    dob: application.dob,
    signed_at: application.signed_at,
  };

  if (!config.CREDIT_ENGINE_WEBHOOK) {
    console.log(`\n🔗 [CREDIT ENGINE — demo mode] would sync customer ${application.id} to ${config.CREDIT_ENGINE}\n`);
    return { demo: true, ok: true };
  }
  try {
    const res = await fetch(config.CREDIT_ENGINE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error('Credit engine sync failed:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { syncCustomer };
