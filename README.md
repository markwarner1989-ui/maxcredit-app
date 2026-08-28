# Max Credit Solution — CRM & Customer App

A complete, working web application built from the Scope of Work. It has **three portals in one app**:

| Portal | Who logs in | What they do |
|---|---|---|
| **Super Admin** | You / your office | See every customer, retailer & payment; manage statuses; add retailers; run monthly billing; view documents. |
| **Retailer** | Your dealers | Invite customers by email, get a shareable sign-up link, track their own customers. |
| **Customer** | The people signing up | Fill the application → pay the deposit → upload ID & SSN → e-sign → track progress. |

It runs in any web browser **and installs on Android & iOS** as an app (Progressive Web App — see the last section). It is built to deploy on **Render** in a few clicks.

---

## 1. Deploy on Render (the easy way)

You'll need a free [Render](https://render.com) account and this project pushed to a GitHub repository (or uploaded directly — see 1B).

### 1A. One-click Blueprint (recommended)
1. Put this folder in a **GitHub repository** (drag-and-drop upload works on github.com).
2. In Render, click **New + → Blueprint**.
3. Connect your repo. Render reads the included `render.yaml` and sets everything up — a web service **plus a 1 GB persistent disk** so your database and uploaded documents are never lost.
4. When it asks, set **`ADMIN_PASSWORD`** to a strong password of your choice.
5. Click **Apply**. Wait a few minutes. Your app is live at `https://your-app-name.onrender.com`.

### 1B. Manual (no blueprint)
1. Render → **New + → Web Service** → connect the repo.
2. **Build Command:** `npm install`  **Start Command:** `npm start`
3. Under **Advanced → Add Disk**: name `data`, mount path `/data`, size 1 GB.
4. Under **Environment**, add `DATA_DIR = /data` and a strong `JWT_SECRET`.
5. Create the service.

> **Important:** always attach the disk mounted at `/data`. Without it, Render wipes the database and uploaded files on every restart. The `render.yaml` route does this for you automatically.

### First login
- Go to your live URL.
- Log in as the super admin with the email/password you set (defaults: `admin@maxcreditsolution.com` / `Admin@12345`).
- **Change the password immediately** (top-right area / your account).

---

## 2. Turn on the real services (when you're ready)

The app works **out of the box in demo mode** — you can click through the entire flow, and payments/emails are simulated so you can test safely. To go live, add these in Render → your service → **Environment**:

### Payments (Stripe)
- `STRIPE_SECRET_KEY` = your Stripe secret key (`sk_live_…` or `sk_test_…`)
- `STRIPE_PUBLISHABLE_KEY` = your Stripe publishable key (`pk_live_…`)

With keys present, the customer sees a real card form and is really charged. Without keys, it's demo mode (no charge). **Test with Stripe *test* keys first.**

### Email (so customers actually get the emails)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
- Any SMTP provider works (e.g. a business Google Workspace, SendGrid, Mailgun, Amazon SES). Without these, emails are printed to the server log instead of sent.

### Credit engine (DisputeFox / Credit Cloud)
- `CREDIT_ENGINE` = `disputefox` or `creditcloud`
- `CREDIT_ENGINE_WEBHOOK` = the API/Zapier URL that should receive a customer when they finish signing. Until you set this, the hand-off is simulated (logged).

### Pricing & branding (change any time)
- `SIGNUP_FEE` (default 199), `MONTHLY_FEE` (default 199), `PLAN_MONTHS` (default 12)
- `COMPANY_NAME`, `COMPANY_PHONE`, `CANCEL_WINDOW_DAYS`
- `PUBLIC_URL` = your live URL (used inside email links), e.g. `https://your-app.onrender.com`

After changing environment variables, click **Save** — Render restarts the app automatically.

---

## 3. How it maps to the Scope of Work

- **Website login gateway** → customers/retailers log in from one place; no back-door access.
- **Retailer (dealer) side** → invite customers, shareable link, track their own.
- **Customer flow** → application → deposit → **QR/photo document upload** (on a phone the upload button opens the camera) → e-sign → status tracking.
- **Payments** → Stripe one-time deposit + monthly billing; who paid / who didn't is visible; "Run monthly billing" creates the month's charges and emails everyone.
- **Automated email** → welcome, payment-received, monthly-request messages.
- **Credit-engine bridge** → on e-sign, the customer is pushed to DisputeFox/Credit Cloud via the webhook.
- **14-day cancellation** reassurance is shown before payment and in the agreement.
- **Super admin database** → every customer, document, and payment in one dashboard.

---

## 4. Run it on your own computer (optional)

```bash
npm install
cp .env.example .env      # then edit .env if you like
npm run seed              # creates the super admin
npm start                 # open http://localhost:3000
```
Add `npm run seed -- --demo` to also create a demo retailer.

If you change the design (Tailwind classes in `public/app.js`), rebuild the stylesheet with `npm run build:css`.

---

## 5. Install as an app on Android & iOS (PWA)

Open your live URL in the phone's browser, then:
- **Android (Chrome):** menu (⋮) → **Add to Home screen / Install app**.
- **iPhone (Safari):** Share button → **Add to Home Screen**.

It gets an icon, opens full-screen, and behaves like a native app. Share the link with dealers and customers — they install the same way.

---

## 6. Please read — MVP scope, security & compliance

This is a **solid, working foundation (MVP)**, not yet a hardened, audited production system. Before taking real customer money and sensitive documents, plan for:

- **Legal/compliance review.** Credit-repair is regulated (Credit Repair Organizations Act + state law). The timing of the sign-up fee, the written agreement text, and the refund window should be reviewed by an attorney. The in-app agreement is a placeholder summary.
- **Sensitive data.** The app stores IDs and Social Security cards as uploaded files and customer data in the database. For production, add encryption at rest, access logging, backups, and a documented retention policy. Keep the Render disk private.
- **Payments.** For live Stripe, add webhook-based verification and PCI-aware handling; test thoroughly with test keys first.
- **Accounts.** Change all default passwords; consider email verification and password reset (not included in this MVP).

Happy to extend any of these — just ask.

---

*Built by Meta Creative Designer.*
