'use strict';
const nodemailer = require('nodemailer');
const config = require('./config');

let transporter = null;
if (config.SMTP_HOST && config.SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });
}

// Sends an email if SMTP is configured; otherwise logs it (so the app works
// out-of-the-box in demo mode). Never throws — email is best-effort.
async function sendMail(to, subject, html) {
  const wrapped = template(subject, html);
  if (!transporter) {
    console.log(`\n📧 [EMAIL — demo mode, SMTP not configured]\n   To: ${to}\n   Subject: ${subject}\n`);
    return { demo: true };
  }
  try {
    const info = await transporter.sendMail({ from: config.MAIL_FROM, to, subject, html: wrapped });
    return { id: info.messageId };
  } catch (e) {
    console.error('Email send failed:', e.message);
    return { error: e.message };
  }
}

function template(title, body) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e6ebe8;border-radius:12px;overflow:hidden">
    <div style="background:#1f2a44;padding:20px 24px;color:#fff">
      <div style="font-size:18px;font-weight:700">${config.COMPANY_NAME}</div>
    </div>
    <div style="padding:24px;color:#222a33;font-size:15px;line-height:1.6">
      ${body}
    </div>
    <div style="padding:16px 24px;background:#f4f7f5;color:#5a6472;font-size:12px">
      ${config.COMPANY_NAME} · ${config.COMPANY_PHONE}<br>
      You have ${config.CANCEL_WINDOW_DAYS} days to cancel for a full refund.
    </div>
  </div>`;
}

// --- pre-built messages used across the app ---
const messages = {
  invitation: (name, link) => sendMail(
    (name.email || name), `You're invited to start with ${config.COMPANY_NAME}`,
    `<p>Hi ${name.first || 'there'},</p>
     <p>You've been invited to begin your credit-restoration enrollment with <b>${config.COMPANY_NAME}</b>.</p>
     <p><a href="${link}" style="background:#1f7a5a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Start my application</a></p>
     <p>It only takes a few minutes. If you have questions, call us at ${config.COMPANY_PHONE}.</p>`),

  welcome: (email, first) => sendMail(
    email, `Welcome to ${config.COMPANY_NAME}`,
    `<p>Hi ${first || 'there'},</p>
     <p>Thank you for enrolling. Your application is complete and our team is now getting to work on your file.</p>
     <p>A representative will reach out within 7 days to go over your credit.</p>`),

  paymentReceived: (email, first, amount) => sendMail(
    email, `Payment received — ${config.COMPANY_NAME}`,
    `<p>Hi ${first || 'there'},</p>
     <p>We've received your payment of <b>$${amount}</b>. Thank you!</p>
     <p>We're actively working on your file and will keep you updated.</p>`),

  monthlyRequest: (email, first, amount, link) => sendMail(
    email, `Your monthly payment is due — ${config.COMPANY_NAME}`,
    `<p>Hi ${first || 'there'},</p>
     <p>Your monthly payment of <b>$${amount}</b> is now due.</p>
     <p><a href="${link}" style="background:#1f7a5a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Make my payment</a></p>`),
};

module.exports = { sendMail, messages };
