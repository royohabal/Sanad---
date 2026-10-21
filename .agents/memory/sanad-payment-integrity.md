---
name: SANAD payment integrity
description: Product rule for demo tip statuses, provider-confirmed payments, and payroll records.
---

For SANAD, the user's preference is to keep Stripe test-only and not activate a live account. Manual test credentials work for development checkout, but Replit's current Stripe publishing flow requires live-mode credentials for production; do not present test keys as a supported production publishing setup. Employer payouts remain manually recorded payroll entries. Customer amounts and stored tip records remain in KWD. If Stripe checkout requires USD, show the server-calculated conversion before redirecting and retain the KWD amount, USD checkout amount, exchange rate, and source together. Only accept test-mode API keys and test-mode sessions/events. A demo or Stripe test-mode tip is never a real payment. A real tip must not be shown as successful until Stripe confirms it. A payroll payout marked paid means the employer recorded it; SANAD does not claim that it transferred or verified funds.

**Why:** the user requested KWD display/storage with a visible USD checkout conversion and wants to avoid live Stripe. Replit's current documentation says production publishing with Stripe requires live credentials, so test-only publishing is not a supported resolution.

**How to apply:** keep development checkout fail-closed if the rate or Stripe is unavailable; never convert without showing the signed quote first; use a test-only API key with an explicit mode guard; persist test-mode tips as demo-only; mark success only after verified test-mode Stripe status. The user approved a public demo with production checkout and webhooks disabled; keep test credentials development-only and do not enable production payments unless the user explicitly chooses live Stripe.
